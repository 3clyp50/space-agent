import assert from "node:assert/strict";
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { startServer } from "../server/server.js";

function buildAuthMessage({ challengeToken, clientNonce, serverNonce, username }) {
  return ["space-login-v1", username, clientNonce, serverNonce, challengeToken].join(":");
}

function createClientProof({ challenge, clientNonce, password, username }) {
  const saltedPassword = pbkdf2Sync(
    password,
    Buffer.from(String(challenge.salt || ""), "base64url"),
    Number(challenge.iterations),
    32,
    "sha256"
  );
  const clientKey = createHmac("sha256", saltedPassword).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const authMessage = buildAuthMessage({
    challengeToken: challenge.challengeToken,
    clientNonce,
    serverNonce: challenge.serverNonce,
    username
  });
  const clientSignature = createHmac("sha256", storedKey).update(authMessage).digest();

  return Buffer.from(clientKey.map((byte, index) => byte ^ clientSignature[index])).toString(
    "base64url"
  );
}

function createRequestClient(baseUrl) {
  let stateVersion = 0;

  return async function requestJson(pathname, options = {}) {
    const headers = {
      connection: "close",
      ...(options.headers || {})
    };

    if (stateVersion > 0) {
      headers["Space-State-Version"] = String(stateVersion);
    }

    const response = await fetch(new URL(pathname, baseUrl), {
      body: options.body,
      headers,
      method: options.method || "GET"
    });
    const responseVersion = Math.floor(
      Number(response.headers.get("Space-State-Version") || stateVersion)
    );

    if (Number.isFinite(responseVersion) && responseVersion > stateVersion) {
      stateVersion = responseVersion;
    }

    const bodyText = await response.text();

    return {
      body: bodyText ? JSON.parse(bodyText) : null,
      headers: response.headers,
      status: response.status
    };
  };
}

function readWorkerNumber(headers) {
  return Math.floor(Number(headers.get("Space-Worker") || 0));
}

async function startClusterRuntime(runtimeParamOverrides) {
  return startServer({
    runtimeParamOverrides: {
      HOST: "127.0.0.1",
      PORT: "0",
      WORKERS: "2",
      ...runtimeParamOverrides
    }
  });
}

test("clustered server keeps writes and auth visible across workers", async (testContext) => {
  await testContext.test("clustered responses expose worker numbers", async (subtest) => {
    const customwarePath = await fs.mkdtemp(path.join(os.tmpdir(), "space-cluster-workers-"));
    const runtime = await startClusterRuntime({
      CUSTOMWARE_PATH: customwarePath,
      SINGLE_USER_APP: "true"
    });

    subtest.after(async () => {
      await runtime.close();
      await fs.rm(customwarePath, { force: true, recursive: true });
    });

    const seenWorkers = new Set();

    for (let index = 0; index < 40 && seenWorkers.size < 2; index += 1) {
      const response = await fetch(new URL("/api/health", runtime.browserUrl), {
        headers: {
          connection: "close"
        }
      });
      const workerNumber = readWorkerNumber(response.headers);

      assert.equal(response.status, 200);
      assert.ok(workerNumber >= 1 && workerNumber <= 2);
      seenWorkers.add(workerNumber);
      await response.arrayBuffer();
    }

    assert.deepEqual([...seenWorkers].sort((left, right) => left - right), [1, 2]);
  });

  await testContext.test("single-user file writes read back across workers", async (subtest) => {
    const customwarePath = await fs.mkdtemp(path.join(os.tmpdir(), "space-cluster-file-"));
    const runtime = await startClusterRuntime({
      CUSTOMWARE_PATH: customwarePath,
      SINGLE_USER_APP: "true"
    });

    subtest.after(async () => {
      await runtime.close();
      await fs.rm(customwarePath, { force: true, recursive: true });
    });

    const requestJson = createRequestClient(runtime.browserUrl);

    const writeResponse = await requestJson("/api/file_write", {
      body: JSON.stringify({
        content: "clustered write test",
        path: "~/cluster.txt"
      }),
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });

    assert.equal(writeResponse.status, 200);
    assert.ok(readWorkerNumber(writeResponse.headers) >= 1);
    const fileMetadata = runtime.watchdog.getIndex("path_index")["/app/L2/user/cluster.txt"];

    assert.deepEqual(fileMetadata, {
      isDirectory: false,
      mtimeMs: fileMetadata.mtimeMs,
      sizeBytes: Buffer.byteLength("clustered write test")
    });
    assert.ok(fileMetadata.mtimeMs > 0);

    for (let index = 0; index < 6; index += 1) {
      const readResponse = await requestJson("/api/file_read", {
        body: JSON.stringify({
          path: "~/cluster.txt"
        }),
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      });

      assert.equal(readResponse.status, 200);
      assert.ok(readWorkerNumber(readResponse.headers) >= 1);
      assert.deepEqual(readResponse.body, {
        content: "clustered write test",
        encoding: "utf8",
        path: "L2/user/cluster.txt"
      });
    }
  });

  await testContext.test(
    "guest create, login challenge, login, and cookie checks work across workers",
    async (subtest) => {
      const customwarePath = await fs.mkdtemp(path.join(os.tmpdir(), "space-cluster-auth-"));
      const runtime = await startClusterRuntime({
        ALLOW_GUEST_USERS: "true",
        CUSTOMWARE_PATH: customwarePath
      });

      subtest.after(async () => {
        await runtime.close();
        await fs.rm(customwarePath, { force: true, recursive: true });
      });

      const requestJson = createRequestClient(runtime.browserUrl);

      const guestResponse = await requestJson("/api/guest_create", {
        body: "{}",
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      });

      assert.equal(guestResponse.status, 200);
      assert.ok(readWorkerNumber(guestResponse.headers) >= 1);
      assert.ok(guestResponse.body?.username);
      assert.ok(guestResponse.body?.password);

      const clientNonce = randomBytes(18).toString("base64url");
      const challengeResponse = await requestJson("/api/login_challenge", {
        body: JSON.stringify({
          clientNonce,
          username: guestResponse.body.username
        }),
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      });

      assert.equal(challengeResponse.status, 200);
      assert.ok(readWorkerNumber(challengeResponse.headers) >= 1);
      assert.ok(challengeResponse.body?.challengeToken);

      const clientProof = createClientProof({
        challenge: challengeResponse.body,
        clientNonce,
        password: guestResponse.body.password,
        username: guestResponse.body.username
      });
      const loginResponse = await requestJson("/api/login", {
        body: JSON.stringify({
          challengeToken: challengeResponse.body.challengeToken,
          clientProof
        }),
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      });
      const cookie = loginResponse.headers.get("set-cookie") || "";

      assert.equal(loginResponse.status, 200);
      assert.ok(readWorkerNumber(loginResponse.headers) >= 1);
      assert.equal(loginResponse.body?.authenticated, true);
      assert.ok(cookie.includes("space_session="));

      for (let index = 0; index < 6; index += 1) {
        const loginCheckResponse = await requestJson("/api/login_check", {
          headers: {
            cookie
          }
        });

        assert.equal(loginCheckResponse.status, 200);
        assert.ok(readWorkerNumber(loginCheckResponse.headers) >= 1);
        assert.deepEqual(loginCheckResponse.body, {
          authenticated: true,
          username: guestResponse.body.username
        });
      }
    }
  );

  await testContext.test("clustered router fences requests by state version", async (subtest) => {
    const customwarePath = await fs.mkdtemp(path.join(os.tmpdir(), "space-cluster-version-"));
    const runtime = await startClusterRuntime({
      CUSTOMWARE_PATH: customwarePath,
      SINGLE_USER_APP: "true"
    });

    subtest.after(async () => {
      await runtime.close();
      await fs.rm(customwarePath, { force: true, recursive: true });
    });

    const healthResponse = await fetch(new URL("/api/health", runtime.browserUrl));
    const healthVersion = Number(healthResponse.headers.get("Space-State-Version") || 0);
    const healthWorker = readWorkerNumber(healthResponse.headers);

    assert.equal(healthResponse.status, 200);
    assert.ok(Number.isFinite(healthVersion) && healthVersion > 0);
    assert.ok(healthWorker >= 1 && healthWorker <= 2);

    const blockedResponse = await fetch(new URL("/api/health", runtime.browserUrl), {
      headers: {
        "Space-State-Version": String(healthVersion + 1_000_000)
      }
    });

    assert.equal(blockedResponse.status, 503);
    assert.ok(readWorkerNumber(blockedResponse.headers) >= 1);
    assert.match(await blockedResponse.text(), /still synchronizing/i);
  });
});

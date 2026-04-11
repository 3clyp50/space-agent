import { createHttpError } from "../lib/customware/file_access.js";
import { rollbackLayerHistory } from "../lib/customware/git_history.js";
import { runTrackedMutation } from "../runtime/request_mutations.js";

function readPayload(context) {
  return context.body && typeof context.body === "object" && !Buffer.isBuffer(context.body)
    ? context.body
    : {};
}

function readPath(context) {
  const payload = readPayload(context);
  return String(payload.path || context.params.path || "~");
}

function readCommitHash(context) {
  const payload = readPayload(context);

  return String(
    payload.commitHash ||
      payload.commit ||
      payload.hash ||
      context.params.commitHash ||
      context.params.commit ||
      context.params.hash ||
      ""
  );
}

export async function post(context) {
  try {
    return await runTrackedMutation(context, async () =>
      rollbackLayerHistory({
        commitHash: readCommitHash(context),
        path: readPath(context),
        projectRoot: context.projectRoot,
        runtimeParams: context.runtimeParams,
        username: context.user?.username,
        watchdog: context.watchdog
      })
    );
  } catch (error) {
    throw createHttpError(error.message || "Git history rollback failed.", Number(error.statusCode) || 500);
  }
}

import { logServerStartup, startServer } from "../server/server.js";
import {
  findParamSpec,
  validateConfigValue
} from "../server/lib/utils/runtime_params.js";

const PARAM_ASSIGNMENT_PATTERN = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u;

async function setRuntimeParamOverride(projectRoot, overrides, rawName, rawValue) {
  const spec = await findParamSpec(projectRoot, rawName);
  overrides[spec.name] = validateConfigValue(spec, rawValue);
}

async function parseServeArgs(args, projectRoot) {
  const runtimeParamOverrides = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--host") {
      const hostValue = args[index + 1];
      if (hostValue === undefined) {
        throw new Error("Serve --host requires a value.");
      }

      await setRuntimeParamOverride(projectRoot, runtimeParamOverrides, "HOST", hostValue);
      index += 1;
      continue;
    }

    if (arg === "--port") {
      const portValue = args[index + 1];
      if (portValue === undefined) {
        throw new Error("Serve --port requires a value.");
      }

      await setRuntimeParamOverride(projectRoot, runtimeParamOverrides, "PORT", portValue);
      index += 1;
      continue;
    }

    const assignmentMatch = String(arg || "").match(PARAM_ASSIGNMENT_PATTERN);
    if (assignmentMatch) {
      await setRuntimeParamOverride(
        projectRoot,
        runtimeParamOverrides,
        assignmentMatch[1],
        assignmentMatch[2]
      );
      continue;
    }

    throw new Error(`Unknown serve argument: ${arg}`);
  }

  return runtimeParamOverrides;
}

export const help = {
  name: "serve",
  summary: "Start the local Space Agent server.",
  usage: [
    "node space serve",
    "node space serve --host 0.0.0.0 --port 3000",
    "node space serve PORT=0",
    "node space serve PORT=3100 WORKERS=8 ALLOW_GUEST_USERS=false"
  ],
  description:
    "Starts the local Node server that serves the browser app and proxies fetch requests. Runtime parameters may be overridden at launch with PARAM=VALUE arguments; launch arguments win over stored .env parameters, which win over process environment variables. Use node space set CUSTOMWARE_PATH <path> before creating users or groups when writable state should live outside the source checkout. Set WORKERS>1 to start a clustered HTTP worker pool with one authoritative primary process for shared filesystem and auth state.",
  options: [
    {
      flag: "--host <host>",
      description: "Alias for HOST=<host>."
    },
    {
      flag: "--port <port>",
      description: "Alias for PORT=<port>."
    }
  ],
  examples: [
    "node space serve",
    "node space serve SINGLE_USER_APP=true",
    "node space serve WORKERS=8",
    "node space set CUSTOMWARE_PATH /srv/space/customware",
    "node space serve"
  ]
};

export async function execute(context) {
  const runtimeParamOverrides = await parseServeArgs(context.args, context.projectRoot);
  const server = await startServer({
    projectRoot: context.projectRoot,
    runtimeParamEnv: context.originalEnv,
    runtimeParamOverrides
  });

  logServerStartup(server, context.projectRoot);
  return 0;
}

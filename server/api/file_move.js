import { createHttpError, moveAppPath, moveAppPaths } from "../lib/customware/file_access.js";

function readPayload(context) {
  return context.body && typeof context.body === "object" && !Buffer.isBuffer(context.body)
    ? context.body
    : {};
}

function hasBatchMove(payload) {
  return Boolean(payload) && typeof payload === "object" && Array.isArray(payload.entries);
}

export async function post(context) {
  const payload = readPayload(context);

  try {
    const options = {
      entries: payload.entries,
      fromPath: String(payload.fromPath || context.params.fromPath || ""),
      projectRoot: context.projectRoot,
      toPath: String(payload.toPath || context.params.toPath || ""),
      username: context.user?.username,
      watchdog: context.watchdog
    };
    const result = hasBatchMove(payload) ? moveAppPaths(options) : moveAppPath(options);

    if (context.watchdog && typeof context.watchdog.refresh === "function") {
      await context.watchdog.refresh();
    }

    return result;
  } catch (error) {
    throw createHttpError(error.message || "File move failed.", Number(error.statusCode) || 500);
  }
}

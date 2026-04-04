import { createHttpError, getAppPathInfo } from "../lib/customware/file_access.js";

function readPayload(context) {
  return context.body && typeof context.body === "object" && !Buffer.isBuffer(context.body)
    ? context.body
    : {};
}

function readPath(context) {
  const payload = readPayload(context);
  return String(payload.path || context.params.path || "");
}

function handleInfo(context) {
  try {
    return getAppPathInfo({
      path: readPath(context),
      projectRoot: context.projectRoot,
      username: context.user?.username,
      watchdog: context.watchdog
    });
  } catch (error) {
    throw createHttpError(error.message || "File info failed.", Number(error.statusCode) || 500);
  }
}

export function get(context) {
  return handleInfo(context);
}

export function post(context) {
  return handleInfo(context);
}

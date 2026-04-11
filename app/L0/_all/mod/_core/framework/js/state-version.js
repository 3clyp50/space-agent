export const STATE_VERSION_HEADER = "Space-State-Version";

let currentStateVersion = 0;

function normalizeStateVersion(value) {
  const normalizedValue = Math.floor(Number(value));
  return Number.isFinite(normalizedValue) && normalizedValue >= 0 ? normalizedValue : 0;
}

export function getCurrentStateVersion() {
  return currentStateVersion;
}

export function observeStateVersion(value) {
  const normalizedVersion = normalizeStateVersion(value);

  if (normalizedVersion > currentStateVersion) {
    currentStateVersion = normalizedVersion;
  }

  return currentStateVersion;
}

export function applyStateVersionRequestHeader(headers) {
  const normalizedVersion = getCurrentStateVersion();

  if (!(headers instanceof Headers) || normalizedVersion <= 0 || headers.has(STATE_VERSION_HEADER)) {
    return headers;
  }

  headers.set(STATE_VERSION_HEADER, String(normalizedVersion));
  return headers;
}

export function observeStateVersionFromResponse(response) {
  if (!response || !response.headers || typeof response.headers.get !== "function") {
    return currentStateVersion;
  }

  return observeStateVersion(response.headers.get(STATE_VERSION_HEADER));
}

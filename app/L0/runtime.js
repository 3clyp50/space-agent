import { createApiClient } from "./core/api-client.js";
import { downloadProxiedFile } from "./core/download.js";
import { installFetchProxy } from "./core/fetch-proxy.js";
import { buildProxyUrl, isProxyableExternalUrl } from "./core/proxy-url.js";

function createUnavailableAttachmentRuntime() {
  const unavailable = async () => {
    throw new Error("Chat attachments are not available on this page.");
  };

  const runtime = {
    all() {
      return [];
    },
    clear() {},
    current() {
      return [];
    },
    forgetMessage() {},
    forMessage() {
      return [];
    },
    get() {
      return null;
    },
    list() {
      return [];
    },
    rememberMessageAttachments() {
      return [];
    },
    setActiveMessage() {
      return [];
    },
    arrayBuffer: unavailable,
    dataUrl: unavailable,
    json: unavailable,
    text: unavailable
  };

  Object.defineProperty(runtime, "activeMessageId", {
    get() {
      return "";
    }
  });

  return runtime;
}

function createCurrentChatRuntime() {
  return {
    attachments: createUnavailableAttachmentRuntime(),
    messages: []
  };
}

function publishRuntime(targetWindow, runtime) {
  if (!targetWindow) {
    return;
  }

  try {
    targetWindow.A1 = runtime;
  } catch (error) {
    // Ignore inaccessible window targets.
  }
}

export function initializeRuntime(options = {}) {
  const apiBasePath = options.apiBasePath || "/api";
  const proxyPath = options.proxyPath || "/api/proxy";

  installFetchProxy({ proxyPath });
  const api = createApiClient({ basePath: apiBasePath });

  const runtime = {
    api,
    apiBasePath,
    currentChat: createCurrentChatRuntime(),
    proxyPath,
    fetchExternal(targetUrl, init) {
      return window.fetch(targetUrl, init);
    },
    proxy: {
      isExternal(targetUrl) {
        return isProxyableExternalUrl(targetUrl);
      },
      buildUrl(targetUrl, proxyOptions = {}) {
        return buildProxyUrl(targetUrl, {
          proxyPath,
          ...proxyOptions
        });
      }
    },
    download(targetUrl, downloadOptions = {}) {
      return downloadProxiedFile(targetUrl, {
        proxyPath,
        ...downloadOptions
      });
    }
  };

  publishRuntime(window, runtime);
  publishRuntime(window.parent, runtime);
  publishRuntime(window.top, runtime);
  return runtime;
}

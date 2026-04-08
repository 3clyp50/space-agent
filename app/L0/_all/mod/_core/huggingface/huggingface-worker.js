import { normalizeHuggingFaceModelInput, normalizeMaxNewTokens } from "/mod/_core/huggingface/helpers.js";
import { WORKER_INBOUND, WORKER_OUTBOUND } from "/mod/_core/huggingface/protocol.js";

let runtimeModulePromise = null;
let generator = null;
let tokenizer = null;
let currentGenerateRequestId = "";
let currentLoadRequestId = "";
let currentModelId = "";
let currentDtype = "";
let currentStopper = null;

function postMessageToHost(type, payload = {}) {
  self.postMessage({ payload, type });
}

function postTrace(stage, details = {}) {
  postMessageToHost(WORKER_OUTBOUND.TRACE, {
    currentDtype,
    currentModelId,
    stage,
    timestamp: Date.now(),
    ...details
  });
}

function createWorkerError(message, extra = {}) {
  const error = new Error(message);
  Object.assign(error, extra);
  return error;
}

function serializeError(error) {
  if (error instanceof Error) {
    const { cause, code, message, name, stack, ...details } = error;
    return {
      code: code ?? null,
      details,
      message,
      name: name || "Error",
      stack: stack || "",
      cause: cause == null ? null : String(cause)
    };
  }

  return {
    code: null,
    details: {},
    message: String(error || "Unknown worker error"),
    name: typeof error,
    stack: ""
  };
}

function logWorkerConsoleError(label, error, details = {}) {
  forwardWorkerConsoleError(`[huggingface-worker] ${label}`, {
    ...details,
    serialized: serializeError(error)
  }, error);
  console.error(`[huggingface-worker] ${label}`, {
    ...details,
    serialized: serializeError(error)
  }, error);
}

function serializeConsoleArg(value) {
  if (value instanceof Error) {
    return {
      kind: "error",
      value: serializeError(value)
    };
  }

  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return {
      items: value.slice(0, 12).map((entry) => serializeConsoleArg(entry)),
      kind: "array",
      length: value.length
    };
  }

  if (typeof value === "object") {
    const summary = {
      kind: value.constructor?.name || "object"
    };

    if ("message" in value && value.message != null) {
      summary.message = String(value.message);
    }

    if ("name" in value && value.name != null) {
      summary.name = String(value.name);
    }

    if ("type" in value && value.type != null) {
      summary.type = String(value.type);
    }

    if ("reason" in value && value.reason != null) {
      summary.reason = serializeConsoleArg(value.reason);
    }

    if ("filename" in value && value.filename != null) {
      summary.filename = String(value.filename);
    }

    if ("lineno" in value && value.lineno != null) {
      summary.lineno = Number(value.lineno);
    }

    if ("colno" in value && value.colno != null) {
      summary.colno = Number(value.colno);
    }

    const ownEntries = Object.entries(value).slice(0, 12);
    if (ownEntries.length) {
      summary.entries = Object.fromEntries(
        ownEntries.map(([key, entryValue]) => [key, serializeConsoleArg(entryValue)])
      );
    }

    return summary;
  }

  return String(value);
}

function forwardWorkerConsoleError(...args) {
  try {
    postMessageToHost(WORKER_OUTBOUND.CONSOLE_ERROR, {
      args: args.map((arg) => serializeConsoleArg(arg)),
      currentDtype,
      currentModelId,
      loadRequestId: currentLoadRequestId,
      timestamp: Date.now()
    });
  } catch {
    // Do not let logging failures mask the original worker error.
  }
}

function postWorkerError(type, error, details = {}) {
  const requestId = String(details.requestId || crypto.randomUUID());
  logWorkerConsoleError(type, error, details);
  postMessageToHost(type, {
    error: serializeError(error),
    requestId
  });
}

function normalizeProgressValue(report = {}) {
  const loaded = Number(report.loaded);
  const total = Number(report.total);
  if (Number.isFinite(loaded) && Number.isFinite(total) && total > 0) {
    return Math.max(0, Math.min(1, loaded / total));
  }

  const directProgress = Number(report.progress);
  if (Number.isFinite(directProgress) && directProgress > 1) {
    return Math.max(0, Math.min(1, directProgress / 100));
  }

  if (Number.isFinite(directProgress) && directProgress >= 0) {
    return Math.max(0, Math.min(1, directProgress));
  }

  return 0;
}

function normalizeProgressStatus(report = {}) {
  const rawStatus = String(report.status || "").trim().toLowerCase();

  if (rawStatus === "progress") {
    return "download";
  }

  if (rawStatus === "done") {
    return "done";
  }

  if (rawStatus === "ready") {
    return "ready";
  }

  return rawStatus || "loading";
}

function resolveProgressSource(report = {}, modelId = "") {
  const name = String(report.name || "").trim();
  const file = String(report.file || "").trim();
  return file || name || modelId || "model";
}

function formatProgressBytes(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return "";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = numericValue;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const digits = size >= 100 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

function formatProgressDetail(report = {}) {
  const loaded = Number(report.loaded);
  const total = Number(report.total);

  if (Number.isFinite(loaded) && Number.isFinite(total) && total > 0) {
    return `${formatProgressBytes(loaded)} / ${formatProgressBytes(total)}`;
  }

  const normalizedProgress = normalizeProgressValue(report);
  if (Number.isFinite(normalizedProgress) && normalizedProgress > 0) {
    return `${Math.round(normalizedProgress * 100)}%`;
  }

  return "";
}

function formatProgressStepId(report = {}, modelId = "") {
  const status = normalizeProgressStatus(report);
  const source = resolveProgressSource(report, modelId);
  return `${status}:${source}`;
}

function formatProgressStep(report = {}, modelId = "") {
  const status = normalizeProgressStatus(report);
  const source = resolveProgressSource(report, modelId);
  const detail = formatProgressDetail(report);
  let label = "";

  if (status === "download") {
    label = `Downloading ${source}`;
  }

  if (!label && status === "done") {
    label = `Finished ${source}`;
  }

  if (!label && status === "ready") {
    label = "Preparing runtime";
  }

  if (!label && (status === "initiate" || status === "init")) {
    label = `Starting ${source}`;
  }

  if (!label && status === "loading") {
    label = `Loading ${source}`;
  }

  if (!label) {
    label = `${status.charAt(0).toUpperCase()}${status.slice(1)} ${source}`.trim();
  }

  return detail ? `${label} (${detail})` : label;
}

function extractFirstSequenceLength(inputIds) {
  if (!inputIds) {
    return 0;
  }

  if (Array.isArray(inputIds)) {
    if (Array.isArray(inputIds[0])) {
      return inputIds[0].length;
    }

    return inputIds.length;
  }

  if (typeof inputIds.tolist === "function") {
    return extractFirstSequenceLength(inputIds.tolist());
  }

  if (Array.isArray(inputIds.dims) && inputIds.dims.length >= 2) {
    return Number(inputIds.dims.at(-1) || 0);
  }

  return 0;
}

function extractFirstSequence(outputIds) {
  if (!outputIds) {
    return [];
  }

  if (Array.isArray(outputIds)) {
    if (Array.isArray(outputIds[0])) {
      return [...outputIds[0]];
    }

    return [...outputIds];
  }

  if (typeof outputIds.tolist === "function") {
    return extractFirstSequence(outputIds.tolist());
  }

  return [];
}

function buildFallbackPrompt(messages = []) {
  const lines = [];

  for (const message of Array.isArray(messages) ? messages : []) {
    const role = message?.role === "assistant" ? "assistant" : message?.role === "system" ? "system" : "user";
    const content = String(message?.content || "").trim();

    if (!content) {
      continue;
    }

    lines.push(`${role}: ${content}`);
  }

  lines.push("assistant:");
  return lines.join("\n\n");
}

async function ensureRuntimeModule() {
  if (!runtimeModulePromise) {
    runtimeModulePromise = import("/mod/_core/huggingface/transformers.js");
  }

  return runtimeModulePromise;
}

async function prepareInputs(messages = []) {
  if (!tokenizer) {
    throw new Error("Load a model before sending a chat message.");
  }

  if (typeof tokenizer.apply_chat_template === "function") {
    try {
      const inputs = tokenizer.apply_chat_template(messages, {
        add_generation_prompt: true,
        return_dict: true
      });
      const promptTokenCount = extractFirstSequenceLength(inputs?.input_ids);

      if (promptTokenCount > 0) {
        return {
          inputs,
          promptTokenCount
        };
      }
    } catch {
      // Fall back to plain prompt formatting when the tokenizer lacks a usable chat template.
    }
  }

  const promptText = buildFallbackPrompt(messages);
  const inputs = await tokenizer(promptText, {
    return_dict: true
  });

  return {
    inputs,
    promptTokenCount: extractFirstSequenceLength(inputs?.input_ids)
  };
}

async function handleLoadModel(payload = {}) {
  const requestId = String(payload.requestId || crypto.randomUUID());

  if (currentGenerateRequestId) {
    postWorkerError(
      WORKER_OUTBOUND.LOAD_ERROR,
      createWorkerError("Stop the current generation before loading another model."),
      {
        activeModelId: currentModelId,
        dtype: payload.dtype,
        modelInput: payload.modelInput,
        requestId
      }
    );
    return;
  }

  const modelId = normalizeHuggingFaceModelInput(payload.modelId || payload.modelInput);
  const dtype = String(payload.dtype || "").trim() || "q4";

  if (!modelId) {
    postWorkerError(
      WORKER_OUTBOUND.LOAD_ERROR,
      createWorkerError("Enter a Hugging Face model id or Hub URL."),
      {
        dtype,
        modelInput: payload.modelInput,
        requestId
      }
    );
    return;
  }

  currentLoadRequestId = requestId;
  generator = null;
  tokenizer = null;
  currentModelId = "";
  currentDtype = "";

  try {
    postTrace("load:start", {
      dtype,
      modelId,
      requestId
    });
    postTrace("runtime-import:start", {
      requestId
    });
    const runtimeModule = await ensureRuntimeModule();
    postTrace("runtime-import:done", {
      requestId
    });
    const { pipeline } = runtimeModule;
    const progress_callback = (report) => {
      if (currentLoadRequestId !== requestId) {
        return;
      }

      postMessageToHost(WORKER_OUTBOUND.LOAD_PROGRESS, {
        report: {
          file: String(report?.file || ""),
          loaded: Number(report?.loaded || 0),
          name: String(report?.name || modelId),
          progress: normalizeProgressValue(report),
          status: normalizeProgressStatus(report),
          stepId: formatProgressStepId(report, modelId),
          stepLabel: formatProgressStep(report, modelId),
          total: Number(report?.total || 0)
        },
        requestId
      });
    };

    postTrace("pipeline-load:start", {
      modelId,
      requestId
    });
    generator = await pipeline("text-generation", modelId, {
      device: "webgpu",
      dtype,
      progress_callback
    });
    tokenizer = generator?.tokenizer || null;
    postTrace("pipeline-load:done", {
      dtype,
      modelId,
      requestId
    });

    if (currentLoadRequestId !== requestId) {
      return;
    }

    currentModelId = modelId;
    currentDtype = dtype;

    postMessageToHost(WORKER_OUTBOUND.LOAD_COMPLETE, {
      dtype,
      modelId,
      requestId
    });
    return;
  } catch (error) {
    generator = null;
    tokenizer = null;
    currentModelId = "";
    currentDtype = "";

    postWorkerError(WORKER_OUTBOUND.LOAD_ERROR, error, {
      dtype,
      modelId,
      requestId
    });
  } finally {
    currentLoadRequestId = "";
  }
}

async function handleRunChat(payload = {}) {
  const requestId = String(payload.requestId || crypto.randomUUID());

  if (!tokenizer || !generator || !currentModelId) {
    postWorkerError(
      WORKER_OUTBOUND.CHAT_ERROR,
      createWorkerError("Load a model before sending a chat message."),
      {
        activeModelId: currentModelId,
        messageCount: Array.isArray(payload.messages) ? payload.messages.length : 0,
        requestId
      }
    );
    return;
  }

  if (currentLoadRequestId) {
    postWorkerError(
      WORKER_OUTBOUND.CHAT_ERROR,
      createWorkerError("Wait for the current model load to finish before sending a message."),
      {
        activeModelId: currentModelId,
        requestId
      }
    );
    return;
  }

  if (currentGenerateRequestId) {
    postWorkerError(
      WORKER_OUTBOUND.CHAT_ERROR,
      createWorkerError("A generation is already running."),
      {
        activeModelId: currentModelId,
        requestId
      }
    );
    return;
  }

  currentGenerateRequestId = requestId;

  try {
    const runtimeModule = await ensureRuntimeModule();
    const { StoppingCriteria, TextStreamer } = runtimeModule;
    const { promptTokenCount } = await prepareInputs(payload.messages);
    const startedAt = performance.now();
    let timeToFirstTokenMs = null;
    let streamedText = "";

    class WorkerStoppingCriteria extends StoppingCriteria {
      interrupted = false;

      interrupt() {
        this.interrupted = true;
      }

      _call(input_ids) {
        return new Array(Array.isArray(input_ids) ? input_ids.length : 1).fill(this.interrupted);
      }
    }

    class WorkerTextStreamer extends TextStreamer {
      constructor(localTokenizer, onText) {
        super(localTokenizer, {
          skip_prompt: true,
          skip_special_tokens: true
        });
        this.onText = onText;
      }

      on_finalized_text(text) {
        if (!text) {
          return;
        }

        this.onText(text);
      }
    }

    const stoppingCriteria = new WorkerStoppingCriteria();
    currentStopper = stoppingCriteria;

    const streamer = new WorkerTextStreamer(tokenizer, (text) => {
      if (timeToFirstTokenMs == null) {
        timeToFirstTokenMs = Math.max(performance.now() - startedAt, 0);
      }

      streamedText += text;
      postMessageToHost(WORKER_OUTBOUND.CHAT_DELTA, {
        requestId,
        text: streamedText
      });
    });

    const outputs = await generator(payload.messages, {
      do_sample: false,
      max_new_tokens: normalizeMaxNewTokens(payload.maxNewTokens),
      stopping_criteria: stoppingCriteria,
      streamer
    });

    const generatedResult = Array.isArray(outputs) ? outputs[0] : outputs;
    const generatedTextPayload = generatedResult?.generated_text;
    const decodedText = Array.isArray(generatedTextPayload)
      ? String(generatedTextPayload.at(-1)?.content || "")
      : String(generatedTextPayload || streamedText || "");
    const endToEndLatencySeconds = Math.max(performance.now() - startedAt, 0) / 1000;
    const decodeLatencySeconds = Math.max(endToEndLatencySeconds - ((timeToFirstTokenMs || 0) / 1000), 0);
    const completionTokenIds = await tokenizer(decodedText || streamedText || "", {
      return_dict: true
    });
    const completionTokens = extractFirstSequenceLength(completionTokenIds?.input_ids);
    const tokensPerSecond = completionTokens > 0 && decodeLatencySeconds > 0
      ? completionTokens / decodeLatencySeconds
      : null;

    postMessageToHost(WORKER_OUTBOUND.CHAT_COMPLETE, {
      finishReason: stoppingCriteria.interrupted ? "abort" : "stop",
      metrics: {
        completionTokens,
        endToEndLatencySeconds,
        promptTokens: promptTokenCount,
        timeToFirstTokenSeconds: timeToFirstTokenMs == null ? null : timeToFirstTokenMs / 1000,
        tokensPerSecond,
        totalTokens: promptTokenCount + completionTokens
      },
      modelId: currentModelId,
      requestId,
      text: decodedText || streamedText || ""
    });
    return;
  } catch (error) {
    postWorkerError(WORKER_OUTBOUND.CHAT_ERROR, error, {
      activeModelId: currentModelId,
      messageCount: Array.isArray(payload.messages) ? payload.messages.length : 0,
      requestId
    });
  } finally {
    currentGenerateRequestId = "";
    currentStopper = null;
  }
}

function handleInterrupt(payload = {}) {
  if (!currentGenerateRequestId || !currentStopper) {
    return;
  }

  currentStopper.interrupt();
  postMessageToHost(WORKER_OUTBOUND.INTERRUPT_ACK, {
    requestId: String(payload.requestId || currentGenerateRequestId)
  });
}

export function handleWorkerMessage(message = {}) {
  switch (message.type) {
    case WORKER_INBOUND.BOOT: {
      postTrace("worker:boot", {});
      postMessageToHost(WORKER_OUTBOUND.READY, {
        webgpuSupported: Boolean(self.navigator?.gpu)
      });
      break;
    }
    case WORKER_INBOUND.INTERRUPT: {
      handleInterrupt(message.payload);
      break;
    }
    case WORKER_INBOUND.LOAD_MODEL: {
      void handleLoadModel(message.payload);
      break;
    }
    case WORKER_INBOUND.RUN_CHAT: {
      void handleRunChat(message.payload);
      break;
    }
    default:
      break;
  }
}

self.addEventListener("error", (event) => {
  console.error("[huggingface-worker] Unhandled worker error", {
    colno: event.colno,
    error: event.error ? serializeError(event.error) : null,
    filename: event.filename,
    lineno: event.lineno,
    message: event.message
  }, event.error);
});

self.addEventListener("unhandledrejection", (event) => {
  console.error("[huggingface-worker] Unhandled rejection", {
    reason: serializeError(event.reason)
  }, event.reason);
});

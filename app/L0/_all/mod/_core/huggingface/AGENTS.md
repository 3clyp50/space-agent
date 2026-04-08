# AGENTS

## Purpose

`_core/huggingface/` owns the first-party browser inference test surface for Hugging Face Transformers.js.

It provides a routed page at `#/huggingface`, keeps the browser inference runtime isolated inside a dedicated module-local worker, and exposes a compact manual chat surface for loading one Hugging Face text-generation model at a time, sending plain chat turns, stopping inference, and reporting simple throughput metrics.

Documentation is top priority for this module. After any change under `_core/huggingface/`, update this file and any affected parent docs in the same session.

## Ownership

This module owns:

- `view.html`: routed test page for loading Hugging Face models and chatting with them
- `store.js`: page store, worker lifecycle, persistence, and routed surface behavior
- `huggingface-worker-bootstrap.js`: tiny bootstrap worker that catches heavy worker import/startup failures and exposes them back to the page as protocol messages before rethrowing
- `huggingface-worker.js`: dedicated runtime worker module that loads Transformers.js, downloads model assets, runs text generation, streams deltas, and handles stop requests
- `helpers.js`: shared model-normalization, persistence-shaping, conversation-shaping, and metric-formatting helpers used by the page and worker
- `protocol.js`: stable message names between the routed page and the worker
- `huggingface.css`: page-local layout and chat styling
- `transformers.js`: the module-local shim that pins the external `@huggingface/transformers` browser import for this route

## Local Contracts

Current route contract:

- the test route is `#/huggingface`
- the page is browser-only and should not require backend API changes
- the routed page is intentionally a compact, low-chrome manual test surface, not a general agent runtime
- the sidebar should surface the currently loaded model first, inside a slightly more prominent rounded panel with a larger model label, a compact right-aligned state badge, and an unload control beside the model name
- while a model is loading, that action switches to `Stop`; stopping a Hugging Face load or unload resets the route-local worker and boots a fresh one instead of depending on a shared global runtime
- the load progress area should show the active step or file below the bar, with the best available detail appended such as bytes transferred or a percent, because Transformers.js reports per-asset progress events rather than one stable end-to-end percentage
- when byte counts are available from the runtime callback, the progress bar fill should track those `loaded / total` bytes instead of the less stable generic `progress` field so the bar and text stay aligned
- on desktop, the route should sit slightly inside the viewport instead of filling it edge to edge, and the saved-model list should expand to consume the remaining sidebar height above the advanced section
- the advanced runtime section should stay collapsed by default
- the system-prompt editor in the chat column should stay collapsed by default so the thread and composer keep most of the height

Current worker and runtime contract:

- the main thread does not import `@huggingface/transformers` directly; only `huggingface-worker.js` dynamically imports the local `transformers.js` shim
- the main thread should spawn `huggingface-worker-bootstrap.js`, not the heavy runtime worker directly
- the worker is dedicated to this route and should stay disposable; the store may terminate and recreate it to stop an in-flight model load or to unload a model cleanly
- worker startup failures should also clear the dead worker reference and reset queued load state so the next user action can create a fresh worker instead of getting stuck in a permanent queued state
- worker messages are centralized in `protocol.js`; keep the page and worker aligned there instead of inventing ad hoc `postMessage` strings
- model loading progress comes from Transformers.js `progress_callback` events and is forwarded to the page through the worker envelope
- worker-side caught failures plus uncaught worker errors and rejections should always be logged through `console.error`, and the page store should also `console.error` inbound load/chat failure payloads plus raw browser worker error events so browser debugging always has a raw trail even when the UI message is terse or opaque
- the worker should also forward its own `console.error` calls back to the page over the worker protocol so runtime logs from inside the worker survive even when the browser surfaces only an opaque worker crash event
- the worker should emit explicit load-stage trace markers over the worker protocol around runtime import and pipeline load so opaque browser-level worker crashes can still be narrowed down to the last completed phase
- startup import failures in the heavy worker module should be caught in the bootstrap worker so the page can receive at least one explicit trace/log payload before the browser reports a generic worker crash
- the page persists the last successfully loaded model config in browser storage and should auto-reload it when the route mounts again in the same browser profile

Current model-loading contract:

- users load models by entering a Hugging Face model id or Hub URL; the module normalizes full Hub URLs back to repo ids such as `org/model`
- the route targets browser-side text generation on `device: "webgpu"`; if WebGPU is unavailable, the module should surface that state instead of silently switching to a backend-wide server path
- the worker should prefer the high-level `pipeline("text-generation", ...)` path for chat models so the runtime matches the official model-card browser examples instead of stitching together lower-level model classes by hand
- the route should not pretend it has a WebLLM-style prebuilt catalog or reliable cache scan; Transformers.js loads arbitrary compatible Hub repos and does not expose the same built-in inventory surface
- the page should keep a small saved-model list in browser storage for quick reuse, but that list is route-owned UI memory, not authoritative browser-cache state
- only Transformers.js-compatible repos with ONNX assets are expected to work; the UI should point users toward the ONNX Community model browser instead of inventing custom discovery logic here
- the module-local `transformers.js` shim should stay pinned to the official browser/CDN version recommended by Hugging Face docs for the current runtime path; as of April 8, 2026 that is the `4.0.0-next.7` preview import
- model downloads and cache ownership belong to the browser-side Transformers.js runtime; this module should not add server proxying or backend model state unless a later request explicitly asks for it

Current chat and metrics contract:

- the page supports only plain system prompt text plus plain user and assistant chat turns
- the chat column should present a `Testing chat` heading with the clear-chat action inline beside it
- there is no tool execution, skill routing, attachments, queueing, or persisted history in this module
- the stop action must interrupt generation in the worker through a stopping-criteria gate instead of faking cancellation in the UI
- assistant metrics are attached after a response finishes, using locally measured prompt tokens, completion tokens, time to first streamed text, end-to-end latency, and derived token rates
- assistant replies should render their model id and performance metrics as one compact inline row below the response body instead of large stat cards
- sparse chat threads should stay top-aligned and keep compact message heights; do not stretch message rows to fill the thread column
- the chat column should keep the thread and composer visually dense; avoid oversized message padding, oversized saved-model rows, or expanded prompt editors by default

## Development Guidance

- keep this surface self-contained under `_core/huggingface/` unless a later request explicitly promotes shared helpers into `_core/framework` or `_core/visual`
- prefer worker-side inference changes over main-thread imports so the test page remains responsive during model load and generation
- keep the routed page simple, dense, and legible; it is a test harness, not a polished chat product
- if the route path, worker protocol, pinned Transformers.js shim, model-selection contract, or persistence contract changes, update this file, `/app/AGENTS.md`, and the matching docs under `_core/documentation/docs/`

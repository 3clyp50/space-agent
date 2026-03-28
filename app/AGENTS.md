# AGENTS

## Purpose

`app/` is the browser-runtime root.

It is organized into layered runtime areas:

- `L0/`: current active browser firmware
- `L1/`: reserved system layer
- `L2/`: reserved user layer

## Layer Rules

- `L0` contains the current runtime bootstrap and should stay stable and framework-like
- `L1` is for admin-managed shared customizations and system files
- `L2` is for user-specific files and data
- server-owned concerns such as raw proxy transport and SQLite access do not belong here unless they are browser clients for those services

## Frontend Patterns

- Prefer framework-backed pages over page-local imperative bootstraps.
- A page shell should usually load `fw` styles, import `/fw/initFw.js`, and mount a root `x-component` instead of owning complex inline markup and controller logic itself.
- Put page behavior into a dedicated Alpine store created with `createStore(...)`.
- Store-dependent component content should be gated with `x-data` plus `template x-if="$store.<name>"` before rendering.
- Use Alpine handlers such as `@click`, `@submit.prevent`, `@input`, `@keydown`, `x-model`, `x-text`, `x-ref`, `x-init`, and `x-destroy` instead of wiring most UI behavior through `querySelector` and manual event listener registration.
- Use `x-component` includes for reusable or page-root UI fragments instead of duplicating markup in page shells.
- When a component needs DOM references, pass them into the store from Alpine via `x-ref` during mount rather than having the store scan the document globally.
- Keep stores responsible for controller state, persistence, async flows, and orchestration. Keep render-only DOM assembly helpers in separate modules when the UI is too complex for direct Alpine templating alone.
- Prefer one public browser runtime namespace. Expose browser-facing APIs through `A1`, and nest chat-specific execution data under `A1.currentChat` instead of adding parallel aliases.

## Current State

Only `L0` is active today.

The public app URLs are still served from the server as if `L0` were the app root. The layer separation is internal structure for now.

The main `L0/index.html` entry should boot `fw` and mount the chat root component directly. Avoid reintroducing iframe-based app switching for the primary chat runtime.

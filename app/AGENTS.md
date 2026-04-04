# AGENTS

## Purpose

`app/` is the primary Space Agent runtime.

Keep agent orchestration, prompt construction, tool flow, state management, user interaction, and optimistic UX in the browser whenever possible. Server-backed work in this tree should be browser clients for explicit server APIs, not server-side orchestration leaking into the frontend.

Documentation is top priority for this area. After any change under `app/` or any app-facing contract change owned here, update this file in the same session before finishing.

The current goal for this tree is no longer just framework completion. The framework under `app/L0/_all/mod/_core/framework/` is now the base platform for the actual frontend app, with shared styles and font assets under `css/`, runtime modules under `js/`, and extension files under `ext/`. New first-party app work should be built as `_core` modules that compose through modules and extensions instead of growing page shells or one-off boot scripts.

## Structure

The browser runtime is organized into three layers:

- `L0/`: immutable firmware changed through updates
- `L1/`: runtime-editable group customware
- `L2/`: runtime-editable user customware

Current browser entry surfaces are served from `server/pages/`:

- `/`: main app shell from `server/pages/index.html`
- `/admin`: admin shell from `server/pages/admin.html`, with `meta[name="space-max-layer"]` set to `0` so module and extension resolution stay `L0`-only
- `/login`: standalone login screen from `server/pages/login.html`
- `/logout`: server-side logout action that clears the session cookie and redirects to `/login`

Current shared module locations:

- `app/L0/_all/mod/_core/framework/`: shared frontend platform root; keep shared styles and font assets under `css/`, runtime modules under `js/`, and extension files under `ext/`
- `app/L0/_all/mod/_core/visual/`: shared visual asset aggregator for reusable canvas, chrome, button, dialog, surface, and conversation-thread styles plus the small dialog and thread-render helpers that both chat surfaces can share without coupling their stores; shared look-and-feel work belongs here before it belongs in feature-local CSS
- `app/L0/_all/mod/_core/router/`: main app shell owner; mounted at the root page anchor, resolves hash paths into module views, exposes `space.router`, Alpine `$router`, and owns persistent cross-route extension anchors at `_core/router/shell_start`, `_core/router/shell_end`, and the route/overlay family
- `app/L0/_all/mod/_core/onscreen_menu/`: floating top-right menu button injected into the router shell via the `_core/router/shell_start` anchor; provides Admin and Logout navigation for all router-hosted views, and the Admin action preserves the current app URL by redirecting to `/admin?url=...`
- `app/L0/_all/mod/_core/dashboard/`: default root-app module rendered by `_core/router`
- `app/L0/_all/mod/_core/space/`: first routed main-app feature module rendered by `_core/router`
- `app/L0/_all/mod/_core/chat/`: standalone chat runtime and the current reference implementation of a store-driven feature module mounted through the extension system
- `app/L0/_all/mod/_core/admin/`: current firmware-backed admin UI, organized by surface under `views/shell/`, `views/dashboard/`, `views/agent/`, `views/modules/`, `views/files/`, and `views/documentation/`, with admin-only prompt skills under `skills/` and the split shell mounted through a page-specific extension anchor
- `app/L0/test/`: firmware-side test and example customware fixtures

Shared browser primitives:

- `<x-extension id="...">`: HTML extension anchor; loads matching `mod/**/ext/**` HTML files
- `<x-component path="/mod/...">`: HTML component loader; fetches a component file and mounts its markup, styles, and scripts
- `<x-icon>`: lightweight icon tag normalized by the framework into a Material Symbols glyph
- `globalThis.space`: shared frontend runtime namespace for the current browsing context only; do not publish it into `parent`, `top`, or iframe windows
- `space.api`: authenticated browser API client, including `fileList()`, `fileRead()`, `fileWrite()`, `fileDelete()`, `fileCopy()`, `fileMove()`, `fileInfo()`, and `userSelfInfo()`; `fileRead()` and `fileWrite()` accept either single-file input or composed batch `files` input and return either one file result or a `{ count, files }` batch result, `fileDelete()` accepts single-path input or composed batch `paths` input and returns either `{ path }` or `{ count, paths }`, `fileCopy()` plus `fileMove()` accept either one `{ fromPath, toPath }` pair or a composed `{ entries }` batch and return either one `{ fromPath, toPath }` result or a `{ count, entries }` batch result, `fileInfo()` accepts one readable path and returns metadata such as `path`, `isDirectory`, `size`, and `modifiedAt`, and `fileWrite()` creates directories when the target path ends with `/`
- `space.fw.createStore(name, model)`: shared Alpine store factory exposed by the framework runtime
- `space.router`: root-app router runtime; mirrors the Alpine `$router` magic, resolves `/#/...` paths, exposes `goTo()`, `replaceTo()`, `back()`, `goBack()`, `createHref()`, `scrollToElement()`, and keeps per-route scroll positions in `sessionStorage`
- `space.utils.markdown`: lightweight markdown helpers, currently with `parseDocument()` for frontmatter-aware markdown parsing
- `space.utils.yaml`: lightweight frontend YAML helpers with `parse()`, `parseScalar()`, and `serialize()`

## Layer Rules And Module Model

- `L0` is firmware and should stay update-driven
- `L1` contains per-group customware; `_all` and `_admin` are special groups
- `L2` contains per-user customware; users should only write inside their own `L2/<username>/`
- `L1` and `L2` are transient runtime state and are gitignored; do not document repo-owned example content there as if it were durable framework structure
- `app/L2/<username>/user.yaml` stores user metadata such as `full_name`; auth state lives under `app/L2/<username>/meta/`
- authenticated app-file lists, reads, writes, deletes, copies, and moves may use `~` or `~/...` as shorthand for the current user's `L2/<username>/...` path when the API supports it
- `space.api.fileRead()` accepts `path, encoding`, `{ path, encoding? }`, an array of file inputs, or `{ files, encoding? }`; `space.api.fileWrite()` accepts `path, content?, encoding`, `{ path, content?, encoding? }`, an array of write inputs, or `{ files, encoding? }`; `space.api.fileDelete()` accepts `path`, `{ path }`, an array of delete inputs, or `{ paths }`; `space.api.fileCopy()` plus `space.api.fileMove()` accept `fromPath, toPath`, `{ fromPath, toPath }`, an array of transfer inputs, or `{ entries }`; `space.api.fileInfo()` accepts `path` or `{ path }`
- batch `fileRead()` and `fileWrite()` return `{ count, files }`, batch writes also return top-level `bytesWritten`, batch `fileDelete()` returns `{ count, paths }`, and batch `fileCopy()` plus `fileMove()` return `{ count, entries }`; batch file access validates every target up front and fails before any write, delete, copy, or move starts if one entry is invalid or forbidden
- groups may include users and other groups, and may declare managers that can write to that group's `L1` area
- group definitions live in `group.yaml` files under `app/L0/<group-id>/` and `app/L1/<group-id>/`
- read permission rules are explicit: users can read their own `L2/<username>/`, and can read `L0/<group>/` and `L1/<group>/` only for groups they belong to
- write permission rules are explicit: users can write their own `L2/<username>/`; users can write `L1/<group>/` only for groups they manage directly or through managing-group inclusion; `_admin` members can write any `L1/` and `L2/` path; nobody writes `L0/`
- modules are the supported browser delivery and extension unit
- each group or user owns a `mod/` folder, and module contents are namespaced as `mod/<author>/<repo>/...`
- browser-facing code and assets should normally be delivered through `/mod/...`
- the current inheritance model is `L0 -> L1 -> L2` across the effective group chain for the current user
- page shells may clamp module and extension resolution with `meta[name="space-max-layer"]`; the current admin shell sets `0`, which means `/mod/...` and `/api/extensions_load` stay on `L0` even though file APIs remain unchanged
- authenticated frontend fetches now rely on the server-issued session cookie after login; do not reintroduce client-trusted identity shortcuts
- first-party application development should now happen primarily under `app/L0/_all/mod/_core/`
- use `L1` and `L2` for layered overrides and customware behavior, not as the main home for repo-owned first-party app features

## Frontend Composition Model

The frontend is built as a chain of extensions. The root page shell should do almost nothing except load the framework and expose an anchor. The module mounted there should expose more anchors or wrapped functions. Other modules should extend those seams instead of reaching around them.

Current boot flow:

1. `server/pages/index.html` or `server/pages/admin.html` loads shared framework CSS and `/mod/_core/framework/js/initFw.js`; `/admin` also declares `meta[name="space-max-layer"]` with content `0`, and its shell URLs include `?maxLayer=0`.
2. The page shell exposes exactly one top-level HTML anchor in the body: `html/body/start` for `/` and `page/admin/body/start` for `/admin`.
3. `initFw.js` imports `/mod/_core/framework/js/extensions.js` first. That module creates `globalThis.space` in the current window, installs `space.extend`, and starts the HTML-extension observer.
4. `initFw.js` initializes the shared runtime with `initializeRuntime(...)`, which populates the current window's `space.api`, `space.fw.createStore`, `space.utils.markdown`, and `space.utils.yaml`. Each window or iframe keeps its own runtime and Alpine state; do not share or publish the runtime across browsing contexts.
5. `initFw.js` runs `initializer.initialize()`. Because `initialize()` and `setDeviceClass()` are wrapped with `space.extend`, they already expose JS extension hooks before the rest of the app is mounted.
6. `initFw.js` then loads framework support modules such as `modals.js`, `components.js`, `icons.js`, and the confirm-click helper, imports Alpine, and registers framework Alpine directives.
7. `extensions.js` scans the DOM for `<x-extension>` nodes. For each `id`, it batches one `/api/extensions_load` request per frame for all uncached extension lookups and includes the page-level `maxLayer` ceiling when configured.
8. Matching HTML extension files are turned into `<x-component>` nodes in resolved order.
9. `components.js` fetches each component file, mounts its styles and scripts, appends its body nodes, and recursively loads nested `<x-component>` tags.
10. Alpine activates the mounted markup. Feature stores and runtime helpers own behavior from there.

The current app now demonstrates this chain with the root router:

```html
<!-- server/pages/index.html -->
<body class="app-page-router space-theme-canvas">
  <x-extension id="html/body/start"></x-extension>
</body>
```

```html
<!-- app/L0/_all/mod/_core/router/ext/html/body/start/router-page.html -->
<x-component path="/mod/_core/router/view.html"></x-component>
```

That pattern is the default for new app work. Keep the shell small, mount a module through an extension file, and let that module expose the next seam.

## Extension System Contracts

There are two primary extension styles in the frontend runtime.

### HTML Extension Anchors

Use HTML extension anchors when the seam is structural or visual.

- A DOM anchor is declared with `<x-extension id="some/path">`
- Matching HTML files live at `mod/<author>/<repo>/ext/some/path/*.html`
- The resolved HTML files are mounted in order as `<x-component>` tags
- HTML extension files should usually stay thin and mount the real component from the module root instead of containing the whole feature directly

Recommended pattern:

```html
<!-- anchor -->
<x-extension id="page/admin/body/start"></x-extension>
```

```html
<!-- thin adapter file under ext/ -->
<x-component path="/mod/_core/admin/views/shell/shell.html"></x-component>
```

Choose HTML anchors deliberately:

- use a generic anchor such as `html/body/start` only when the contribution is meant to compose into a shared page surface
- use a page-specific anchor such as `page/admin/body/start` when a surface is owned by one page and should not attract unrelated contributions
- add a new anchor in the owning module when downstream modules need a stable DOM insertion point
- do not import and patch another module's private markup when a small `<x-extension>` seam would make the contract explicit

Extension point naming convention:

- name extension points declared inside a module after the owning module's path and the location within that module, using underscores for position suffixes, for example `_core/router/shell_start` and `_core/router/shell_end`; this makes ownership unambiguous and prevents collisions when multiple modules expose anchors
- root page anchors declared directly in core HTML shells such as `html/body/start` and `page/admin/body/start` are an exception to this rule and keep their current flat names because they are the fixed entry contract for the page shell, not an internal module seam

### JS Extension Hooks

Use JS extension hooks when the seam is behavioral.

The standard hook API is `space.extend(import.meta, ...)`.

Example:

```js
// /mod/_core/framework/js/initializer.js
const INITIALIZER_MODULE_REF = new URL("../initializer.js", import.meta.url);

export const initialize = globalThis.space.extend(INITIALIZER_MODULE_REF, async function initialize() {
  await setDeviceClass();
});
```

That implementation lives at `/mod/_core/framework/js/initializer.js` but preserves the extension point `_core/framework/initializer.js/initialize`, which means hook files may live at:

- `mod/<author>/<repo>/ext/_core/framework/initializer.js/initialize/start/*.js`
- `mod/<author>/<repo>/ext/_core/framework/initializer.js/initialize/end/*.js`

Important rules:

- `space.extend()` requires a valid module ref such as `import.meta`
- `space.extend()` wraps standalone functions, not classes
- wrapped functions become async; callers should `await` them
- if the function name is not the contract you want to expose, pass an explicit relative extension-point name
- import `/mod/_core/framework/js/extensions.js` only once from `initFw.js`; other modules should use `globalThis.space.extend(...)` directly
- do not create local `const extend = globalThis.space.extend` aliases just to forward the same global contract

Hook context behavior:

- `/start` hooks run before the original function
- `/end` hooks run after the original function or after a skipped call
- hook modules receive the mutable context object created by `space.extend()`
- `/start` hooks may rewrite `ctx.args`, set `ctx.skip = true`, or set `ctx.error`
- `/end` hooks may inspect or replace `ctx.result` and `ctx.error`
- the hook context includes `args`, `result`, `error`, `skip`, `skipped`, `thisArg`, `extensionPoint`, `functionName`, and `original`

The framework also supports explicit named JS extension points through `callJsExtensions("name", data)`. Use that style when the seam is a named event rather than the lifecycle of one owning function. Current examples are `open_modal_before` and `close_modal_before` in `framework/js/modals.js`.

## Resolution, Ordering, And Overrides

The server resolves extension files from the current user's accessible `L0`, `L1`, and `L2` module trees through `/api/extensions_load`.

The optional `maxLayer` ceiling narrows that resolution:

- `0`: only `L0`
- `1`: `L0` and `L1`
- `2`: `L0`, `L1`, and `L2` (default)

What composes and what overrides:

- if two layers provide the exact same module-relative extension file path, the higher-ranked layer overrides the lower one
- if two layers provide different filenames under the same extension point, both contributions remain and compose together
- use the exact same `ext/.../<filename>` path only when replacement is intentional
- use different filenames when the goal is additive composition

Current resolution order is:

- `L0/_all`
- current user's ordered `L0/<group>/` chain
- `L1/_all`
- current user's ordered `L1/<group>/` chain
- `L2/<username>`

Within the same effective rank, results are ordered lexically by project path. If multiple same-rank contributions must render in a stable sequence, name the files intentionally.

Practical guidance:

- prefer additive composition first
- prefer small anchor-specific files over full lower-layer replacement
- use exact-path overrides for true firmware replacement, not as the first tool for ordinary feature work

## Component Contract

`<x-component>` loads an HTML file and treats it as a component source.

Current loader behavior:

- the component source may be a full HTML document or a simple fragment
- `<style>` and `<link rel="stylesheet">` nodes are appended to the target element
- `<script type="module" src="...">` scripts are loaded with dynamic `import()`
- nested `<x-component>` tags are discovered and loaded recursively
- dynamically inserted `<x-component>` nodes are handled by a `MutationObserver`
- attributes on parent `<x-component>` wrappers are available inside descendants through `xAttrs($el)`

Preferred component structure for non-trivial modules:

```html
<html>
  <head>
    <link rel="stylesheet" href="/mod/_core/feature/feature.css" />
    <script type="module" src="/mod/_core/feature/feature-page.js"></script>
  </head>
  <body>
    <!-- component markup -->
  </body>
</html>
```

Guidelines:

- keep real implementation files in module-owned surface folders or the module root, not under `ext/`
- use root-based `/mod/...` URLs for component scripts, styles, and assets
- prefer external module scripts over large inline behavior blocks
- keep a single surface-local stylesheet next to the rest of that surface's files; do not create a nested `css/` folder just to hold one file
- if a component depends on a store, import that store module in the component's own HTML `<head>`; do not rely on parent views, extension adapters, or page shells to preload feature stores for it
- keep HTML components declarative; they should map store state, wire refs, and call small store methods rather than holding feature logic in inline `x-data` objects or long inline scripts
- do not create passthrough components whose only job is to re-include another component; point the caller directly at the real component file unless the adapter is the explicit `ext/` seam
- use fragment components for very small leaf pieces such as nested snippets or modal bodies
- use full-document component files when the component needs its own `<head>` assets, `<title>`, or body/html classes
- when a surface has a fixed composer, footer, or toolbar, make the local content body the scroll container; do not let the page shell or parent stage grow and scroll the fixed controls off screen
- for fixed-height surfaces, make the top-level component wrapper participate in the layout chain too; it should usually fill the parent with `display:flex` or `display:grid`, `height:100%`, and `min-height:0` so nested scroll regions can stay bounded

## Alpine Store And Runtime Guide

The current frontend pattern is Alpine plus store-backed modules.

Recommended ownership split:

- component HTML owns structure and Alpine bindings
- Alpine stores own state, persistence, async work, server calls, and orchestration
- module utilities own rendering helpers, data transforms, and protocol logic that would make a store too dense
- `space` owns shared runtime APIs and cross-feature namespaces

Avoid feature-local Alpine logic in component markup:

- do not build non-trivial features around inline `x-data="{ ... }"` objects or inline `<script>` blocks inside component HTML
- put feature state, tab selection, async behavior, and event logic into a module store under the owning module root
- keep component markup focused on binding to `$store`, passing `x-ref`s, and calling small store methods
- do not access `globalThis.Alpine` directly from feature modules; import the owning store module where the feature is mounted and address it through `$store` bindings or the imported store contract instead

Store guidance:

- create stores with `space.fw.createStore(name, model)` on framework-backed pages instead of importing the Alpine store helper through a long module path in feature code
- call `space.fw.createStore(...)` directly in the store module; do not copy it into a local variable first and do not add defensive availability checks around it
- keep store names aligned: the registered name, exported binding, file usage, and `$store.<name>` key should match exactly and should not end with `Store`
- use `init()` for one-time store startup
- use `mount(refs)` and `unmount()` when the store needs DOM references or window listeners
- pass DOM references from Alpine with `x-ref`; do not make stores scan the whole document when direct refs will do
- gate store-dependent UI with `x-data` plus `template x-if="$store.<name>"`
- use `x-init` to mount and `x-destroy` to clean up
- prefer Alpine handlers such as `@click`, `@submit.prevent`, `@input`, `@keydown`, `x-model`, `x-text`, and `x-show` over manual listener wiring
- when a module needs several helpers from the same dependency, import the module under a short namespace such as `import * as agentView from ".../view.js"` instead of long named-import lists

Runtime guidance:

- framework-backed pages that boot through `/mod/_core/framework/js/initFw.js` already initialize the shared runtime before feature modules mount; feature modules should usually consume `space` directly instead of calling `initializeRuntime(...)` again
- publish cross-feature contracts under explicit runtime namespaces such as `space.currentChat`, not as loose globals
- if a feature expects downstream extensions, expose a small explicit runtime or hook contract in the owner instead of having dependent modules reach into internal closures
- use `space.api.userSelfInfo()` when the browser needs the authenticated user's derived identity snapshot, including `_admin` membership
- use `space.utils.yaml.parse()` and `space.utils.yaml.serialize()` for lightweight YAML config files owned by browser modules
- use browser storage only for small, non-authoritative UI state that does not need cross-device persistence, such as the last selected tab in a local shell; prefer `sessionStorage` for refresh-surviving per-tab state and keep real user config/history in app files or backend APIs

## App Development Principles

This is the default development model for the app going forward.

- build every feature as a module under `app/L0/_all/mod/_core/<feature>/`
- treat the page shell as an extension root, not as the application body
- treat each mounted module as the owner of the next seam
- if another feature needs to modify owned behavior, expose a new extension point at the owning boundary instead of importing private internals and patching them indirectly
- keep extension files thin; put reusable logic, markup, and styling in ordinary module files
- design every new feature so it can itself be extended later
- when choosing between a direct import and a new extension seam, prefer a direct import for purely internal implementation detail and a new extension seam for any contract that another module or layer may reasonably need to customize
- when a style, helper, or runtime contract will be reused by multiple modules, move it into `_core/visual`, `_core/framework`, or another clearly shared owning module instead of cloning it
- do not grow `server/pages/*.html` beyond shell concerns when the same result can be achieved with modules and extension anchors
- do not build new first-party app features directly inside transient `L1` or `L2` customware

Use this decision sequence when adding new app functionality:

1. Choose the owning module under `_core`.
2. Decide where it mounts: existing anchor, new anchor, modal surface, or standalone module page.
3. Put the real component, store, CSS, and utilities in the owning module root.
4. Add the smallest possible `ext/...` adapter file to attach that module to the chosen seam.
5. If the new module needs downstream customization, expose its own `<x-extension>` or `space.extend()` seam immediately instead of waiting for consumers to monkey-patch it later.
6. If layer-specific behavior is needed, prefer additive extension files first and full same-path overrides only when replacement is the real intent.

## Frontend Implementation Guide

- keep root HTML shells thin and static; session gating for root pages belongs in the server router, not in inline boot scripts
- keep page shells under `server/pages/` minimal; they should mount app modules rather than duplicating frontend logic there
- keep pre-auth shell-only art or binary assets under `server/pages/res/` and load them from `/pages/res/...` instead of embedding large data blobs directly into page HTML
- use `app/L0/_all/mod/_core/framework/css/colors.css` as the shared palette source for authenticated frontend surfaces; prefer its semantic purpose-based tokens over hardcoded page-local colors
- use `app/L0/_all/mod/_core/visual/index.css` for shared visual language and `app/L0/_all/mod/_core/visual/canvas/space-canvas.css` for the shared space backdrop instead of rebuilding page backgrounds, chrome, buttons, or dialog styling inside each feature
- when a dialog needs a positive submit or save action, use the shared `_core/visual/actions/buttons.css` `confirm-button` style instead of feature-local primary-button variants so modal confirmation controls stay consistent across surfaces
- when a browser module uses native `<dialog>` modals, host them through a body-teleported `.space-dialog-layer` and reuse `_core/visual/forms/dialog.css` plus `_core/visual/forms/dialog.js` instead of leaving them inside draggable, transformed, or overflow-clipped feature containers
- when a browser module needs a dropdown, overflow menu, or lightweight action chooser, use the shared fixed-position popover contract from `_core/visual/chrome/popover.css` plus `_core/visual/chrome/popover.js` instead of inventing feature-local absolute panels or escalating simple action lists into separate modals
- use `/mod/_core/framework/js/initFw.js` as the shared frontend bootstrap for framework-backed pages
- wrapped functions expose their resolved extension point at `fn.extensionPoint`; use that in the browser console when debugging where matching extension files belong
- cache empty extension lookups as valid results; a missing extension point should not trigger repeated `/api/extensions_load` polling during the same cache lifetime
- uncached extension lookups are batched to one `/api/extensions_load` request per frame; keep extension discovery bursty and declarative so the batcher can collapse multiple JS and HTML hook lookups together during bootstrap and DOM scans
- browser-side file changes still require a manual browser refresh; live reload is not wired into the app runtime yet
- because extension lookups are cached in memory, adding new `ext/...` files often requires a reload before the running page will discover them
- when you add a new stable app seam, update this file in the same session so later agents know where the extension boundary now lives

## Visual Guidance

Space Agent frontend work should look like one deliberate system rather than a mix of unrelated component-library defaults.

- minimal first: solve hierarchy with spacing, alignment, type scale, and one strong surface before adding extra panels, dividers, chips, or decorative UI
- dark space environment: use the semantic color tokens from `app/L0/_all/mod/_core/framework/css/colors.css` by purpose and use the shared backdrop and chrome assets from `app/L0/_all/mod/_core/visual/`; do not invent page-local background systems when the shared one fits
- dark-only shared palette: `app/L0/_all/mod/_core/framework/css/colors.css` now defines only the shared dark palette; if a legacy surface still needs local light tokens temporarily, keep them owned by that module instead of reintroducing framework-level light-mode classes
- public shell mirroring: public shells that cannot load authenticated `/mod/...` assets, such as `/login`, should keep their pre-auth styling and assets local while staying aligned with the shared design system
- restrained atmosphere: keep the space direction calm and intentional, with deep navy canvases, subtle starfield texture, and soft accent glow rather than noisy sci-fi chrome or neon overload
- restrained motion: if motion is used, keep it sparse, atmospheric, and easy to ignore; it should support the mood without turning the interface into an attention trap
- usable contrast: body text, controls, focus states, and status states must remain clear and comfortable for long sessions; do not trade readability for mood
- soft geometry: use a 4 px spacing rhythm, keep controls compact, prefer 14 to 16 px radii for inputs and buttons, and 22 to 28 px radii for major panels and shells
- compact mobile layouts: mobile screens should reduce padding, collapse secondary decoration, and preserve clear tap targets without turning the layout into stacked oversized cards
- reusable promotion rule: when a style pattern appears in more than one place, move it into `_core/visual` instead of cloning slightly different local versions

## Current State

- `server/pages/index.html` and `server/pages/admin.html` are plain module-backed shells; the server router decides whether to serve them or redirect to `/login`
- `server/pages/index.html` exposes the `html/body/start` extension anchor, sets the authenticated app body to `app-page-router space-theme-canvas`, and lets `_core/router` inject there from `/mod/_core/router/ext/html/body/start/router-page.html` rather than hardcoding app structure directly in the page shell
- `server/pages/admin.html` exposes the `page/admin/body/start` extension anchor, injects the `_core/admin` split shell from `/mod/_core/admin/ext/page/admin/body/start/admin-shell.html`, uses a subtle vertically biased login-inspired gradient shell background with large fixed-size clipped nebula-like glows rather than the shared starfield canvas, and declares `space-max-layer=0` so admin module and extension fetches stay on firmware
- `app/L0/_all/mod/_core/framework/` is the platform layer for new frontend app work and is organized into `css/`, `js/`, and `ext/`
- `app/L0/_all/mod/_core/framework/css/index.css` now owns only structural framework-wide CSS such as scrollbars, cloak handling, extension/component display behavior, and loading/error primitives; reusable visual treatments no longer live there
- `app/L0/_all/mod/_core/framework/css/visual.css` is now only a compatibility bridge into `_core/visual/canvas/space-canvas.css`
- `app/L0/_all/mod/_core/visual/canvas/space-canvas.css` now owns the reusable DOM-backed space backdrop component for authenticated surfaces, `app/L0/_all/mod/_core/visual/canvas/spaceBackdropCore.js` owns the shared resize plus browser-zoom compensation, `app/L0/_all/mod/_core/visual/canvas/spaceBackdropStatic.js` freezes that scene for low-overhead app use, `app/L0/_all/mod/_core/visual/canvas/spaceBackdropAnimated.js` keeps the animated star drift plus shooting-star version available for later reuse, and `_core/router/view.html` mounts the static variant directly
- `app/L0/_all/mod/_core/visual/` is the shared visual asset aggregator; `index.css` composes the reusable canvas, topbar chrome, popover, button, dialog, card/surface, and agent-thread layers from `canvas/`, `chrome/`, `actions/`, `forms/`, `surfaces/`, and `conversation/`, `conversation/thread-view.js` owns the shared DOM renderer plus incremental streaming patch path for agent threads, `actions/buttons.css` now owns the shared composer-attachment chip/input visuals plus the semantic `confirm-button` treatment used by modal save and submit actions across chat, admin, file-browser, and overlay surfaces, `chrome/popover.css` plus `chrome/popover.js` own the shared fixed-position dropdown or overflow-menu contract for lightweight action menus, `forms/dialog.js` owns the small shared open/close helper for native chat dialogs, and `forms/dialog.css` keeps context-window text sections stretched to the horizontal scroll width so striped section backgrounds do not stop at the original viewport width, constrains dialog cards to scroll internally within the viewport by default, and sizes shared form fields with border-box width so settings forms do not overflow or crop on the right edge
- `app/L0/_all/mod/_core/framework/js/modals.js` exposes modal shell anchors at `modal-shell-start` and `modal-shell-end`
- `app/L0/_all/mod/_core/framework/js/token-count.js` wraps a vendored `js-tiktoken` `o200k_base` tokenizer under `framework/js/vendor/` for browser-side string token counts
- `app/L0/_all/mod/_core/router/` is the main app shell; it owns the default `#/dashboard` route, resolves `/#/segment` to `/mod/_core/<segment>/view.html`, resolves `/#/author/module/...` to `/mod/author/module/.../view.html` unless the last segment already ends in `.html`, keeps hash-query params attached to the resolved view path, remembers per-route scroll positions, exposes `space.router` plus Alpine `$router`, and leaves persistent extension anchors at `_core/router/shell_start`, `_core/router/shell_end`, `page/router/route/start`, `page/router/route/end`, `page/router/overlay/start`, and `page/router/overlay/end`
- `app/L0/_all/mod/_core/dashboard/view.html` is the default root-app view rendered by `_core/router`; it stays intentionally small and currently exposes only the `New Space` action
- `app/L0/_all/mod/_core/space/view.html` is the first routed feature view and the current reference for reading routed path and query state back through `$router.current`
- `app/L0/_all/mod/_core/chat/` remains a standalone store-driven module reference, now loads `_core/visual/index.css` instead of relying on framework-owned visual imports, and no longer owns the root app mount
- `app/L0/_all/mod/_core/onscreen_agent/` is the persistent router-overlay chat surface for the real in-app agent; it mounts through the thin adapter at `ext/page/router/overlay/end/onscreen-agent.html`, keeps a draggable/collapsible desktop-first astronaut-plus-composer shell alive across routed pages, now always boots collapsed on page load before any later user expansion, persists settings and placement to `~/conf/onscreen-agent.yaml`, persists thread history to `~/hist/onscreen-agent.json`, owns its attachment/runtime helpers locally instead of importing `_core/chat` internals, keeps the chat-style astronaut and helmet assets locally under `onscreen_agent/res/` sourced from `_core/chat/res/`, uses the helmet asset for assistant avatars inside the thread while keeping the floating shell astronaut separate, reuses the shared `_core/visual` thread renderer, agent-thread styling, dialog layer, and composer-attachment chip visuals while keeping overlay-specific store/runtime logic local, now hosts its native dialogs through the shared body-teleported visual dialog layer instead of inside the draggable shell, exposes a generic `showUiBubble(text, hideAfterMs)` store API for the floating astronaut speech bubble with a single-slot overwrite buffer so noisy callers only replace the pending message instead of queueing unbounded work, uses that API for a delayed idle hint that says `Drag me, tap me.` after 2 seconds if the collapsed shell still has not been touched, sizes those UI bubbles to their intrinsic width up to roughly `20em` before wrapping, uses a detached triangular side pointer behind the bubble on the astronaut-facing edge with the tail base tucked under the bubble body, keeps that pointer vertically anchored toward the astronaut upper-half reference point instead of the adjacent expand bubble or panel, uses an icon-based expand bubble instead of a text glyph, renders floating history inside a rounded glass panel rather than a fully transparent rail, keeps the composer compact by stacking send/attach actions on the right with a single footer row that shows a content-width model button on the left and the token counter plus compact/context-window/reset actions on the right, keeps the floating history rail and composer panel on the same border-box width so the overlay shell reads as one aligned column, folds custom prompt editing into the LLM settings dialog, names the full prompt-history modal as the context window and shows its total token count in the heading, revalidates restored attachment availability so reloaded files are metadata-only instead of incorrectly marked live, supports a solid stop action for the active loop, shows queued user drafts at the tail of the thread as queued bubbles, queues multiple follow-up sends so messages submitted during a running loop hand off in order at the next response or execution boundary instead of interrupting the current step mid-flight, now patches streamed assistant text into the existing DOM at animation-frame cadence instead of full rerendering the whole thread on each chunk, selectively swaps only the active streaming assistant row into the execution-card writing state as soon as the streamed content reaches the `_____javascript` execution separator, keeps expanded execution detail action buttons transparent like the admin surface instead of giving them filled pill backgrounds, only refreshes prompt-history token counts at response or tool boundaries, persists history only after completed response/tool boundaries rather than during streaming, anchors the lower history rail directly below the composer instead of offsetting it by its own height, and when the shell flips into the top-edge history-below state it slides the expanded composer down so the astronaut head and composer top stay aligned
- `app/L0/_all/mod/_core/admin/` is the current reference module for a page-specific split shell, organized by surface under `views/shell/`, `views/dashboard/`, `views/agent/`, `views/modules/`, `views/files/`, and `views/documentation/`, keeps its admin-specific astronaut and helmet assets under `admin/res/` rather than borrowing them from `onscreen_agent`, uses those admin-local assets for the shell tab avatar, thread avatar, and empty-state astronaut, and uses direct component mounts instead of passthrough include files
- `app/L0/_all/mod/_core/admin/views/shell/page.js` remembers the last selected admin tab in `sessionStorage`, so refresh restores the current tab without persisting that shell-local UI state to the backend, now places the dedicated Files tab before Modules and adds the same Files shortcut to the dashboard launch actions, while `views/shell/shell.js` owns the split-pane layout, resolves the optional `/admin?url=...` request into the initial right-hand iframe URL, keeps the iframe-backed leave-admin action redirecting the shell window to whatever URL is currently open in that pane, and lets the Files tab consume the full admin-pane width instead of inheriting the shell's narrower general panel cap
- `app/L0/_all/mod/_core/admin/views/dashboard/panel.html` is the firmware-backed admin disclaimer surface; it now uses full-width paragraphs, the shared `adminPage` store's `space.api.userSelfInfo()` snapshot to show a non-admin access note when the authenticated user is not a member of `_admin`, and a final launch-card action that leaves `/admin` by promoting the current iframe URL into the shell window
- `app/L0/_all/mod/_core/admin/views/modules/` owns the firmware-backed modules panel; the header now keeps server-backed area and search filters together, defaults to `L2 / mine`, switches to `L1 / groups`, exposes an admin-only aggregated `L2 / users` area when `_admin` is present, renders module rows as `author / repo` with the layer and owner context on a second line, and disables destructive actions directly from the server-provided `canWrite` flags while leaving the module-row file-browser shortcut inactive and pointing users at the Files tab
- `app/L0/_all/mod/_core/admin/views/files/` owns the firmware-backed admin file browser; it uses `space.api.fileList()` against app-rooted paths, starts at the authenticated user's `~/` home path, keeps the current path editable in a compact single-row toolbar with icon-only Up, Home, and Refresh actions, reports permission and not-found failures inline, supports arrow-key folder navigation plus `Space`-driven checkbox selection with per-folder highlighted-entry and scroll-position memory, exposes row-level `...` actions through the shared visual popover menu and switches to a selection-summary action row when one or more items are checked, keeps a clipboard summary row for cut or copied items with per-item removal plus paste-into-current-folder behavior, downloads files on double-click, uses `space.api.fileInfo()` to refuse browser text editing for files larger than 1 MB before opening the editor dialog, opens shared-visual dialogs for rename, delete confirmation, and text editing, keeps scrolling isolated to the file list instead of the whole panel, and keeps its styling on the shared `_core/visual` card, button, popover, and dialog primitives rather than introducing a separate admin-only theme
- `app/L0/_all/mod/_core/admin/views/agent/panel.html` plus the sibling files under `views/agent/` are the current reference for a firmware-backed admin-side chat surface; it is standalone within `_core/admin`, persists config to `~/conf/admin-chat.yaml`, persists history to `~/hist/admin-chat.json`, keeps the shipped `views/agent/system-prompt.md` as the fixed firmware prompt, uses `views/agent/compact-prompt.md` for user-invoked history compaction and `views/agent/compact-prompt-auto.md` for automatic loop-time compaction, stores only appended custom system instructions in config, injects those custom instructions into the runtime prompt under a `## User specific instructions` heading, persists a dedicated `max_tokens` compaction threshold alongside the provider/model config with a default of `64000`, exposes a settings-dialog Defaults action that resets provider/model/max-tokens/params back to firmware defaults while preserving the current API key field, auto-runs history compaction before the next user send and during the execution loop once the live prompt-history token count exceeds that threshold, trims older prompt-history blocks first on compaction retries so the newest continuation context survives, disables the composer while compaction is running, keeps the compact button immediately after the token-count label while placing the History and Clear actions on the right side of that row at the same compact text scale, shows per-message token counts in the prompt-history text view with the same compact number formatting used by the live history counter, does not depend on `_core/chat` or `_core/onscreen_agent`, keeps its attachment/runtime helpers local under `views/agent/`, uses its own `admin/res/` helmet and astronaut assets, reuses the shared `_core/visual` thread renderer, agent-thread styling, dialog layer, and composer-attachment chip visuals, now hosts its native dialogs through the shared body-teleported visual dialog layer, shows a live history token count plus compact action above the composer through the framework token-count wrapper, mirrors the overlay loop-control/runtime improvements by supporting a stop action, queued follow-up submissions, restored-attachment live-status revalidation, queued-message preview bubbles, and animation-frame streaming DOM patching with history persistence deferred to response or tool boundaries, renders browser execution steps as compact expandable status rows that collapse to summary width instead of stretching across the thread, reports successful execution steps with neither a return value nor console output as `execution <status>` plus `no result no console logs` instead of injecting a special protocol-correction retry, keeps assistant utility actions as minimal icon rows under the relevant message section, and keeps the prompt-history mode toggles in the modal header as icon-plus-text buttons while moving the copy action to the footer as an icon-only control opposite the text close button
- `app/L0/_all/mod/_core/admin/views/agent/skills.js` owns admin-agent skill discovery and `space.admin.loadSkill(name)` for browser execution; the system prompt is augmented on each request with a compact list built from top-level `app/L0/_all/mod/_core/admin/skills/*/SKILL.md` files, while the actual skill loader always reads the requested `SKILL.md` from the backend on demand
- `app/L0/_all/mod/_core/framework/js/initializer.js` plus its stable `ext/_core/framework/initializer.js/...` files are the current reference example for JS start/end extension hooks
- `app/L0/_all/mod/_core/framework/js/moduleResolution.js` reads `meta[name="space-max-layer"]` and appends `maxLayer` to framework-managed `/mod/...` and `/api/extensions_load` requests
- `app/L0/_all/mod/_core/framework/js/runtime.js` now publishes the authenticated API client at `space.api`, the shared Alpine store factory at `space.fw.createStore`, the frontmatter-aware markdown helper at `space.utils.markdown`, and the lightweight YAML helpers at `space.utils.yaml`
- `server/pages/login.html` contains the public login submit flow inline, can create a guest account through `/api/guest_create`, exchanges credentials for a server session before redirecting to `/`, and should remain a minimal pre-auth shell rather than a source of broader app composition logic
- `/login` is public and should not depend on authenticated `/mod/...` assets; keep any pre-auth styling and assets local while staying aligned with the shared design system
- `/logout` is handled entirely by the server pages layer; there is no standalone logout page shell in `app/` or `server/pages/`
- the current frontend runtime tree starts at `/mod/_core/framework/js/initFw.js`, installs `space.extend` from `/mod/_core/framework/js/extensions.js`, runs extensible framework bootstrap functions such as `/mod/_core/framework/js/initializer.js`, and then continues composing further runtime behavior by module and extension point while preserving the existing `_core/framework/initializer.js/...` hook contract
- the next phase of frontend development should add new `_core` modules and new extension seams instead of growing page shells or concentrating more logic in `_core/chat`
- when app structure, layer behavior, module layout, entry shells, or frontend conventions change, update this file in the same session

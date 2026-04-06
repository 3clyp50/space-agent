---
name: Modules And Routing
description: Place first-party modules correctly, make them routable, and use router seams instead of hardwiring features into shells.
---

Use this skill when creating or updating routed modules, deciding where files belong, or wiring a feature into the authenticated app shell.

## First-Party Module Placement

- Browser modules are namespaced as `mod/<author>/<repo>/...`.
- Repo-owned first-party modules should normally live under `app/L0/_all/mod/_core/<feature>/`.
- A routed feature should usually own its own `view.html` under that module root.
- Keep the module root as the real implementation location and use `ext/html/...` files only as thin adapters into existing seams.

## Router Resolution

- The main app is hash-routed.
- `#/dashboard` resolves to `/mod/_core/dashboard/view.html`.
- A multi-segment route such as `#/author/repo/path` resolves to `/mod/author/repo/path/view.html`.
- If the final route segment already ends in `.html`, the router resolves directly to that file under `/mod/...`.
- Query parameters stay attached to the resolved route target.

## Router-Owned Seams

Current routed shell anchors are:

- `_core/router/shell_start`
- `_core/router/shell_end`
- `page/router/route/start`
- `page/router/route/end`
- `page/router/overlay/start`
- `page/router/overlay/end`

Use those anchors before editing router shell markup directly. Floating UI such as the onscreen agent belongs in the routed overlay anchors.

## Common Module Shape

For a new first-party routed feature, the normal home is:

```text
app/L0/_all/mod/_core/<feature>/
  view.html
  <feature>.css
  store.js
  panel.html or supporting components
  ext/html/... only when the feature mounts into an existing seam
```

## Shell Rules

- `/` is the authenticated app shell and mounts `_core/router`.
- `/admin` is separate and firmware-clamped to `L0`; do not treat it as the default home for user-facing routed features.
- Keep page-shell concerns in the router or page shells and keep feature logic inside the owning module.

## Mandatory Doc Follow-Up

- If route resolution, stable router seams, or the first-party module placement rules change, update the router docs and the `development` skill subtree in the same session.

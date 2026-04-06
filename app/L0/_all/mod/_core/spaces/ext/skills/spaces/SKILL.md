---
name: Spaces Widgets
description: Create or update persisted space widgets through `space.current.renderWidget(...)` and the `_core/spaces` layout helpers.
metadata:
  always_loaded: true
---

Use this skill when the user asks the agent to create, update, patch, rearrange, or remove widgets inside a space.

## Storage Layout

- Spaces live under `~/spaces/<spaceId>/`.
- The manifest is `~/spaces/<spaceId>/space.yaml`.
- Widget files live under `~/spaces/<spaceId>/widgets/<widgetId>.yaml`.
- Widget-owned support files can live under `~/spaces/<spaceId>/data/` or `~/spaces/<spaceId>/assets/`.
- `space.yaml` stores space metadata plus the live layout.
- Each widget YAML file stores the widget metadata and the renderer code together in one file.

## Prefer The Runtime Helpers

The spaces module exposes `space.current` for the open space and `space.spaces` for broader CRUD.

Useful helpers:

- `await space.current.readWidget("widget-id-or-name")`
- `await space.current.patchWidget("widget-id", { name?, cols?, rows?, col?, row?, edits? })`
- `space.current.renderWidget({ id, name, cols, rows, renderer })`
- `space.current.removeWidget(widgetId)`
- `space.current.removeWidgets(["widget-id", ...])`
- `space.current.removeAllWidgets()`
- `await space.current.reload()`
- `await space.current.repairLayout()`
- `await space.current.rearrange()`
- `await space.current.rearrangeWidgets([{ id, col?, row?, cols?, rows? }, ...])`
- `await space.current.toggleWidgets(["widget-id", ...])`
- `space.current.widgets`
- `space.current.byId`
- `await space.spaces.listSpaces()`
- `await space.spaces.createSpace({ title })`
- `await space.spaces.removeSpace(spaceId)`
- `await space.spaces.openSpace(spaceId)`
- `await space.spaces.rearrangeWidgets({ spaceId?, widgets })`
- `await space.spaces.saveSpaceMeta({ id, title })`
- `await space.spaces.saveSpaceLayout({ id, widgetIds?, widgetPositions?, widgetSizes?, minimizedWidgetIds? })`
- `await space.spaces.toggleWidgets({ spaceId?, widgetIds })`
- `await space.spaces.upsertWidget({ spaceId?, widgetId?, name?, cols?, rows?, renderer?, source? })`
- `await space.spaces.patchWidget({ spaceId?, widgetId, name?, cols?, rows?, col?, row?, edits? })`
- `await space.spaces.removeWidgets({ spaceId?, widgetIds })`
- `await space.spaces.removeAllWidgets(spaceId? | { spaceId? })`
- `space.utils.markdown.render(text, target)`
- `space.spaces.items`
- `space.spaces.byId`
- `space.spaces.createWidgetSource({ id, name, cols, rows, renderer })`

If the user is already inside a space, prefer `space.current.*`. Freshly created spaces are empty canvases, so write the first widget yourself instead of expecting starter content.
While a space is open, the onscreen system prompt also injects the live `space.current.widgets` snapshot; those widget entries include `state`, `position`, logical `size`, and `renderedSize`.
`space.current.readWidget(...)` resolves current-space widgets by id or displayed name and returns compact plain text with plain metadata lines first, then `renderer:`, then the dedented renderer lines numbered from `0`.
Use those zero-based renderer line numbers for later `patchWidget(...)` edits. Metadata lines are descriptive context, not patch line targets.

## Widget Authoring Contract

Preferred shape:

```js
return await space.current.renderWidget({
  id: "hello",
  name: "Hello",
  cols: 6,
  rows: 3,
  renderer: async (parent, currentSpace) => {
    currentSpace.utils.markdown.render(
      [
        "### Hello widget",
        "",
        "Rendered directly from one YAML file."
      ].join("\\n"),
      parent
    );
  }
})
```

Rules:

- When the user asks to patch, tweak, fix, or slightly modify an existing widget, default to `readWidget(...)` plus `patchWidget(...)`. Treat `renderWidget(...)` as the fallback for new widgets or deliberate full rewrites.
- Before rewriting an existing widget, prefer `return await space.current.readWidget("widget-id-or-name")` so you inspect the current YAML-backed definition instead of guessing from the live layout snapshot alone.
- Do not read widget YAML directly through `space.api.fileRead(...)` when `space.current.readWidget(...)` or `space.spaces.readWidget(...)` can give you the numbered source instead.
- Prefer `return await space.current.patchWidget("widget-id", { edits: [...] })` for small targeted changes to an existing renderer, and `return await space.current.renderWidget(...)` for new widgets or full rewrites.
- `readWidget(...)` returns widget metadata first and then renderer lines numbered from `0`, for example `0 async (parent, currentSpace) => {`.
- `patchWidget(...)` only edits those numbered renderer lines. Use the explicit `name`, `cols`, `rows`, `col`, or `row` inputs for metadata changes.
- `patchWidget(...)` line edits follow the current numbered renderer output. Use `edits: [{ from, to?, content? }]` with raw replacement text that does not include line numbers.
- In `patchWidget(...)`, `from` and `to` are inclusive zero-based renderer line numbers. Omit `to` to insert before `from`. Omit `content` on a ranged edit to delete. Do not overlap edits, and do not renumber later edits after inserts, deletes, or length-changing replacements.
- In patch content, replace only the exact changed lines, do not include surrounding unchanged lines, and keep brackets or tags or function blocks syntactically complete.
- When authoring or rewriting a renderer, prefer `async (parent, currentSpace) => { ... }` so the global `space` runtime remains available by name inside the widget code.
- After any `return await space.current.renderWidget(...)` or `return await space.current.patchWidget(...)`, inspect the returned `widgetText` field before issuing another patch. Re-read after insertions, deletions, or multiline replacements so later line numbers stay correct.
- Widget size is capped at `24` columns by `24` rows. Do not ask for or persist anything larger than `24x24`.
- Choose a reasonable widget size based on the actual content instead of defaulting to oversized cards. One grid cell is roughly `85px` square, which is about `5.3rem` at a `16px` root font size, so pick sensible column and row counts and a reasonable aspect ratio for the UI you are rendering.
- Render into `parent`; it is the framework-owned net content box for the widget and excludes the title bar chrome. For markdown-heavy output, prefer `space.utils.markdown.render(markdownText, parent)`.
- Prefer the batch helpers over manual `saveSpaceLayout(...)` map surgery when the task is to move, minimize, restore, or delete several widgets.
- Widget content should adapt to the chosen card size and continue to behave correctly when the user resizes the widget later. Avoid layouts that only work at one exact size; prefer flexible wrapping, internal scrolling where appropriate, and sizing that follows the framework-provided render target instead of hard-coded viewport assumptions.
- If you attach listeners, timers, or other long-lived effects, return a cleanup function from `renderer(...)`.
- Do not patch unrelated global page DOM from widgets. Keep effects scoped to the widget unless there is an explicit user request.
- Do not capture plain unmodified keys from `window`, `document`, or other global listeners in ways that block typing into chat. If a widget needs keyboard input, require focus on the widget itself, or use modified shortcuts such as `Ctrl` or `Cmd` combinations instead of plain keys like letters, `Space`, or bare `Enter`.

## Recommended Agent Flow

1. Inspect or create the target space with `space.current` or `space.spaces`, read `space.current.widgets` for the live layout snapshot, and call `await space.current.readWidget("widget-id-or-name")` for any existing widget you plan to change.
2. If the task is a modification to an existing widget, patch it with `space.current.patchWidget(...)`. Use `space.current.renderWidget(...)` only for new widgets or deliberate full rewrites.
3. Use `await space.current.rearrangeWidgets(...)`, `await space.current.toggleWidgets(...)`, `await space.current.removeWidgets(...)`, or `await space.current.removeAllWidgets()` for batch layout or state changes.
4. Call `await space.current.repairLayout()` after bulk edits or if layout collisions are possible.
5. Call `await space.current.rearrange()` only when the user explicitly wants the built-in packed centered recovery layout.
6. Call `await space.current.reload()` only when you need to force a fresh replay.

## Persistence Rule

- Rewrite widgets by widget id instead of trying to patch previous DOM output.
- The manifest controls live order, live positions, live sizes, and minimized state.
- Widget YAML files control widget identity, default size, optional default position, and renderer code.
- Positions use a centered logical grid where `0,0` is the canvas origin and negative coordinates are valid.

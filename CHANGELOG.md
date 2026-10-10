# Changelog

All notable changes to `@cylayo/weaver-core`, `@cylayo/weaver-web` and `@cylayo/weaver-mcp`
are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
The three packages release together at one synchronized version. Weaver is pre-1.0, so the
public API may still change between minor versions.

> The 0.3.0 tag and npm publish are done by the maintainer. The date in the 0.3.0 heading
> is the release-prep date.

Earlier history is in [docs/PLAN.md](docs/PLAN.md). The git tags `v0.2.0` and `v0.2.1`
mark those releases. This file does not rewrite them.

## [0.3.0] - 2026-10-10

**Upgrade:** install `@cylayo/weaver-core`, `@cylayo/weaver-web` and `@cylayo/weaver-mcp`
at 0.3.0 together. Web and MCP now peer on `@cylayo/weaver-core` `0.3.x`, so a 0.2.x Core
does not satisfy them. No export was removed and no existing signature changed, so this
release has no breaking API change. The visual change under Changed affects hosts that
snapshot the primary button colour.

### Added

- **Prompt generation.** `generateA2UIV091Prompt()` in `@cylayo/weaver-core` compiles a
  trusted catalog into the A2UI v0.9.1 model prompt, so the allowed components, functions
  and actions match the catalog the runtime enforces. `mode: "create"` (the default) or
  `mode: "edit"` adds the incremental-update section. It returns `{ ok: true, value: { text,
  sections } }` or a typed `A2UIPromptGenerationError`, and never a partial prompt. Its
  error codes are `CATALOG_INVALID`, `ACTION_NAME_INVALID`, `PROMPT_TOO_LARGE` (default
  budget 24,000 characters) and `EXAMPLE_INVALID`. `EXAMPLE_INVALID` carries `stage`
  (`runtime`, `process` or `resolve`) and the Core error that caused it. See
  [docs/prompt-generation.md](docs/prompt-generation.md).
- **Shipped Basic examples.** `A2UI_V091_BASIC_PROMPT_EXAMPLES` exports the canonical Basic
  catalog examples. The generator validates every example, including these, before it
  appears in a prompt. See [docs/prompt-generation.md](docs/prompt-generation.md#example-validation).
- **Catalog definition helper.** `defineCatalog()`, with the types `CatalogDefinition` and
  `A2UIV091CatalogSchema`, attaches a catalog id to a schema. It does not validate the
  schema, and registration still validates it. This helper was added after the 0.2.1 tag.
  See [docs/custom-catalogs.md](docs/custom-catalogs.md).
- **Runtime observer.** `WeaverRuntimeConfig.observer` takes a `WeaverRuntimeObserver`. It
  receives a `WeaverRuntimeEvent` for each `process()` (including `processMany()`),
  `writeInput()` and `dispatchAction()`, in order. Payloads are defensive copies, and an
  exception thrown by the observer is ignored, so it cannot change a result or state. The
  observer is opt-in and costs nothing when it is not set. See
  [docs/debugging.md](docs/debugging.md#turn-on-the-observer-and-the-recorder).
- **Trace recorder.** `createWeaverTraceRecorder()` builds an observer that keeps a bounded
  in-memory `weaver-trace` version 1 document (`WEAVER_TRACE_FORMAT`, `WEAVER_TRACE_VERSION`).
  `maxEntries` defaults to 5000. `recordIngestion()` captures JSONL frame errors, and
  `getTrace()` returns a copy. See [docs/debugging.md](docs/debugging.md#what-a-trace-holds).
- **Trace parsing and replay.** `parseWeaverTrace()` validates an untrusted value and returns
  a copy or a typed error (`WRONG_FORMAT`, `UNSUPPORTED_VERSION` or `MALFORMED_TRACE`).
  `replayWeaverTrace(trace, { runtime, until })` re-issues each entry on a fresh runtime and
  reports a per-step divergence when the outcome or error code changes. See
  [docs/debugging.md](docs/debugging.md#replay).
- **Error descriptions in Core.** `describeWeaverError()` turns every typed Core error into a
  `WeaverErrorDescription` with a stable `code`, `severity`, `summary`, optional `hint` and
  location fields, and a flattened `causes` list. It covers message, JSONL, surface
  resolution, runtime interaction, stream ingestion, runtime configuration, function registry
  and prompt generation errors. See [docs/debugging.md](docs/debugging.md#reading-errors).
- **Error descriptions in Web.** `describeWebRenderError()` in `@cylayo/weaver-web` describes
  every `WebRenderError`, `WebInteractionError` and local-state error in the same shape. See
  [docs/debugging.md](docs/debugging.md#render-failures-and-the-stale-dom).
- **Documentation.** New guides: [docs/prompt-generation.md](docs/prompt-generation.md),
  [docs/debugging.md](docs/debugging.md) and [docs/custom-catalogs.md](docs/custom-catalogs.md).

### Changed

- **Visual change: default primary accent.** When no host sets `--a2ui-color-primary`, the
  Basic primary accent is now `#0969da` instead of `#1177ee`. White text on the old colour had
  a 4.288:1 contrast ratio, below the WCAG AA minimum of 4.5:1 for small text. On the new
  colour it is 5.192:1. The accent applies to the primary Button, the selected Tabs label and
  underline, and the CheckBox, Slider and ChoicePicker accents. The ChoicePicker accent covers
  its radio and checkbox options and the selected option's border. A host-set
  `--a2ui-color-primary` still overrides the default. So does an agent `theme.primaryColor`,
  but only when the host opts into `createBasicCatalogThemeAdapter` and the value is `#rrggbb`.
  Hosts that snapshot the old colour will see a diff. See
  [docs/web-rendering.md](docs/web-rendering.md) for the precedence order.
- **Basic Button focus.** A Basic `Button` registers as a focus-restorable control, keyed by its
  source component, scope and action. Keyboard focus stays on the button when a data-model
  update re-renders the surface.
- **`WebRenderError` carries the surface id.** The `SURFACE_RESOLUTION_FAILED` variant has an
  optional `surfaceId?: string`. `WebSurfaceRenderer` always sets it. Code that builds this
  variant by hand still type-checks. `describeWebRenderError()` prefers this id. See
  [docs/debugging.md](docs/debugging.md#render-failures-and-the-stale-dom).
- **Version metadata.** The three packages are `0.3.0`. Web and MCP peer on
  `@cylayo/weaver-core` `0.3.x`. `WEAVER_CORE_VERSION` is `"0.3.0"`.

### Fixed

- **Primary Button contrast.** The primary Button's small text did not meet WCAG AA contrast on
  the old default accent. The new default accent meets it (see the visual change above).
- **Focus after rerender.** Keyboard focus on a Basic Button is restored after a data-model
  rerender (see Basic Button focus above).

### Documented behaviour (no code change)

- **A failed render keeps the last good state.** A render that fails, for example because it
  exceeds the Basic resolution budget, leaves the store with the data Core accepted. The DOM
  keeps the last successful render. Hosts see the failure through `onError`. See
  [docs/web-rendering.md](docs/web-rendering.md#render-failures-and-the-last-good-render) and
  [docs/debugging.md](docs/debugging.md#render-failures-and-the-stale-dom).
- **A leading slash in a template path means the DataModel root.** Inside a List template,
  `{ "path": "/name" }` reads `name` from the DataModel root, not from the current item. A
  path without a slash reads from the item. If the root has no value, the text renders empty
  with no diagnostic. See [docs/architecture.md](docs/architecture.md) and
  [docs/debugging.md](docs/debugging.md#symptom-template-text-is-empty-with-no-error).

### Notes

- **Compatibility.** No export was removed since 0.2.1. The changes to existing types are
  additive: the optional `observer` on `WeaverRuntimeConfig` and the optional `surfaceId` on
  the `SURFACE_RESOLUTION_FAILED` variant.
- **Trace limits.** Replay does not rebuild state from dropped entries, and it sends the
  `{ unserializable: true }` marker in place of a non-JSON-safe rejected value, so a step can
  diverge. See [docs/debugging.md](docs/debugging.md#guarantees-and-limits).
- **Positional collections.** Collection replay uses array positions, as the v0.9.1 semantics
  require. See [docs/debugging.md](docs/debugging.md#guarantees-and-limits).
- **Examples are not published.** `@weaver/cookbook`, `@weaver/playground`,
  `@weaver/reference-app` and `@weaver/shared` are private workspace packages. The cookbook
  screens and its custom catalog recipe, including the DataTable and BarChart renderers, live
  under `examples/` and are not in the npm tarballs.
- **Documentation links.** `pnpm check:docs` checks every relative Markdown link and anchor in
  the tracked `.md` files. CI runs it as a gate.

# Changelog

All notable changes to `@cylayo/weaver-core`, `@cylayo/weaver-web` and `@cylayo/weaver-mcp`
are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
The three packages release together at one synchronized version. Weaver is pre-1.0, so the
public API may still change between minor versions.

> The 0.3.0 and 0.3.1 tags and npm publishes are done by the maintainer. 0.4.0 is unreleased. The date in each
> release heading is the release-prep date.

Earlier history is in [docs/PLAN.md](docs/PLAN.md). The git tags `v0.2.0` and `v0.2.1`
mark those releases. This file does not rewrite them.

## 0.4.0 (unreleased)

**Upgrade:** this is a breaking release. It implements A2UI v1.0 as a hard cutover, and it
does not accept A2UI v0.9 messages. Install `@cylayo/weaver-core`, `@cylayo/weaver-web` and
`@cylayo/weaver-mcp` at 0.4.0 together. Web and MCP peer on `@cylayo/weaver-core` `0.4.x`.
Read the migration guide below before you upgrade. This release is not published yet.

### Breaking changes

**Protocol and wire format**

- The only accepted wire version is `"1.0"`. Messages with `v0.9` or `v0.9.1` are rejected.
  Renderer capabilities use the namespace key `"1.0"`.
- Bindings are `{"@path": ...}` and `{"@call": ...}`. A bare `path` or `call` key is not a binding.
  A bare key that the catalog does not declare fails with `INVALID_RESERVED_KEY`. A literal string that
  begins with `@` is escaped as `@@`.
- Envelope metadata uses the `@accessibility`, `@checks` and `@metadata` keys. A bare
  `accessibility`, `checks` or `metadata` key is rejected unless the catalog declares that
  property. This strictness is deliberate.
- `theme` is removed from `createSurface`. `createSurface` with a `theme` is rejected.
- `createSurface` may carry `components` and `dataModel`. They are applied atomically with the
  surface.
- A second `createSurface` for an existing surface fails with `INTEGRITY_ERROR`.
- `updateDataModel` requires `value`. A `null` value deletes the path. An update without `value`
  is rejected.
- Component ids follow the UAX #31 identifier pattern (`^[\p{XID_Start}_][\p{XID_Continue}]*# Changelog

All notable changes to `@cylayo/weaver-core`, `@cylayo/weaver-web` and `@cylayo/weaver-mcp`
are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
The three packages release together at one synchronized version. Weaver is pre-1.0, so the
public API may still change between minor versions.

> The 0.3.0 and 0.3.1 tags and npm publishes are done by the maintainer. The date in each
> release heading is the release-prep date.

Earlier history is in [docs/PLAN.md](docs/PLAN.md). The git tags `v0.2.0` and `v0.2.1`
mark those releases. This file does not rewrite them.

).
  An id with a hyphen, or one that starts with a digit, is rejected.
- `ValidationResult` checks carry a `severity`. An advisory check does not block a message.
- Regular expressions use the A2UI regex dialect, with the limits `REGEX_MAX_PATTERN_CODE_POINTS`
  (256) and `REGEX_MAX_VALUE_CODE_POINTS` (4096).
- Calling `openUrl` requires user activation. The runtime grants it only for an explicit gesture,
  `dispatchAction` with `userActivation: true`.

**Catalogs and functions**

- A catalog declares `protocolVersion: "1.0"`. A catalog without it is rejected.
- A catalog declares its functions in a `functions` map.
- `common_types.json` is built into Weaver. A catalog that embeds it is rejected.
- A component may declare `allowedParents` and `allowedChildren`. They are accepted but not
  enforced in 0.4.0.
- The Basic Catalog is `https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json`.
- The Basic Catalog changes: `Text` takes the v1.0 variants, `TextField` takes `placeholder`
  and loses `validationRegexp`, `Slider` takes `steps`, and `Video` takes `posterUrl`. Use the
  `@checks` `regex` function for pattern validation.
- The media URL rule from the specification is checked before the host `resourcePolicy` is
  consulted.
- The generated prompt includes each catalog's `instructions`.

**Removed exports and options**

- Web: `createBasicCatalogThemeAdapter`, `BasicCatalogThemeAdapterOptions`,
  `WebSurfaceThemeAdapter`, `WebSurfaceThemeInput`, `WebSurfaceThemeResult`, the `themeAdapter`
  option of the surface renderer and of `createBasicWebRuntime`, and the `THEME_ADAPTER_FAILED`
  error code.
- Web: the `regexMatcher` option on the Basic renderer registrations
  (`createBasicCatalogRendererRegistrations`, `createBasicWebRuntime({ basic })`). Core's
  `createBasicCatalogFunctionImplementations` keeps its own `regexMatcher` option.
- Core: `isDataPathBinding` (use `isDataBinding`) and the `DataPathBinding` type (use
  `DataBinding`).
- Core: the error codes `THEME_SCHEMA_NOT_FOUND` and `THEME_VALIDATION_FAILED`, and the `CatalogThemeValidationResult` type.
- Core: the `UNSUPPORTED_FEATURE` error code and the `UnsupportedFeature` type. Multi-catalog surfaces
  no longer produce them.

**Renames**

Version names move from `V091` to `V10`:

| 0.3.x | 0.4.0 |
|---|---|
| `createA2UIV091Producer` | `createA2UIV10Producer` |
| `createA2UIV091StreamIngestion` | `createA2UIV10StreamIngestion` |
| `createBasicCatalogV091Registration` | `createBasicCatalogV10Registration` |
| `generateA2UIV091Prompt` | `generateA2UIV10Prompt` |
| `A2UI_V091_BASIC_CATALOG`, `A2UI_V091_BASIC_CATALOG_ID` | `A2UI_V10_BASIC_CATALOG`, `A2UI_V10_BASIC_CATALOG_ID` |
| `A2UI_V091_BASIC_PROMPT_EXAMPLES` | `A2UI_V10_BASIC_PROMPT_EXAMPLES` |
| `A2UIV091CatalogSchema`, `A2UIV091WireVersion`, `A2UIV091PromptGenerationError`, and the other `A2UIV091*` types | the matching `A2UIV10*` names |

Client and server become renderer and agent:

| 0.3.x | 0.4.0 |
|---|---|
| `validateA2UIServerMessage` | `validateA2UIAgentMessage` |
| `A2UIServerMessage` | `A2UIAgentMessage` |
| `buildA2UIClientCapabilities` | `buildA2UIRendererCapabilities` |
| `buildA2UIValidationFailedClientMessage` | `buildA2UIValidationFailedRendererMessage` |
| `A2UIValidationFailedClientMessage` | `A2UIValidationFailedRendererMessage` |
| `A2UIClientActionMessage` | `A2UIRendererActionMessage` |
| `A2UIClientCapabilities` | `A2UIRendererCapabilities` |
| `A2UIClientDataModel` | `A2UIRendererDataModel` |
| `session.getClientCapabilities()` | `session.getRendererCapabilities()` |
| metadata key `a2uiClientDataModel` | `a2uiRendererDataModel` |
| metadata key `a2uiClientCapabilities` (HTTP/SSE stream and send metadata) | `a2uiRendererCapabilities` |
| MCP `_meta.a2ui.clientCapabilities` | `_meta.a2ui.rendererCapabilities` |
| MCP `_meta.a2ui.clientDataModel` | `_meta.a2ui.rendererDataModel` |

**Repository**

- The root script `conformance:v0.9.1` is renamed `conformance:v1.0`.
- The tracker `docs/conformance-v0.9.1.md` is renamed `docs/conformance-v1.0.md`.

### Not yet supported

- Enforcement of composition constraints (`allowedParents`, `allowedChildren`). They are accepted
  but not checked.

### Added

- A2UI v1.0 features: the `@path` and `@call` bindings, the `@@` escape, the `@index` template
  variable, function-level `requiresUserActivation` and `allowedCallers`, and checks with severity.
  See [docs/conformance-v1.0.md](docs/conformance-v1.0.md) for the status of each item.
- Remote function calls in both directions. The agent's `callRendererFunction` is answered with a
  `rendererFunctionResponse`. A renderer call with no local implementation becomes a
  `callAgentFunction`, which the host sends and answers with `agentFunctionResponse`. The runtime
  takes `agentFunctions` config with `onCallQueued`, and `takeAgentFunctionCalls(surfaceFilter?)`,
  and the transport session's `drainOutbound(routeId)` takes only that route's calls (other calls
  stay queued). A session result's type includes the resumed `action`,
  `cancelAgentFunctionCall()` and `agentFunctionSettled` surface changes. The Web HTTP/SSE transport
  adds `runtime`, `flushAgentCalls()` and `sendActionCalls()`, and the Web renderer adds
  `onAgentFunctionCalls`. The MCP bridge adds `runtime`, `reply`, `onDiagnostic`, `flushAgentCalls()`
  and `sendActionCalls()`. See [docs/architecture.md](docs/architecture.md#remote-function-calls).
- The typed `INVALID_RESERVED_KEY` and `CATALOG_RESOLUTION_FAILED` errors, with descriptions in
  `describeWeaverError()`.
- Multi-catalog surfaces. A component resolves to its `@catalogId`, else to the surface's default
  `catalogId`, and each function call resolves to its own `catalogId`, else to the surface default.
  `createSurface.catalogId` is optional, so a surface may have no default and every component then
  names its own catalog. A component or call that resolves to no catalog is rejected at ingress
  with `CATALOG_RESOLUTION_FAILED`, and nothing is stored. Each embedded call is validated against
  its resolved catalog. Hydrated instances carry their resolved `catalogId`. The Web renderer looks
  up each component's renderer in that catalog. A component whose resolved catalog has no registered
  renderer fails the render with `RENDERER_NOT_FOUND`, as any missing renderer does. The prompt
  generator takes a `defaultCatalogId` option. See
  [docs/architecture.md](docs/architecture.md#catalog-resolution).
- `docs/conformance-v1.0.md`, a requirement tracker for v1.0 that marks each item as implemented,
  planned or an accepted limitation.

### Changed

- A declared function with no implementation, an `agentOnly` function called from a binding or an
  action, and invalid routed arguments now report `EXPRESSION_ERROR`. They used to report
  `FUNCTION_IMPLEMENTATION_NOT_FOUND`, `FUNCTION_CALLER_NOT_ALLOWED` and `FUNCTION_VALIDATION_FAILED`.
- A nested function call no longer inherits the catalog of the call that encloses it. It resolves its
  own `catalogId`, else the surface default. The exception is a `${...}` call inside a `formatString`,
  which takes that `formatString` call's catalog. `@index` belongs to no catalog.
- A function call whose name the component's catalog does not declare now fails at ingress as
  `CATALOG_REGISTRY_ERROR` (`FUNCTION_NOT_ALLOWED`). It used to fail as `COMPONENT_VALIDATION_FAILED`.
- `CatalogRegistry.validateComponent` no longer checks function calls. Component schemas accept any
  `FunctionCall` envelope. Use `CatalogRegistry.validateFunctionCall` to check a call against its catalog.
- The prompt generator takes a `defaultCatalogId` option in `A2UIV10PromptConfig`. A prompt generated
  without it describes a surface with no default catalog, so every component sets `"@catalogId"` and
  every function call sets `"catalogId"`.
- `WebSurfaceAttributionInput.catalogId` is optional, because a surface may have no default catalog.
- A binding that waits on an agent call resolves to `null` until the answer or the cancellation.
- `EXPRESSION_ERROR` may carry a `functionCallId`, which names the call that failed.
- The new `MCP_DELIVERY_UNSUPPORTED` code is returned by an MCP bridge with no `reply` callback when
  asked to send a response or a call.
- `createBrowserA2UIHttpSseTransport` and `createA2UIMcpClientBridge` require `runtime`, the
  `WeaverRuntime` that the session wraps.

### Migrating from 0.3.x

1. Install 0.4.0 of all three packages. Remove any `theme` you pass to `createSurface`.

2. Change the version on every message, and the Basic catalog id:

   ```json
   { "version": "v0.9.1", "createSurface": { "surfaceId": "main", "catalogId": "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json" } }
   ```

   becomes

   ```json
   { "version": "1.0", "createSurface": { "surfaceId": "main", "catalogId": "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json" } }
   ```

   `createBasicWebRuntime().catalogId` and `A2UI_V10_BASIC_CATALOG_ID` already hold the v1.0 id.

3. Add the `@` prefix to bindings:

   ```json
   { "text": { "path": "/user/name" } }
   ```

   becomes

   ```json
   { "text": { "@path": "/user/name" } }
   ```

4. Write `value` on `updateDataModel`. Use `null` where you meant a deletion:

   ```json
   { "version": "v0.9.1", "updateDataModel": { "surfaceId": "main", "path": "/draft" } }
   ```

   becomes

   ```json
   { "version": "1.0", "updateDataModel": { "surfaceId": "main", "path": "/draft", "value": null } }
   ```

5. Move pattern validation from `validationRegexp` to `@checks`. Use the `regex` function, and give
   the check a `message`:

   ```json
   { "id": "code", "component": "TextField", "value": { "@path": "/form/code" }, "validationRegexp": "^[A-Z]{3}$" }
   ```

   becomes

   ```json
   {
     "id": "code",
     "component": "TextField",
     "value": { "@path": "/form/code" },
     "@checks": [
       {
         "condition": { "@call": "regex", "args": { "value": { "@path": "/form/code" }, "pattern": "^[A-Z]{3}$" } },
         "message": "Use three capital letters."
       }
     ]
   }
   ```

6. Rename component ids that contain a hyphen. For example, `"id": "submit-button"` becomes
   `"id": "submit_button"`.

7. Rename the metadata keys: `accessibility`, `checks` and `metadata` become `@accessibility`,
   `@checks` and `@metadata`.

8. In code, rename the symbols in the tables above. For example:

   ```ts
   import { createA2UIV091Producer, createBasicCatalogV091Registration } from "@cylayo/weaver-core";
   ```

   becomes

   ```ts
   import { createA2UIV10Producer, createBasicCatalogV10Registration } from "@cylayo/weaver-core";
   ```

9. Remove `themeAdapter`, `createBasicCatalogThemeAdapter` and `regexMatcher` from Web Basic
   registration options. Replace `isDataPathBinding` with `isDataBinding`.

10. Rename `conformance:v0.9.1` in your own scripts to `conformance:v1.0` if you copied it.

## [Unreleased]

- Examples: the hosted Weaver Playground (`examples/playground/index.html`) edits A2UI v0.9.1 JSONL, with a live preview, an inspector and a GitHub Pages workflow. The Basic component bench moved to `components.html`. No package changed.
- Site: a static landing page in `site/` (`@weaver/site`) with an interactive, mocked agent-app demo, deployed at the GitHub Pages root beside the Playground. No package changed.
- Site: the landing page's agent-app demo now runs on the real Weaver runtime (Core and Web, Basic Catalog), with allowlisted inputs and actions and photos allowed only from the site's own `images/` folder. No package changed.

## [0.3.1] - 2026-10-11

**Upgrade:** none. This release is documentation and package metadata only. Install
`@cylayo/weaver-core`, `@cylayo/weaver-web` and `@cylayo/weaver-mcp` at 0.3.1 together, as before.

### Changed

- **Package READMEs and keywords on the npm pages.** Each package ships a `README.md` with a
  description, an install line, one example, a package chooser and links to the documentation.
  Each `package.json` has a `keywords` array. The READMEs and keywords now appear on the npm
  pages of `@cylayo/weaver-core`, `@cylayo/weaver-web` and `@cylayo/weaver-mcp`.
  `pnpm verify:packages` checks the README examples and links.
- **Version metadata.** The three packages are `0.3.1`. Web and MCP still peer on
  `@cylayo/weaver-core` `0.3.x`. `WEAVER_CORE_VERSION` is `"0.3.1"`.

### Notes

- **No API or behaviour change.** The exports of all three packages are the same as in 0.3.0.
  No function, type, error code or default changed.
- **The 0.3.0 npm pages stay as they are.** npm cannot change a published version, so the
  0.3.0 pages do not show the READMEs or keywords. Install 0.3.1 to see them.

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
  sections } }` or a typed `A2UIV091PromptGenerationError`, and never a partial prompt. Its
  error codes are `CATALOG_INVALID`, `ACTION_NAME_INVALID`, `PROMPT_TOO_LARGE` (default
  budget 24,000 characters) and `EXAMPLE_INVALID`. `EXAMPLE_INVALID` carries `stage`
  (`runtime`, `process` or `resolve`) and the Core error that caused it. See
  [docs/prompt-generation.md](docs/prompt-generation.md).
- **Shipped Basic examples.** `A2UI_V091_BASIC_PROMPT_EXAMPLES` exports the canonical Basic
  catalog examples. The generator validates every example, including these, before it
  appears in a prompt. See [docs/prompt-generation.md](docs/prompt-generation.md#examples-are-checked). The constant is deeply frozen: the examples, their `messages` arrays and each message object are read-only at runtime.
- **Catalog definition helper.** `defineCatalog()`, with the types `CatalogDefinition` and
  `A2UIV091CatalogSchema`, attaches a catalog id to a schema. It does not validate the
  schema, and registration still validates it. This helper was added after the 0.2.1 tag.
  See [docs/custom-catalogs.md](docs/custom-catalogs.md).
- **Runtime observer.** `WeaverRuntimeConfig.observer` takes a `WeaverRuntimeObserver`. It
  receives a `WeaverRuntimeEvent` for each `process()` (including `processMany()`),
  `writeInput()` and `dispatchAction()`, in order. Payloads are defensive copies, and an
  exception thrown by the observer is ignored, so it cannot change a result or state. The
  observer is opt-in and costs nothing when it is not set. See
  [docs/debugging.md](docs/debugging.md#record-a-trace).
- **Trace recorder.** `createWeaverTraceRecorder()` builds an observer that keeps a bounded
  in-memory `weaver-trace` version 1 document (`WEAVER_TRACE_FORMAT`, `WEAVER_TRACE_VERSION`).
  `maxEntries` defaults to 5000. `recordIngestion()` captures JSONL frame errors, and
  `getTrace()` returns a copy. See [docs/debugging.md](docs/debugging.md#privacy-and-security).
- **Trace parsing and replay.** `parseWeaverTrace()` validates an untrusted value and returns
  a copy or a typed error (`WRONG_FORMAT`, `UNSUPPORTED_VERSION` or `MALFORMED_TRACE`).
  `replayWeaverTrace(trace, { runtime, until })` re-issues each entry on a fresh runtime and
  reports a per-step divergence when the outcome or error code changes. See
  [docs/debugging.md](docs/debugging.md#validate-and-replay-a-trace).
- **Error descriptions in Core.** `describeWeaverError()` turns every typed Core error into a
  `WeaverErrorDescription` with a stable `code`, `severity`, `summary`, optional `hint` and
  location fields, and a flattened `causes` list. It covers message, JSONL, surface
  resolution, runtime interaction, stream ingestion, runtime configuration, function registry
  and prompt generation errors. See [docs/debugging.md](docs/debugging.md#describe-an-error-for-a-person).
- **Error descriptions in Web.** `describeWebRenderError()` in `@cylayo/weaver-web` describes
  every `WebRenderError`, `WebInteractionError` and local-state error in the same shape. See
  [docs/debugging.md](docs/web-rendering.md#render-failures-and-the-last-good-render).
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
  [docs/debugging.md](docs/web-rendering.md#render-failures-and-the-last-good-render).
- **Version metadata.** The three packages are `0.3.0`. Web and MCP peer on
  `@cylayo/weaver-core` `0.3.x`. `WEAVER_CORE_VERSION` is `"0.3.0"`.

### Fixed

- **Primary Button contrast.** The primary Button's small text did not meet WCAG AA contrast on
  the old default accent. The new default accent meets it (see the visual change above).
- **Focus after rerender.** Keyboard focus on a Basic Button is restored after a data-model
  rerender (see Basic Button focus above).
- **Core tarball.** `@cylayo/weaver-core` no longer includes an internal test fixture module
  (`dist/protocol/a2ui/v0_9_1/fixtures.*`). It was never part of the public API.
- **Observer hang.** An untyped `dispatchAction()` request with a circular field no longer makes
  a runtime with an observer run out of memory. Such a runtime returns what it returns without an
  observer. Payloads that are not JSON-safe reach the observer as described under Notes.

### Documented behaviour (no code change)

- **A failed render keeps the last good state.** A render that fails, for example because it
  exceeds the Basic resolution budget, leaves the store with the data Core accepted. The DOM
  keeps the last successful render. Hosts see the failure through `onError`. See
  [docs/web-rendering.md](docs/web-rendering.md#render-failures-and-the-last-good-render) and
  [docs/debugging.md](docs/web-rendering.md#render-failures-and-the-last-good-render).
- **A leading slash in a template path means the DataModel root.** Inside a List template,
  `{ "path": "/name" }` reads `name` from the DataModel root, not from the current item. A
  path without a slash reads from the item. If the root has no value, the text renders empty
  with no diagnostic. See [docs/architecture.md](docs/architecture.md) and
  [docs/debugging.md](docs/debugging.md).

### Notes

- **Compatibility.** No export was removed since 0.2.1. The changes to existing types are
  additive: the optional `observer` on `WeaverRuntimeConfig` and the optional `surfaceId` on
  the `SURFACE_RESOLUTION_FAILED` variant.
- **Trace limits.** Replay does not rebuild state from dropped entries, and it sends the
  `{ unserializable: true }` marker in place of a value that is not JSON-safe, so a step can
  diverge. See [docs/debugging.md](docs/debugging.md#privacy-and-security).
- **Positional collections.** Collection replay uses array positions, as the v0.9.1 semantics
  require. See [docs/debugging.md](docs/debugging.md#privacy-and-security).
- **Replay codes are strings.** Replay divergence codes (`recorded.code` and `replayed.code`) are
  plain strings, not members of a typed union. `WEAVER_TRACE_REPLAY_INVALID_INPUT` has the value
  `"REPLAY_INVALID_INPUT"`. See [docs/debugging.md](docs/debugging.md#privacy-and-security).
- **Observer payloads.** Every caller-supplied value is checked for JSON-safety before the
  observer copies it. A value that is not JSON-safe reaches the observer as
  `{ unserializable: true }`, and an untyped `dispatchAction()` request that is not JSON-safe
  reaches it reduced to its four typed fields. Core results are JSON-safe, so no event is dropped
  in practice. If building an event throws for another reason, that event is dropped without a
  signal, as an observer exception is. See
  [docs/debugging.md](docs/debugging.md#record-a-trace).
- **Examples are not published.** `@weaver/cookbook`, `@weaver/playground`,
  `@weaver/reference-app` and `@weaver/shared` are private workspace packages. The cookbook
  screens and its custom catalog recipe, including the DataTable and BarChart renderers, live
  under `examples/` and are not in the npm tarballs.
- **Documentation links.** `pnpm check:docs` checks every relative Markdown link and anchor in
  the tracked `.md` files. CI runs it as a gate.

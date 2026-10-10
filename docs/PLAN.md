# Weaver Framework Plan

Weaver is an independent interface runtime framework. Package boundaries remain
strict: `@cylayo/weaver-core` has no Web or MCP dependency; adapters depend on Core.

## Completed Core milestones

- A2UI v0.9.1 protocol validation and JSONL framing
- trusted catalog registration and trusted host function execution
- surface and data-model state
- progressive component trees, scoped instances, property hydration, and checks
- input binding and transport-neutral action dispatch
- nested/wrapped dynamic property hydration
- `WeaverRuntime` composition and orchestration facade
- Basic Catalog component renderer coverage
- opt-in trusted Basic Catalog pure functions
- security-sensitive Basic functions (`regex` and browser `openUrl`)
- Basic Catalog surface theme bridge
- Basic Catalog component weight
- safe Text Markdown + TextField `validationRegexp`
- Basic functional/accessibility hardening
- Basic visual hardening

`WeaverRuntime` is now the recommended application entry point. Lower-level Core
classes remain public for advanced composition. Runtime creation fixes the host's
trusted catalogs and function implementations. An empty catalog list is valid,
but no surface can be created until a trusted catalog exists; because runtime
configuration is immutable, such a runtime is useful only for hosts that do not
process surfaces.

## Completed phase: A2UI v0.9.1 Core/Web foundation

Completed Web milestones:

```text
RendererRegistry + minimal DOM rendering
Web interaction bridge
Basic Catalog foundation renderers
trusted surface attribution boundary
```

The Core runtime facade is complete. Web consumes resolved surfaces through an
immutable trusted renderer registry, reactively rebuilds mount-owned DOM
subtrees, and delegates narrow input/action callbacks to current runtime state.
Core now hydrates catalog-declared nested and `allOf`-wrapped dynamic values.
Basic Catalog input and media renderers (including their host resource policy) are complete. Nested structural component references, Tabs with mount-local renderer state, the Basic Catalog Modal renderer, and Icon bindable-union hydration plus the Icon renderer are complete. Basic Catalog component renderer coverage is complete. Core now provides opt-in trusted Basic Catalog validation, logic, formatting, interpolation, and host-matched regex functions. Web provides an independently opt-in browser `openUrl` action function. No Basic function is installed automatically.
Web must not duplicate Core state, protocol validation, catalog trust, checks,
or action behavior.

## Task 35 — A2UI v0.9.1 conformance audit

Complete. The canonical requirement-by-requirement tracker is
[`conformance-v0.9.1.md`](conformance-v0.9.1.md). It supersedes the prior roadmap
ordering for remaining conformance work.

## Task 36 — protocol outbound conformance

Complete. Core now owns exact transport-neutral A2UI capability and validation-error objects, including typed process-failure mapping and pinned official outbound-schema tests. No transport or delivery adapter was added.

## Task 37 — Basic functional/accessibility hardening

Complete. Web now owns directional List scrolling and horizontal item constraints, explicit Row/Column `justify=stretch` semantics, visible validation-message association (including a renderer-owned TextField regexp mismatch message), and nested Modal keyboard/focus regression behavior.

## Task 38 — Basic visual hardening

Complete. Basic Web now owns deterministic leaf margins, Text and Image variants, transparent outlined Cards, explicit Divider geometry, three Button treatments, and native ChoicePicker list/chip presentation. Host visual variables remain independent from the narrow agent primary-color bridge.

## Task 39 — trusted surface attribution boundary

Complete. Web now accepts an optional trusted host attribution provider and renders only its verified display name and optional host-approved icon in Weaver-owned chrome outside the A2UI tree. Raw theme identity claims remain inert.

## Task 40 — final A2UI v0.9.1 conformance gate

Complete. The release gate pins official inbound and outbound schemas, adds architecture/security regressions, locks positional Tabs/template behavior, records detached-construction evidence, and smoke-tests all 18 Basic components and all 14 Basic functions. R155 remains an accepted renderer hardening limitation; it is not a wire-conformance failure.

The A2UI v0.9.1 Core/Web foundation phase is complete.

## Next phase: transport and MCP integration

## Task 41 — transport session ownership and routing

Complete. Core now provides a transport-neutral `A2UITransportSession`: trusted
host-assigned opaque routes own surfaces only after successful creation, guard
inbound mutations, release ownership after successful deletion, and resolve
actions plus optional client-data-model metadata to one owner route. Validation
responses resolve to their inbound source route. No network transport was added.

## Task 42 — browser HTTP + SSE transport adapter

Complete. Web now provides a Weaver-defined, one-route browser adapter that opens
a POST SSE stream, incrementally decodes bounded UTF-8 events in order, routes
them through `A2UITransportSession`, and serializes routed action/validation POSTs
with capabilities and optional client-data-model metadata. It adds no retry,
reconnection, authentication, server implementation, or generic transport layer.

## Task 43 — HTTP/SSE reference server and loopback interoperability

Complete. A dependency-free, loopback-only Node reference server now documents and enforces the Task 42 wrappers, bounded JSON requests, one trusted peer/active SSE stream, exact JSON SSE writing, and client-message observation. Normal Web tests prove real-socket handshake, ordered runtime updates, actions with optional model metadata, validation-error return, route rejection, stream reopening/ownership lifecycle, and two-server targeted delivery.

## Task 44 — bounded HTTP/SSE reconnect and resume

Complete. Web now supports explicit per-run finite fixed-delay reconnect, adapter-local SSE event-ID cursors, `Last-Event-ID` resume across reconnect and manual reruns, typed exhaustion/resume-unavailable outcomes, and abortable waits. The loopback reference peer assigns monotonic IDs and provides bounded in-memory ordered replay without changing Core ownership or A2UI objects.

## Task 45 — MCP v2 A2UI client bridge

Complete. `@cylayo/weaver-mcp` now maps MCP 2026-07-28 resource and tool results to one trusted `A2UITransportSession` route and maps routed actions and validation errors back to narrow MCP tools. It receives an already-connected official SDK v2 client and owns no MCP connection lifecycle.

## Task 46 — MCP application capability server helpers

Complete. `@cylayo/weaver-mcp` now provides thin, Standard-Schema-neutral helpers for registering trusted application handlers as ordinary official MCP tools. The helpers add atomic batch preflight, safe result mapping, JSON-safe defensive output ownership, and an exception diagnostic boundary while leaving validation, protocol behavior, authorization, and tool lifecycle with the SDK and host application.

## Task 47 — Zynra V2 integration readiness review

Complete. The canonical decision is [`zynra-v2-readiness.md`](zynra-v2-readiness.md). The integration review completed and the available reference evidence was insufficient. No production package, dependency, public API, A2A adapter, or custom catalog was added.

## Task 48 — Package Weaver for external consumption

Complete. Core, Web, and MCP build as synchronized ESM packages, pack into verified local tarballs, and pass an isolated external-consumer typecheck and runtime-import smoke test without workspace links or source access.

## Task 49 — Install packed Weaver artifacts into the real Zynra repository

Complete.

## Task 50 — Implement first Zynra V2 vertical slice

Complete.

## Task 51 — Integrate Weaver into Zynra

Blocked during runtime verification because Core's Ajv catalog-validation path compiled schemas with dynamic JavaScript, which workerd disallows.

## Task 52 — Worker-safe Core JSON-Schema validation

Complete. Core now uses an interpreting validator for runtime and request-time trusted catalog registration without dynamic JavaScript compilation.

## Task 53 — Install Weaver 0.1.1 artifacts in Zynra

Status unknown — tracked outside this repo (Zynra). Intended scope: install the synchronized Core, Web, and MCP 0.1.1 tarballs in Zynra, then complete and reverify Task 51 there.

## Task 61 — Core A2UI v0.9.1 prompt generator (WVR-011)

Complete, pending review. Core now exports `generateA2UIV091Prompt()`, which builds the A2UI v0.9.1 model prompt from a trusted catalog. It returns either the prompt or a typed `A2UIPromptGenerationError`, never a partial prompt. The implementation, types, and tests live in `packages/core/src/prompt/`. Example shape checks (WVR-012) are not part of this task.

## Task 62 — Opt-in runtime observer hook (WVR-021)

Complete, pending review. `WeaverRuntime` accepts an optional `observer` that receives runtime events from `process`, `writeInput`, and `dispatchAction`. Events are built only when an observer is set, and observer exceptions are swallowed so tracing cannot change runtime behavior. The event and observer types are exported from the Core runtime module.

## Task 63 — Core describeWeaverError() (WVR-031)

Complete, pending review. Core exports `describeWeaverError()`, which turns typed Core errors into host-readable summaries, severities, and actionable hints, with the cause chain flattened in order. It is exhaustive over every error union it accepts, including `A2UIPromptGenerationError`, and a fixture reaches each code.

## Task 64 — Cookbook scaffold (WVR-041)

Complete, pending review. `examples/cookbook` (`@weaver/cookbook`) is a Vite multi-page app with a landing page and a placeholder screen. It uses a shared harness that drives deterministic agent streams, plus a happy-dom smoke test. Its only dependencies are Core, Web, Vite, and happy-dom. The real form, dashboard, and ticket-board screens are separate issues (WVR-042 to WVR-044).

## Task 65 — Validate prompt examples through a scratch runtime (WVR-012)

Complete, pending review. `generateA2UIV091Prompt()` runs each example through a fresh scratch runtime before it emits the prompt. A failure returns `EXAMPLE_INVALID` with the example's index, title, stage (`runtime`, `process`, or `resolve`), and the typed cause. Core also ships a basic example set in `packages/core/src/prompt/basicExamples.ts`. `describeWeaverError()` names those example fields and flattens the cause chain, as a follow-up to Task 63.

## Task 66 — Prompt generator in the packed-Core workerd gate (WVR-014)

Complete, pending review. The workerd consumer in `integration/workerd-consumer` exercises `generateA2UIV091Prompt()` from the packed Core tarball, so the prompt generator is covered by the same gate as the rest of Core.

## Task 67 — Trace recorder and weaver-trace v1 (WVR-022)

Complete, pending review. `createWeaverTraceRecorder()` records runtime observer events into the `weaver-trace` v1 format. `parseWeaverTrace()` validates a trace on load. Ingestion frame errors are captured in the trace. The code and tests live in `packages/core/src/trace/`.

## Task 68 — Web describeWebRenderError() (WVR-032)

Complete, pending review. Web exports `describeWebRenderError()` for `WebRenderError` and `WebInteractionError`. The code lives in `packages/web/src/surface/`.

## Task 69 — Cookbook form screen (WVR-042)

Complete, pending review. The cookbook adds a validated support-request form. Client checks run through Basic functions and a regex matcher supplied by the screen. Submit makes a server round trip, and the screen's tests cover the validation paths.

## Task 70 — Cookbook dashboard screen (WVR-043)

Complete, pending review. The cookbook adds a dashboard with KPI tiles and a filtered list. Refresh and filter send data-model updates only, with no new surface. This includes a Web change: Basic Button registers as a focus-restorable control. The harness registers the default Basic functions once, and a screen can replace that list.

## Task 71 — Cookbook ticket board (WVR-044)

Complete, pending review. The cookbook adds a ticket board with move, assign, and close actions. Each column is a List template over `/board/<status>`, and actions can supply their own data-model updates. The README records the positional template identity limits of v0.9.1.

## Task 72 — Cookbook custom catalog (WVR-051)

Complete, pending review. `examples/cookbook/src/custom-catalog/` defines an app-owned catalog with `defineCatalog()`, with DataTable and BarChart entries and their own tests. Core and the Basic catalog are unchanged.

## Task 73 — Golden Basic prompt fixture (WVR-013)

Complete, pending review. Golden Basic-catalog prompt fixtures live in `packages/core/src/prompt/fixtures/`. `scripts/generate-prompt-fixtures.mjs --check` runs inside `pnpm check:generated`, so a prompt change that is not regenerated fails CI.

## Task 74 — Reference-app prompt sample (WVR-015)

Complete, pending review. `examples/reference-app/src/prompt-sample.ts` builds the Basic prompt with `generateA2UIV091Prompt()`. A canned model response is checked as valid A2UI and renders in happy-dom, with no LLM call. The sample and its tests live in the reference app.

## Task 75 — Trace replay with divergence report (WVR-023)

Complete, pending review. `replayWeaverTrace()` replays a `weaver-trace` v1 trace step by step and reports a per-step divergence when a replayed outcome differs from the recorded one. It is exported from `packages/core/src/trace/`, and its tests sit beside it.

## Task 76 — Last-good-state regression tests (WVR-033)

Complete, pending review. Tests only. Malformed input leaves the last good Core state and the last good Web DOM unchanged, and the host receives a described error. The tests are in `A2UIV091StreamIngestion.test.ts` (Core) and `WebSurfaceRenderer.test.ts` (Web).

## Task 77 — Cookbook Playwright smoke (WVR-045)

Complete, pending review. `examples/cookbook/e2e/` adds Playwright checks at 360px and 1280px for no horizontal scroll, keyboard reachability with a visible focus indicator, and keyboard completion of the form and ticket board. `@playwright/test` is a cookbook devDependency. The e2e script is not in the required CI gate. It runs through `pnpm --filter @weaver/cookbook e2e`.

## Task 78 — Trusted DataTable renderer (WVR-052)

Complete, pending review. The cookbook adds a trusted, accessible DataTable renderer built with DOM APIs only, with no `innerHTML`. Its `rows` and the BarChart `values` accept a data binding or a literal array, and Core hydrates both. DataTable is read-only; row-level actions use List templates; per-row dispatch is gated as WVR-056. The single registration list is `examples/cookbook/src/custom-catalog/renderers.ts`.

## Task 79 — Trusted SVG BarChart renderer (WVR-053)

Complete, pending review. The cookbook adds a dependency-free SVG BarChart renderer with a visually hidden fallback table, clamped negative values, and `maxBars`. It is registered once, in `examples/cookbook/src/custom-catalog/renderers.ts`, next to DataTable, Column, Text and Card. The shipped catalog binds `values` through Core.

## Task 80 — Document prompt generation (WVR-016)

Complete, pending review. Adds `docs/prompt-generation.md` and a README section. The doc snippets compile and run against the packed packages through `integration/package-consumer/doc-snippets.mjs`, and `scripts/verify-packages.mjs` checks them. The cookbook README's custom catalog section is corrected.

## Task 81 — Playground trace inspector (WVR-024)

Complete, pending review. `examples/playground` adds an inspector page that loads a weaver-trace file, steps through frames, shows snapshots and the suppressed outbound log, and flags a malformed frame. It has a committed sample trace and Playwright e2e under `examples/playground/e2e/`. The playground e2e is not in required CI; run it with `pnpm --filter @weaver/playground e2e`.

## Task 82 — Cross-catalog safety tests (WVR-054)

Complete, pending review. Cases (a)-(c) covered; case (d) open pending a custom-catalog screen. The tests are in `examples/cookbook/src/custom-catalog/crossCatalogSafety.test.ts`, registered in the cookbook `test` script. No production code changed.

## Task 83 — Debugging, replay and inspector docs (WVR-025)

Complete, pending review. Adds `docs/debugging.md`, which covers the observer and recorder in development, trace export, the playground inspector, replay guarantees and limits, and a security and privacy section. It is linked from the README and `docs/architecture.md`. Its TypeScript snippets are checked by `integration/package-consumer/doc-snippets.mjs`, and they run in `verify:packages` against the packed tarballs.

## Task 84 — Cookbook orders-report screen on the custom catalog (WVR-057)

Complete, pending review. Adds an Orders report screen to the cookbook. It runs on the custom catalog through the new optional `catalog` field on the shared harness, with a read-only DataTable, a BarChart and a Refresh button that updates both. The custom catalog now declares `Button`. The DataTable scroll wrapper is a labelled, keyboard-focusable region, so keyboard users can reach hidden columns. The Playwright spec covers the built page at 1280px and 360px, and it closes WVR-054 case (d).

## Task 85 — Basic primary Button contrast (WVR-058)

Complete, pending review. Patch-level visual change to `@cylayo/weaver-web`: the default primary accent is now `#0969da` (contrast 5.19:1 with white text) for the Button, the Tabs selected label and underline, and the Basic control accents. It was `#1177ee` (4.29:1). Hosts that set `--a2ui-color-primary` or `theme.primaryColor` see no change. Record for the 0.3.0 release notes.

## Task 86 — Custom catalog recipe docs and `pnpm check:docs` (WVR-055)

Complete, pending review. Adds `docs/custom-catalogs.md`, a six-step recipe whose cookbook snippets are quoted verbatim and checked by a cookbook test. Adds `pnpm check:docs`, which checks relative links and anchors in tracked Markdown, and runs it as a CI step.

## Task 87 — Diagnostics panel and cookbook error demo (WVR-034)

Complete, pending review. Adds a framework-free diagnostics panel, shared by the inspector and the cookbook. It lives in the new private `@weaver/shared` workspace package (`examples/shared`), which is not packed or published; `pnpm pack:packages` still produces the three public tarballs. Adds the cookbook Error demo screen, which feeds three bad updates and shows the diagnostics beside the last good render.

## Task 88 — Render-budget errors carry the surface id (WVR-064)

Complete, pending review. Additive optional `surfaceId` on the Web SURFACE_RESOLUTION_FAILED error; describeWebRenderError prefers it.

## Task 89 — Store and DOM after a render-budget failure (WVR-065)

Complete, pending review. Documented and pinned: after a failed render the store keeps the accepted data and the DOM keeps the last good render; no behaviour change; deferred options recorded.

## Task 90 — Absolute paths inside a List template (WVR-066)

Complete, pending review. Documented and pinned: absolute path inside a template resolves from the DataModel root; no behaviour change.

## Task 91 — Release prep 0.3.0 (WVR-060)

Complete, pending maintainer tag and publish. Core, Web, and MCP are bumped to `0.3.0` together. Web and MCP peer on `@cylayo/weaver-core` `0.3.x`, and `WEAVER_CORE_VERSION` is `"0.3.0"`. `CHANGELOG.md` holds the 0.3.0 notes, and the README links to it. The API review against the pre-work baseline `cada149` found 40 added exports, no removed exports, and two additive type changes (`WeaverRuntimeConfig.observer`, the `WebRenderError` `surfaceId`). The consumer smoke typechecks and runs the new exports from the packed tarballs. No tag is created and nothing is published.

## Deferred work

- additional network bindings, including A2A placement
- stable collection item identity beyond v0.9.1 positional scopes
- Zynra V2 application integration

## Roadmap: OpenUI-informed improvements

The planned work is in [`scratch/ROADMAP.md`](../scratch/ROADMAP.md). Its live status is in [`scratch/BOARD.md`](../scratch/BOARD.md). It borrows OpenUI's developer-loop patterns, not its code, DSL, or protocol.

- **E1 Prompt generation:** generate the A2UI v0.9.1 model prompt from the trusted catalog in Core.
- **E2 Trace and replay:** record, replay, and inspect runtime frames through an opt-in observer.
- **E3 Error presentation:** turn typed Core and Web errors into described, actionable messages.
- **E4 Cookbook:** runnable form, dashboard, and ticket-board examples, checked for keyboard use and 360px screens.
- **E5 Custom catalog recipe:** an app-owned catalog with trusted DataTable and BarChart renderers.

The remaining audit items are gated. They proceed only when the evidence in `scratch/ROADMAP.md` justifies them.

# Weaver Framework Plan

Weaver is an independent interface runtime framework. Package boundaries remain
strict: `@weaver/core` has no Web or MCP dependency; adapters depend on Core.

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

Complete. `@weaver/mcp` now maps MCP 2026-07-28 resource and tool results to one trusted `A2UITransportSession` route and maps routed actions and validation errors back to narrow MCP tools. It receives an already-connected official SDK v2 client and owns no MCP connection lifecycle.

## Task 46 — MCP application capability server helpers

Complete. `@weaver/mcp` now provides thin, Standard-Schema-neutral helpers for registering trusted application handlers as ordinary official MCP tools. The helpers add atomic batch preflight, safe result mapping, JSON-safe defensive output ownership, and an exception diagnostic boundary while leaving validation, protocol behavior, authorization, and tool lifecycle with the SDK and host application.

## Task 47 — Zynra V2 integration readiness review

Complete. The canonical decision is [`zynra-v2-readiness.md`](zynra-v2-readiness.md). The integration review completed and the available reference evidence was insufficient. No production package, dependency, public API, A2A adapter, or custom catalog was added.

## Task 48 — Package Weaver for external consumption

Complete. Core, Web, and MCP build as synchronized ESM packages, pack into verified local tarballs, and pass an isolated external-consumer typecheck and runtime-import smoke test without workspace links or source access.

## Task 49 — Install packed Weaver artifacts into the real Zynra repository

Next. Install only Task 48's tarballs in Zynra and verify its integration and build boundaries. This work takes place in the Zynra repository.

## Task 50 — Implement first Zynra V2 vertical slice

Provisional, subject to Task 49 evidence.

## Deferred work

- additional network bindings, including A2A placement
- stable collection item identity beyond v0.9.1 positional scopes
- Zynra V2 application integration

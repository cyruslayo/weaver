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

## Task 43 — evidence-selected next transport milestone

Recommended next: a small HTTP/SSE server reference helper. The browser binding
now defines a concrete interoperable wire contract; a reference peer will test
that contract end-to-end before reconnect/resume policy or a broader MCP binding
introduces independent concerns.

## Deferred work

- additional network bindings, including A2A placement and reconnect/resume policy
- MCP integration in `@weaver/mcp`
- stable collection item identity beyond v0.9.1 positional scopes
- Zynra V2 application integration

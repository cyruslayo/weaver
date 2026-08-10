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

`WeaverRuntime` is now the recommended application entry point. Lower-level Core
classes remain public for advanced composition. Runtime creation fixes the host's
trusted catalogs and function implementations. An empty catalog list is valid,
but no surface can be created until a trusted catalog exists; because runtime
configuration is immutable, such a runtime is useful only for hosts that do not
process surfaces.

## Current phase: `@weaver/web`

Completed Web milestones:

```text
RendererRegistry + minimal DOM rendering
Web interaction bridge
Basic Catalog foundation renderers
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

## Next milestones

1. Basic visual hardening (leaf-margin strategy, Card treatment, Button variants, Divider and Image geometry, ChoicePicker presentation, Text variants, and nested Card distinction)
2. trusted surface attribution/chrome
3. final v0.9.1 conformance fixtures

Basic Catalog pure functions, security-sensitive `regex` and `openUrl`, the opt-in surface theme bridge, parent-aware component weight, and safe Text Markdown plus TextField `validationRegexp` are complete. Full Basic Catalog conformance remains incomplete until the audit's required and hardening backlogs are addressed.

## Deferred work

- network and transport adapters (including HTTP and A2A placement)
- MCP integration in `@weaver/mcp`
- stable collection item identity beyond v0.9.1 positional scopes
- Zynra V2 application integration

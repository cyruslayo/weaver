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

## Next milestones

1. safe Text Markdown
2. TextField `validationRegexp`
3. Basic component visual/conformance hardening
4. surface attribution/chrome

Basic Catalog pure functions, security-sensitive `regex` and `openUrl`, the opt-in surface theme bridge, and parent-aware component weight are complete. Full Basic Catalog conformance remains incomplete until the work above is finished.

## Deferred work

- network and transport adapters (including HTTP and A2A placement)
- MCP integration in `@weaver/mcp`
- stable collection item identity beyond v0.9.1 positional scopes
- Zynra V2 application integration

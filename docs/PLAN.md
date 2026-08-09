# Weaver Framework Plan

Weaver is an independent interface runtime framework. Package boundaries remain
strict: `@weaver/core` has no Web or MCP dependency; adapters depend on Core.

## Completed Core milestones

- A2UI v0.9.1 protocol validation and JSONL framing
- trusted catalog registration and trusted host function execution
- surface and data-model state
- progressive component trees, scoped instances, property hydration, and checks
- input binding and transport-neutral action dispatch
- `WeaverRuntime` composition and orchestration facade

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
```

The Core runtime facade is complete. Web consumes resolved surfaces through an
immutable trusted renderer registry, reactively rebuilds mount-owned DOM
subtrees, and delegates narrow input/action callbacks to current runtime state.
The next milestone is production Basic Catalog rendering. Themes remain pending.
Web must not duplicate Core state, protocol validation, catalog trust, checks,
or action behavior.

## Deferred work

- network and transport adapters (including HTTP and A2A placement)
- MCP integration in `@weaver/mcp`
- stable collection item identity beyond v0.9.1 positional scopes
- Zynra V2 application integration

# Prototype Notes

The analysis in the sections before "Closure (Task 54)" documents the prototype
as it existed before migration. Path references and future-tense statements
there describe that historical state, not the current repository. Task 54
removed the prototype source files.

No prototype implementation has been migrated into the new packages.

| Concept | Prototype files | Disposition |
| --- | --- | --- |
| ComponentRegistry | `frontend/src/ComponentRegistry.ts`; wired by `frontend/src/main.ts` and legacy `App.ts` | Its trusted allowlist is useful, but its DOM construction and renderer map remain prototype-only. The new framework-independent `CatalogRegistry` supersedes its trust-boundary responsibility with the protocol-aligned A2UI catalog contract. |
| StateActionBus | `frontend/src/StateActionBus.ts`; wired by `frontend/src/main.ts` and legacy `App.ts` | Preserve state updates, subscriptions, and action intent; redesign transport, payload ownership, and framework boundaries. |
| StreamingEngine | `frontend/src/StreamingEngine.ts`; used by `frontend/src/main.ts` | Preserve incremental-input lessons; redesign around the future standard protocol rather than custom frames or repaired model JSON. |
| StreamingEngine tests | `frontend/src/StreamingEngine.test.ts` | Preserve as prototype regression evidence; replace with protocol-conformance tests during later migration. |
| Trusted component catalog | Renderer registrations in `frontend/src/main.ts` and legacy `App.ts`; model catalog in `server.js` | Preserve allow-listed component and property concepts; redesign against A2UI rather than the prototype catalog prompt. |
| Design token maps | `gapMap`, `padMap`, `radiusMap`, and `sizeMap` in `frontend/src/main.ts` and legacy `App.ts`; CSS tokens in `frontend/src/style.css` | Preserve the token firewall concept; redesign token contracts, validation, and theming. |
| Browser action dispatch | `StateActionBus.dispatch()` in `frontend/src/StateActionBus.ts`; Button and Overlay wiring in `frontend/src/main.ts` and legacy root `App.ts` | Preserve explicit user-action dispatch; redesign message shape and transport after A2UI and MCP boundaries are defined. |

## Protocol-specific behavior to discard

- Custom `beginRendering`, `surfaceUpdate`, and `streamComplete` frames.
- The bare `{ rootId, components }` fallback payload.
- Browser-side Markdown stripping and heuristic JSON repair.
- The assumption that an AI model directly emits the permanent Weaver wire format.
- Prototype SSE endpoint and action payload shapes in `server.js` and `StateActionBus`.

The prototype's `ComponentRegistry` supplied the original allowlist idea: only
application-approved component names could cross into rendering. The new
architecture separates two trust boundaries:

```text
CatalogRegistry
    |
    v
schema trust

future Web Renderer Registry
    |
    v
implementation trust
```

`@weaver/core` implements schema trust with `CatalogRegistry`: applications
register A2UI v0.9.1 catalog JSON Schemas during initialization, and components
are checked for catalog membership and schema conformance before entering
surface state. A future `@weaver/web` registry will decide which trusted renderer
implementation corresponds to an already schema-trusted component. This work
does not migrate recursive DOM construction, actions, or the prototype's
replacement-on-register behavior.

The prototype's direct recursive DOM renderer is now replaced in the core design
by a platform-neutral derived-state boundary:

```text
flat trusted state
      ↓
catalog-aware structure resolver
      ↓
future platform renderer
```

The prototype remains preserved as design evidence. `SurfaceStore` does not keep
a second mutable nested tree, and the resolver does not implement DOM rendering,
data binding, actions, or dynamic-list instances.

The remaining observations do not select or implement renderer or MCP behavior.

## Closure (Task 54)

The prototype source files were removed in Task 54. A historical source
snapshot containing the main prototype files (`App.ts`, `server.js`,
`HANDOFF.md`, root `index.html`, `.env.example`, and the `frontend/` source,
including its `StreamingEngine` tests) remains preserved as design input in
[`references/zynra-backend-reference.txt`](references/zynra-backend-reference.txt).
Commits preceding Task 54 retain the deleted prototype files, including paths
missing from the snapshot (`frontend/.gitignore`, `frontend/public/favicon.svg`,
and `frontend/public/icons.svg`).

The concepts this document listed as "preserve" are realized in the current
framework:

| Prototype concept | Current realization |
| --- | --- |
| ComponentRegistry allowlist | `CatalogRegistry` in `@weaver/core` plus the trusted DOM `RendererRegistry` in `@weaver/web` |
| StateActionBus state updates/subscriptions | `SurfaceStore`, `DataModel`, and `InputBindingWriter` in `@weaver/core` |
| StreamingEngine incremental input | `JsonlDecoder` in `@weaver/core` (strict framing and parsing; no repair, no Markdown stripping) |
| Browser action dispatch | `ActionDispatcher` in `@weaver/core` and the Web interaction bridge in `@weaver/web` |
| Design token firewall | trusted `WebSurfaceThemeAdapter` allowlist in `@weaver/web` |

Prototype protocol shapes (`beginRendering`, `surfaceUpdate`, `streamComplete`,
bare `{ rootId, components }` payloads, and silent JSON repair) remain
discarded, as this document originally required.

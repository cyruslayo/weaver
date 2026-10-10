# Weaver vs OpenUI: source-grounded architecture audit

**Date:** 2026-10-08  
**Read-only review:** No changes were made to either repository.  
**Snapshot, OpenUI:** `thesysdev/openui@69f678328a20b766cf0756f64143b3a6e7da29ae` (main commit dated 2026-10-08).  
**Snapshot, Weaver:** `cyruslayo/weaver@cada1497c8ef89aeea762348a08b92a242a2a303` (main commit dated 2026-09-19).

## Executive conclusion

Weaver is an A2UI v0.9.1 **protocol-first runtime** with strict validation, state, catalog, binding, action, routing, native-DOM rendering, SSE, and MCP boundaries. OpenUI is a **generation-first framework**: its own compact OpenUI Lang, incremental parsing, library-to-prompt compilation, reactive queries and mutations, form state, extensive visual components, agent chat, debugging, SDK adapters, and CLI onboarding.

**Do not replace Weaver's A2UI contract with OpenUI Lang.** Borrow the patterns that improve authoring, debugging, examples, and component quality. Preserve Weaver's host-controlled trust boundary and independent core. Treat OpenUI's A2UI v1.0 package as a separate *experimental, OpenUI-Lang-specific profile*, not a drop-in official v0.9.1 replacement.

## Evidence and scope

Inspected the two GitHub repository trees, README files, package manifests, implementation files, relevant tests and CI, and architecture/design docs. Key code inspected directly:

- Weaver: `packages/core/src/runtime/WeaverRuntime.ts`, `packages/core/src/runtime/safety.ts`, `packages/core/src/actions/ActionDispatcher.ts`, `packages/core/src/stream-ingestion/A2UIV091StreamIngestion.ts`, `packages/web/src/surface/WebSurfaceRenderer.ts`, `packages/web/src/basic/createBasicCatalogRendererRegistrations.ts`, `packages/web/src/basic/renderers.ts`, `packages/mcp/src/index.ts`, `.github/workflows/ci.yml`, `docs/architecture.md`, `docs/conformance-v0.9.1.md`, `docs/web-rendering.md`, `docs/PLAN.md`.
- OpenUI: `packages/lang-core/src/parser/{parser,lexer,merge,prompt}.ts`, `packages/lang-core/src/runtime/{queryManager,store,evaluator}.ts`, `packages/react-lang/src/{Renderer,library}.tsx/ts`, `packages/a2ui/src/{client,protocol-schema}.ts`, `packages/react-headless/src/stream/adapters/ag-ui.ts`, `packages/devtools/src/debug/lib/usePlayback.ts`, `packages/server/src/shared/create-autofix.ts`, `packages/react-ui/src/index.ts`, package READMEs and manifests, benchmark methodology, docs on architecture, editing, reliability, state, queries, artifacts and devtools.

This is a **source and documentation review, not a full execution audit**. Neither project was cloned or locally tested in this session. Weaver's CI for the pinned commit reports success. OpenUI's latest unrelated workflow run was still in progress when checked. Counts of test files are not comparable coverage metrics.

## 1. Architecture and execution pipelines

### Weaver

```text
Host/app/agent emits canonical A2UI v0.9.1 messages
    -> strict JSONL/transport ingestion
    -> protocol envelope validation
    -> host-trusted catalog schema validation
    -> SurfaceStore + DataModel
    -> component tree / instance / dynamic property / check resolution
    -> browser-trusted RendererRegistry
    -> native DOM subtree
    -> explicit user input write or action dispatch
    -> host callback / routed SSE or MCP / domain application
```

The Core package is framework-independent. Web and MCP depend on Core, not each other. Runtime safety budgets default to depth 32 and 1000 resolved instances. Web renderers are registered by exact catalog/component identity and never come from model-supplied code.

### OpenUI

```text
Typed component library (Zod + descriptions)
    -> generated model prompt
    -> model emits OpenUI Lang statements
    -> incremental lexer/parser/materializer
    -> reactive variables, Query/Mutation manager, expressions
    -> framework adapter / selected trusted components
    -> React/Vue/Svelte/Angular UI
    -> local actions or host toolProvider (including MCP)
```

React offers full prebuilt components, chat, artifacts, storage and adapters. The `@openuidev/lang-core` package itself is independent of React.

### Fundamental distinction

Weaver's A2UI message is already a *validated update instruction*, not a fragment of language text. OpenUI can show partial typed statements before a full statement completes, uses forward references, and merges named statements. Weaver updates across complete validated A2UI messages, then atomically recomputes a surface. These offer different latency, security, and editing semantics.

## 2. Capability matrix

| Domain | Weaver at pinned commit | OpenUI at pinned commit | Interpretation |
|---|---|---|---|
| Canonical protocol | v0.9/v0.9.1 A2UI envelopes, pinned schemas, producer | Proprietary OpenUI Lang; experimental A2UI v1.0 profile whose components are strings containing Lang statements | Do not equate these protocols |
| Parse/stream | Complete JSONL frames, progressive surface updates, SSE | Incremental token/text parser, partial trailing statement auto-close, completed-statement cache | Both stream; different boundaries |
| Trust | Strict envelope/catalog validation, exact renderer allowlists, explicit effects, finite budgets | Typed library, Zod contracts, parser issues, host toolProvider | Weaver has clearer explicit host-security constraints |
| UI state | Per-surface DataModel, relative scoped bindings, checks, controlled input writes | $variables, forms, derived expressions, Query/Mutation, query cache/refresh | OpenUI has more runtime authoring convenience |
| Incremental editing | `updateComponents` upserts, `updateDataModel`; no OpenUI Lang merging | Statement ID merge/update/deletion, edit mode prompt | Adapt ideas to A2UI, do not add DSL without evidence |
| Action execution | Explicit `dispatchAction`; host owns domain authorization | `@Set`, `@Reset`, `@Run`; host toolProvider, MCP/function-map | Different capability and policy boundaries |
| Visual set | 18 Basic catalog renderers | Many layouts, charts, cards, forms, tables, artifact/chat components | OpenUI much richer out of the box |
| Rendering | Framework-free browser DOM, full detached rebuild, focus restoration, stale generation guard | First-party framework bindings; React reconciles UI | Benchmark updates before optimizing Weaver |
| Tool/chat workflow | Optional MCP and browser SSE; example apps | AG-UI, OpenAI, Vercel, LangGraph, full chat/headless, artifact storage | OpenUI broader as a product platform |
| Developer tools | Tests/docs/playground, typed errors | In-app Inspect, editor, validation, tree, JSON, mock tools, stream replay | High-value borrowing opportunity |
| Benchmarks | Conformance tracker / CI | Published token and reliability research | Run equivalent benchmarks for Weaver |
| Distribution | Local packed tarballs, Core/Web/MCP, workerd gate | Published npm packages, multi-framework examples, CLI | Improve Weaver's adoption path incrementally |
| Vendor linkage | No model/cloud dependency in Core | Self-hostable OSS packages plus optional hosted gateway/autofix; install telemetry in Lang Core | Avoid making a vendor gateway mandatory |

## 3. Strong Weaver foundations to preserve

1. **A2UI fidelity and version clarity.** Schema-constrained wire format, validated surfaces and action metadata, trusted catalogs. The project reports 148 PASS, 1 PARTIAL, 2 DEFERRED-BY-ARCHITECTURE, 2 NOT-APPLICABLE, 3 SPEC-AMBIGUOUS across 156 audit rows. This is a project audit, not an independent certification.
2. **Core portability.** Core does not require a browser or Node API. A packaged `workerd` test is in CI. MCP is optional.
3. **Trusted execution only.** Untrusted A2UI cannot inject HTML/JS/CSS or instantiate renderers. Named component rendering requires explicit trusted registration. Local function effects have an explicit boundary.
4. **Freshness and safety.** Mount generations invalidate stale callbacks. A detached-tree render failure keeps prior DOM but leaves older interactions inert. Focus and selection restoration reduce input disruption. Depth and instance budgets limit worst-case resolution work.
5. **Transport routing.** A2UI session routes and outbound events/error metadata are distinct from application domain capabilities.
6. **Separation from Zynra and vendor backends.** Weaver should remain a reusable framework, not absorb business workflows.

## 4. What OpenUI concretely does better

### A. Component-library-to-prompt compilation

`packages/lang-core/src/parser/prompt.ts` generates system instructions from component and tool schemas. `packages/react-lang/src/library.ts` turns Zod-defined components into a library. This reduces manual drift between allowed UI and model instructions.

**Weaver equivalent:** A small deterministic `generateA2UIPrompt(catalog, capabilities, examples)` host utility. Compile *A2UI* wire examples, never OpenUI Lang. Enforce bounded prompt size and forbid unsupported components or actions.

### B. Progressive language parsing and edit workflow

`packages/lang-core/src/parser/parser.ts` keeps completed statements in a map, auto-closes only pending text, supports forward references, and resets on replaced source. `merge.ts` merges changed statements by ID. Documentation shows changed-statement regeneration rather than full document regeneration.

**Weaver equivalent:** A2UI-native *changed-component output guidance* with `updateComponents` and `updateDataModel`. Most structural upsert support already exists. Add real multi-turn examples and validation tests. A second DSL is unnecessary unless benchmark results establish a large advantage.

### C. Local reactive querying

`queryManager.ts` implements `Query`/`Mutation`, cache keys, loading/error data, re-fetch on reactive changes, invalidation, auto-refresh and mutation trigger support. This enables generated dashboards and forms to work after one model generation.

**Weaver equivalent:** First solve use cases through host-owned data sources and explicit application actions. If repeated apps need the same read/query pattern, add a small opt-in, capability-scoped query adapter outside Core. Deny unregistered tools. Require application authorization for every write. Keep model output from gaining ambient database/network access.

### D. In-app developer experience

`@openuidev/devtools` Inspect/Debug renders source text, parser errors, tree/JSON, mock-tool behavior, and deterministic chunk-playback controls. The debug playground uses the host's component library.

**Weaver equivalent:** A read-only A2UI recorder and replay/debug page using the existing runtime and catalog. Show per-message validity, surface snapshots, derived instances, binding/check results, action routing, stale callback outcomes, and rendering diagnostics. Enable only in development.

### E. Components and design systems

`@openuidev/react-ui` offers charts, tables, date controls, editable tables, dialogs, chat layouts, cards, and themeable primitives. Source includes many Storybook stories and component-level tests. Heavy optional dependencies include Radix, D3, TanStack Table, date libraries, and markdown packages.

**Weaver equivalent:** Start with catalog-defined, host-trusted `Table`, `Chart`, `Form`, `DatePicker`, `EmptyState`, and `ErrorState` implementations where apps require them. Keep canonical A2UI Basic immutable and register extras under separate catalog identity. Do not ship all OpenUI's dependencies just to render a chart.

### F. Distribution and examples

OpenUI has CLI scaffolding, many agent/framework integrations, cookbooks, and end-to-end examples. Weaver has a reference app and playground, but the README still calls for installing local tarballs.

**Weaver equivalent:** Publish Core/Web/MCP to npm after verified install-and-run from a clean consumer; give one browser example, one Worker example, and one deterministic non-LLM example. Add CLI only if developers repeatedly stumble on setup.

## 5. Where OpenUI is not automatically better

- **Protocol interchange:** `@openuidev/a2ui` explicitly describes an experimental v1.0 profile with Lang strings in `components`. This differs from Weaver's canonical v0.9.1 flat component objects. It cannot be dropped in as a transparent protocol replacement.
- **Fail-safe behavior:** OpenUI's Lang parser is deliberately permissive and may render what it can despite validation errors. That is useful for previews. Weaver should keep strict validation before state mutation and action dispatch.
- **Performance evidence:** OpenUI's token table compares seven derived-output examples against YAML, json-render patches and Thesys C1. It does **not** compare against Weaver's A2UI producer. Other formats were transformed from the same generated OpenUI AST. The reported decode latency uses a fixed assumed throughput, rather than end-to-end measurements of Weaver.
- **Framework scope:** OpenUI's extensive React UI suite brings considerable dependencies and styling choices. This is not automatically suitable for Weaver's framework-free browser layer.
- **Cloud dependencies:** OpenUI's optional `createAutofix` calls a Thesys endpoint. The language core documents pseudonymous installation telemetry. Neither should become a mandatory Weaver runtime dependency.
- **Template identity:** Weaver reports position-based collection identity in v0.9.1. OpenUI React code also has some positional array keys. Do not claim copying OpenUI solves stable reordering automatically.

## 6. Weaver gaps, ranked

### P0: Highest-value near-term work

| ID | Issue | Source idea | Minimal change | Acceptance test |
|---|---|---|---|---|
| WVR-01 | Model catalog prompt generation | OpenUI `prompt.ts`, `library.ts` | Generate A2UI v0.9.1 instructions and examples from trusted catalog | Generated prompt never lists unregistered components/functions; schema changes reflected; deterministic snapshot tests |
| WVR-02 | Debug trace and replay | OpenUI DevTools Inspect/Debug | Add opt-in observer/trace export and browser replay page | Capture/replay valid and rejected frames; same final surface; no extra side effects during replay |
| WVR-03 | Actionable error presentation | OpenUI errors, Debug validation | Typed error panel grouped by frame, component, path, and cause | Malformed frame leaves previous valid state; host can identify failure without console spelunking |
| WVR-04 | Reference applications and UX cookbook | OpenUI demos/cookbooks | Add realistic form, dashboard, ticket board using existing A2UI | Build and run with no LLM; verify keyboard, form, action, and updates |
| WVR-05 | App-owned UI extension recipes | OpenUI Table/Charts/DatePicker | Demonstrate one custom catalog and renderer, not an additional framework package | Unknown components fail safely; no cross-catalog fallback; works in standalone browser |

### P1: Useful after P0 adoption

| ID | Issue | Constraint and test |
|---|---|---|
| WVR-06 | Publish npm packages | Clean external TypeScript/ESM/Worker smoke tests, semver and changelog, packaging check; publish only after API review |
| WVR-07 | Data-driven UI examples | App owns network access, tool authorization, query results, retries, and cancellation; Weaver gets only A2UI updates |
| WVR-08 | Generation correctness benchmark | Compare OpenUI Lang and Weaver A2UI on the *same tasks*, schema, models, and tool privileges; measure valid surfaces, latency, tokens, repair rate, CPU |
| WVR-09 | High-value richer catalog components | Add Table, Chart, Form, DatePicker only when needed by at least one shipping app; measure bundle/dependency impact |
| WVR-10 | Optional provider or AG-UI bridge | Add one integration with demonstrated demand; keep Core transport-neutral |

### P2: Evidence-gated work

| ID | Issue | Gate |
|---|---|---|
| WVR-11 | DOM reconciliation | Profile repeated updates, focus behavior and memory first; preserve generation guards and last-good atomic behavior |
| WVR-12 | Stable item identity | Wait for clear protocol contract or use host-owned key extension; do not silently change v0.9.1 position semantics |
| WVR-13 | A2UI v1.0 adapter | Use official version-specific schemas and fixtures; treat OpenUI's Lang-string profile separately |
| WVR-14 | Native multi-framework renderers | Add only for real adopters; do not import React/Vue/Svelte into Core |
| WVR-15 | Full chat/agent product shell | Keep it an application or optional adapter; do not merge into the core protocol/runtime library |

### Explicit non-goals

Do not import OpenUI Lang into Weaver Core. Do not make Thesys Gateway or model output correction mandatory. Do not add background fetch to the shared core. Do not automatically execute arbitrary agent-selected tools. Do not take 70+ UI components and their dependencies in one pass. Do not rewrite Weaver's strict protocol validator to tolerate malformed JSON.

## 7. Suggested implementation sequence

**Slice 1, no new framework package:** Implement catalog-to-A2UI prompt examples, unit snapshot tests, and a minimal model generation sample. Use Weaver's current producer + ingestion.

**Slice 2, diagnostics:** Build a read-only frame recorder and replay view in `examples/playground`, reusing the existing runtime interface. Show validation and state differences. Mock all outbound actions on replay.

**Slice 3, UI quality:** Produce two realistic screens and an explicit trusted custom renderer example (Table or small chart). Include keyboard and narrow-screen acceptance checks.

**Slice 4, measurement:** Run an apples-to-apples reliability/token/performance benchmark with actual Weaver messages. Capture first-valid-render time, total-to-final latency, update CPU, input stability, and end-to-end cost. Only then decide if a compact model-output DSL or reconciliation layer pays for its upkeep.

**Slice 5, distribution:** Package and publish a stable preview, then author a concise Quick Start. Use current verified package smoke gates.

## 8. Decision rules for future comparisons

When assessing any OpenUI feature for Weaver:

1. Is this a model *generation* feature, a protocol *runtime* feature, a renderer component, or an *application* feature?
2. Does Weaver already offer it with A2UI messages, host code, or a custom catalog?
3. Is the gap in correctness, developer experience, visual quality, or business/application convenience?
4. Can one small host adapter solve it without new protocol semantics?
5. Does copying preserve schema validation, authorization, safe effects, explicit resource policy, Core portability, and stale-callback protection?
6. How will tests and real-use metrics demonstrate the improvement?
7. What ongoing dependencies and maintenance will the change add?

## 9. Important sources at pinned revisions

**Weaver**

- [README](https://github.com/cyruslayo/weaver/blob/cada1497c8ef89aeea762348a08b92a242a2a303/README.md)
- [Architecture](https://github.com/cyruslayo/weaver/blob/cada1497c8ef89aeea762348a08b92a242a2a303/docs/architecture.md)
- [A2UI v0.9.1 conformance tracker](https://github.com/cyruslayo/weaver/blob/cada1497c8ef89aeea762348a08b92a242a2a303/docs/conformance-v0.9.1.md)
- [Runtime](https://github.com/cyruslayo/weaver/blob/cada1497c8ef89aeea762348a08b92a242a2a303/packages/core/src/runtime/WeaverRuntime.ts)
- [Native Web renderer](https://github.com/cyruslayo/weaver/blob/cada1497c8ef89aeea762348a08b92a242a2a303/packages/web/src/surface/WebSurfaceRenderer.ts)
- [Basic components](https://github.com/cyruslayo/weaver/blob/cada1497c8ef89aeea762348a08b92a242a2a303/packages/web/src/basic/createBasicCatalogRendererRegistrations.ts)
- [MCP bridge](https://github.com/cyruslayo/weaver/blob/cada1497c8ef89aeea762348a08b92a242a2a303/packages/mcp/src/index.ts)
- [CI](https://github.com/cyruslayo/weaver/blob/cada1497c8ef89aeea762348a08b92a242a2a303/.github/workflows/ci.yml)

**OpenUI**

- [README and package map](https://github.com/thesysdev/openui/blob/69f678328a20b766cf0756f64143b3a6e7da29ae/README.md)
- [Streaming parser](https://github.com/thesysdev/openui/blob/69f678328a20b766cf0756f64143b3a6e7da29ae/packages/lang-core/src/parser/parser.ts)
- [Prompt generator](https://github.com/thesysdev/openui/blob/69f678328a20b766cf0756f64143b3a6e7da29ae/packages/lang-core/src/parser/prompt.ts)
- [Statement merge](https://github.com/thesysdev/openui/blob/69f678328a20b766cf0756f64143b3a6e7da29ae/packages/lang-core/src/parser/merge.ts)
- [Reactive query manager](https://github.com/thesysdev/openui/blob/69f678328a20b766cf0756f64143b3a6e7da29ae/packages/lang-core/src/runtime/queryManager.ts)
- [React runtime](https://github.com/thesysdev/openui/blob/69f678328a20b766cf0756f64143b3a6e7da29ae/packages/react-lang/src/Renderer.tsx)
- [A2UI experimental client](https://github.com/thesysdev/openui/blob/69f678328a20b766cf0756f64143b3a6e7da29ae/packages/a2ui/src/client.ts)
- [A2UI profile README](https://github.com/thesysdev/openui/blob/69f678328a20b766cf0756f64143b3a6e7da29ae/packages/a2ui/README.md)
- [React component library](https://github.com/thesysdev/openui/blob/69f678328a20b766cf0756f64143b3a6e7da29ae/packages/react-ui/src/index.ts)
- [Devtools](https://github.com/thesysdev/openui/blob/69f678328a20b766cf0756f64143b3a6e7da29ae/packages/devtools/README.md)
- [Benchmark methodology](https://github.com/thesysdev/openui/blob/69f678328a20b766cf0756f64143b3a6e7da29ae/benchmarks/README.md)
- [OpenUI architecture docs](https://github.com/thesysdev/openui/blob/69f678328a20b766cf0756f64143b3a6e7da29ae/docs/content/docs/openui-lang/architecture.mdx)

## 10. Copying and licensing notes

OpenUI's repository carries an **MIT license**; Weaver carries **Apache-2.0**. MIT-origin code can generally be incorporated into Apache-2.0 projects, while preserving the required MIT copyright/license notices for copied material. Verify individual files and bundled dependencies before copying. Prefer transplanting tested patterns into Weaver's own abstractions instead of moving whole files or dependent React packages.

---

**Overall recommendation:** Improve Weaver's complete development loop before introducing new protocol or rendering layers. The highest-value borrowing is prompt generation, inspect/replay tooling, practical examples, and a small curated set of trusted UI components. Benchmark source-format changes and fine-grained rendering before committing to them.

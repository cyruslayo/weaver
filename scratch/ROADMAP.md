# Roadmap: best of OpenUI, inside Weaver

## Goal

Make Weaver the best of both worlds. It keeps its strict, host-trusted A2UI
v0.9.1 runtime and adopts the developer loop that makes OpenUI productive:

1. **Prompt from catalog**: the trusted catalog becomes model instructions,
   so the allowed UI and the prompt never drift apart.
2. **Inspect and replay**: see every frame, its validity, the state it
   produced, and the action outcomes, then replay them deterministically.
3. **Readable errors**: typed errors become messages a host can act on.
4. **Realistic examples**: a form, a dashboard, and a ticket board, all
   runnable without an LLM.
5. **Custom components the safe way**: an app-owned catalog with trusted
   Table and Chart renderers.

We **borrow patterns, not code or protocol**. OpenUI Lang, React, and the
Thesys gateway stay out of Weaver.

## The audit, aligned to the current repository

The audit pinned Weaver at `cada149`, which is the current `main`. No drift.
Each claim was checked against the code:

| Audit claim | Repository reality | Status |
|---|---|---|
| Core is framework-independent; Web and MCP depend only on Core | Enforced by `packages/core/src/architecture-independence.test.ts` | Accurate |
| 18 Basic renderers, strict validation, budgets (depth 32, 1000 instances) | `packages/web/src/basic/*`, `packages/core/src/runtime/safety.ts` | Accurate |
| Conformance: 148 PASS, 1 PARTIAL (R155), 2 DEFERRED, 2 N/A, 3 AMBIGUOUS out of 156 | `docs/conformance-v0.9.1.md` | Accurate |
| No prompt generator | None exists. The inputs do exist: `defineCatalog()` (`packages/core/src/catalog/definition.ts`) and the Basic catalog's ~190 schema `description` fields (`createBasicCatalogV091Registration()`) | Gap, cheap to fill |
| No debug trace or replay | The runtime has no observer hook. `WeaverRuntime` is a class with `#private` members, so a wrapping decorator cannot type-check as `WeaverRuntime`. An opt-in config hook is required | Gap |
| Errors are typed but never presented | Typed unions exist: `MessageProcessorError`, `JsonlDecodeError`, `WeaverSurfaceResolutionError`, `WeaverRuntimeInteractionError`, and `WebRenderError` (`packages/web/src/surface/errors.ts`). Nothing formats them | Gap |
| Only a reference app and a playground exist | `examples/reference-app` is a deterministic agent with producer, JSONL, ingestion, and render, plus happy-dom tests. `examples/playground` is a static Basic demo | Accurate |
| A custom catalog is possible, but there is no recipe | `createBasicWebRuntime({ additionalCatalogs, additionalRenderers })` already supports it, but no example or doc shows how | Gap is examples and docs only |
| Not published to npm | The README says local tarballs. Manifests are under `@cylayo` with `publishConfig.access: public` | Accurate (P1) |

Drift found outside the audit:

- `docs/PLAN.md` uses the old `@weaver/*` package names, and its Task 53
  "Next" entry is stale.
- Package `test` scripts enumerate test files by hand, so every new test file
  must be registered.

## Decisions

- **Scope:** P0 items WVR-01 to WVR-05 are fully specified as issues. The
  benchmark and npm publishing are gated follow-ups. All other P1 and P2 work
  waits for evidence.
- **Placement:** pure tooling goes inside `@cylayo/weaver-core`: the prompt
  generator, the trace recorder and replay, and the error describer. There is
  no fourth package. DOM tooling (inspector, diagnostics panel) lives in
  `examples/` until hosts ask for it.
- **Release:** after epics E1 to E3 land, bump all three packages together to
  `0.3.0`.

## Non-goals (binding)

- No OpenUI Lang and no second DSL in Weaver.
- No permissive or auto-repair parsing. Strict validation happens before any
  state mutation.
- No mandatory vendor gateway, autofix service, or telemetry.
- No background fetch or ambient network access in Core.
- No automatic execution of agent-selected tools.
- No bulk import of OpenUI's 70+ components or React dependencies.
- The canonical Basic catalog stays immutable. Extras live under their own
  `catalogId`.
- The v0.9.1 positional collection semantics stay unchanged.

## Epics

| Epic | Audit | Outcome | Issues |
|---|---|---|---|
| E0 Housekeeping | — | Docs reflect the real package names and this roadmap | WVR-000 |
| E1 Prompt generation | WVR-01, §4.A/B | `generateA2UIV091Prompt()` in Core, a golden fixture, a sample | WVR-011 to WVR-016 |
| E2 Trace and replay | WVR-02, §4.D | Runtime observer, trace recorder, replay, inspector page | WVR-021 to WVR-025 |
| E3 Error presentation | WVR-03 | `describeWeaverError()`, `describeWebRenderError()`, last-good-state guarantees | WVR-031 to WVR-034 |
| E4 Cookbook | WVR-04, §4.F | Form, dashboard, and ticket board with keyboard and narrow-screen checks | WVR-041 to WVR-045 |
| E5 Custom catalog recipe | WVR-05, §4.E | App-owned catalog with DataTable and BarChart, plus safety tests | WVR-051 to WVR-055 |
| Release | — | 0.3.0 with the new public API | WVR-060 |
| Gated | WVR-06, 07, 08, 09, 10, 11 to 15 | Decided by evidence | WVR-080, WVR-081, WVR-090 |

## Sequencing

```text
WVR-000 (docs, independent)
E1: 011 → 012 → 013 ─┐
     └→ 014    └→ 015 ┴→ 016
E2: 021 → 022 → 023 → 024 → 025
E3: 031 → 032 → 033 ; 034 needs 032 + 024 + 041
E4: 041 → 042 / 043 / 044 → 045
E5: 041 → 051 → 052 / 053 → 054 → 055 (also needs 016)
016 + 025 + 033 → WVR-060 (0.3.0) → WVR-081 (npm, gated)
013 + 044 → WVR-080 (benchmark, gated)
```

E1, E2, E3, and E4 can run in parallel. They touch different directories, and
their only shared file, `packages/core/src/index.ts`, takes additive exports.

## Critical files

- **Modify:**
  - `packages/core/src/runtime/{types.ts,WeaverRuntime.ts,createWeaverRuntime.ts}`
  - `packages/core/src/index.ts`
  - `packages/{core,web}/package.json`
  - `docs/PLAN.md`
  - `README.md`
  - root `package.json`
  - `integration/workerd-consumer/worker.test.js`
- **New:**
  - `packages/core/src/{prompt,trace,diagnostics}/`
  - `packages/web/src/surface/describeWebRenderError.ts`
  - `examples/playground/inspector.html`
  - `examples/cookbook/**`
  - `docs/{prompt-generation,debugging,custom-catalogs}.md`
- **Reuse:**
  - `defineCatalog`
  - `createBasicCatalogV091Registration`
  - `createWeaverRuntime`
  - `createA2UIV091Producer`
  - `createA2UIV091StreamIngestion`
  - `createBasicWebRuntime({ additionalCatalogs, additionalRenderers })`
  - the agent and test pattern in `examples/reference-app`
  - the `--check` pattern in `scripts/generate-basic-catalog.mjs`

## Release-level verification

1. The full CI gate passes locally (see `README.md`, Workflow step 6).
2. The conformance tracker counts are unchanged. No protocol behavior changed.
3. `architecture-independence.test.ts` passes. The new Core modules have no
   DOM, eval, or Web imports.
4. Manual checks:
   - Inspector: step through the sample trace. The malformed frame shows a
     described error, and the outbound log fills.
   - Cookbook: all three screens work by keyboard and at 360px.

## Decision rules for future OpenUI comparisons (audit §8)

1. Is it a generation, runtime, renderer, or application feature?
2. Does Weaver already offer it through A2UI messages, host code, or a custom
   catalog?
3. Is the gap correctness, developer experience, visual quality, or
   convenience?
4. Can one small host adapter solve it without new protocol semantics?
5. Does it preserve schema validation, authorization, safe effects, resource
   policy, Core portability, and stale-callback protection?
6. Which tests and real-use metrics prove the improvement?
7. Which dependencies and maintenance does it add?

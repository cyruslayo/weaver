# Board

The single source of truth for status. Keep it in sync with each issue's front matter (see `README.md`).

| ID | Title | Epic | Pri | Status | Depends on | Est |
|---|---|---|---|---|---|---|
| [WVR-000](issues/WVR-000-housekeeping.md) | Fix stale package names and status in docs/PLAN.md; add roadmap pointer | E0 Housekeeping | P0 | `done` | — | S |
| [WVR-011](issues/WVR-011-prompt-generator-core.md) | Add generateA2UIV091Prompt() to Core (API, types, errors, determinism) | E1 Prompt generation | P0 | `done` | — | M |
| [WVR-012](issues/WVR-012-prompt-example-validation.md) | Validate prompt examples through a scratch runtime before emitting them | E1 Prompt generation | P0 | `ready` | WVR-011 | S |
| [WVR-013](issues/WVR-013-prompt-golden-fixture.md) | Golden Basic-catalog prompt fixture with --check script wired into CI | E1 Prompt generation | P0 | `todo` | WVR-012 | S |
| [WVR-014](issues/WVR-014-prompt-workerd-gate.md) | Exercise the prompt generator inside the packed-Core workerd gate | E1 Prompt generation | P0 | `ready` | WVR-011 | S |
| [WVR-015](issues/WVR-015-prompt-sample-reference-app.md) | Reference-app prompt sample with a canned model response (no LLM) | E1 Prompt generation | P0 | `todo` | WVR-012 | S |
| [WVR-016](issues/WVR-016-prompt-docs.md) | Document prompt generation (docs/prompt-generation.md + README section) | E1 Prompt generation | P0 | `todo` | WVR-013, WVR-015 | S |
| [WVR-021](issues/WVR-021-runtime-observer-hook.md) | Add opt-in observer hook to WeaverRuntime | E2 Trace and replay | P0 | `done` | — | M |
| [WVR-022](issues/WVR-022-trace-recorder.md) | createWeaverTraceRecorder + weaver-trace v1 format + ingestion frame-error capture | E2 Trace and replay | P0 | `ready` | WVR-021 | M |
| [WVR-023](issues/WVR-023-trace-replay.md) | replayWeaverTrace() with per-step divergence report | E2 Trace and replay | P0 | `todo` | WVR-022 | M |
| [WVR-024](issues/WVR-024-playground-inspector.md) | Playground inspector page (load trace, step, snapshots, suppressed outbound log) | E2 Trace and replay | P0 | `todo` | WVR-023 | L |
| [WVR-025](issues/WVR-025-debugging-docs.md) | Document tracing, replay and the inspector (docs/debugging.md) | E2 Trace and replay | P0 | `todo` | WVR-024 | S |
| [WVR-031](issues/WVR-031-describe-weaver-error.md) | Core describeWeaverError() — exhaustive, human-actionable error descriptions | E3 Error presentation | P0 | `done` | — | M |
| [WVR-032](issues/WVR-032-describe-web-render-error.md) | Web describeWebRenderError() for WebRenderError and interaction errors | E3 Error presentation | P0 | `ready` | WVR-031 | S |
| [WVR-033](issues/WVR-033-last-good-state-regressions.md) | Regression tests — malformed input leaves last good state and DOM; host gets described error | E3 Error presentation | P0 | `todo` | WVR-032 | S |
| [WVR-034](issues/WVR-034-diagnostics-panel.md) | Diagnostics panel in the inspector and a cookbook "error demo" | E3 Error presentation | P0 | `todo` | WVR-032, WVR-024, WVR-041 | M |
| [WVR-041](issues/WVR-041-cookbook-scaffold.md) | Scaffold examples/cookbook (Vite multi-page, deterministic agents, happy-dom tests) | E4 Cookbook | P0 | `done` | — | M |
| [WVR-042](issues/WVR-042-cookbook-form.md) | Cookbook screen — validated form with server round-trip | E4 Cookbook | P0 | `ready` | WVR-041 | M |
| [WVR-043](issues/WVR-043-cookbook-dashboard.md) | Cookbook screen — dashboard with data-model-only refresh | E4 Cookbook | P0 | `ready` | WVR-041 | M |
| [WVR-044](issues/WVR-044-cookbook-ticket-board.md) | Cookbook screen — ticket board (move / assign / close) | E4 Cookbook | P0 | `ready` | WVR-041 | L |
| [WVR-045](issues/WVR-045-cookbook-playwright-smoke.md) | Playwright smoke — 360px viewport and keyboard reachability for cookbook screens | E4 Cookbook | P0 | `todo` | WVR-042, WVR-043, WVR-044 | M |
| [WVR-051](issues/WVR-051-cookbook-custom-catalog.md) | Define an app-owned cookbook catalog with defineCatalog() | E5 Custom catalog recipe | P0 | `ready` | WVR-041 | S |
| [WVR-052](issues/WVR-052-datatable-renderer.md) | Trusted DataTable renderer (accessible, no innerHTML) | E5 Custom catalog recipe | P0 | `todo` | WVR-051 | M |
| [WVR-053](issues/WVR-053-barchart-renderer.md) | Trusted dependency-free SVG BarChart renderer | E5 Custom catalog recipe | P0 | `todo` | WVR-051 | M |
| [WVR-054](issues/WVR-054-cross-catalog-safety-tests.md) | Cross-catalog safety tests — unknown components fail safely, no fallback | E5 Custom catalog recipe | P0 | `todo` | WVR-052, WVR-053 | S |
| [WVR-055](issues/WVR-055-custom-catalog-docs.md) | Document the custom catalog recipe (docs/custom-catalogs.md) | E5 Custom catalog recipe | P0 | `todo` | WVR-054, WVR-016 | S |
| [WVR-060](issues/WVR-060-release-0.3.0.md) | Release prep 0.3.0 — synchronized version bump, README, PLAN.md | Release | P0 | `todo` | WVR-016, WVR-025, WVR-033 | S |
| [WVR-080](issues/WVR-080-generation-benchmark.md) | Generation benchmark — Weaver A2UI vs OpenUI Lang on identical tasks | Gated | P1 | `gated` | WVR-013, WVR-044 | L |
| [WVR-081](issues/WVR-081-npm-publish.md) | Publish @cylayo/weaver-* to npm (stable preview) | Gated | P1 | `gated` | WVR-060 | M |
| [WVR-090](issues/WVR-090-gated-backlog.md) | Gated backlog — remaining audit items with their evidence gates | Gated | P1/P2 | `gated` | — | — |

**Totals:** done: 5, ready: 8, todo: 14, gated: 3

## Start here (8 ready; 5 done)

As of 2026-10-10, WVR-000, WVR-011, WVR-021, WVR-031 and WVR-041 are `done`
(merged in cyruslayo/weaver#20, `619d4ef`). Eight issues are now `ready`. Each
one's dependencies are all `done`. Each lane starts with its lowest ID:

| Lane | First ready issue | Also ready | What it touches |
|---|---|---|---|
| E1 Prompt generation | WVR-012 Validate prompt examples through a scratch runtime | WVR-014 Exercise the prompt generator in the packed-Core workerd gate | `packages/core/src/prompt/generateA2UIV091Prompt.ts`, new `basicExamples.ts`, and its tests (012); `integration/workerd-consumer/worker.test.js` (014) |
| E2 Trace and replay | WVR-022 createWeaverTraceRecorder, weaver-trace v1, ingestion frame-error capture | none | New `packages/core/src/trace/*` with tests; edits to `packages/core/src/index.ts` and the Core test list |
| E3 Error presentation | WVR-032 Web describeWebRenderError() | none | New `packages/web/src/surface/describeWebRenderError.ts`, exported from Web. Covers `WebRenderError` and `WebInteractionError` |
| E4 Cookbook | WVR-042 Cookbook form screen | WVR-043 dashboard screen; WVR-044 ticket-board screen | Cookbook screens under `examples/cookbook`. Each screen is a separate issue and can be picked up on its own |
| E5 Custom catalog recipe | WVR-051 Define an app-owned cookbook catalog with `defineCatalog()` | none | `examples/cookbook/src/custom-catalog/catalog.ts` (DataTable, BarChart) |

Notes:

- Lanes share `packages/core/src/index.ts` (exports) and the package test
  lists. Rebase and resolve those conflicts trivially.
- WVR-042 and WVR-051 mention WVR-011 (done) for the prompt generator. It is
  not a blocker, and its front matter does not list it.
- WVR-043 mentions "WVR-07" and WVR-044 mentions "WVR-12". Those are audit
  item IDs (`source/` audit), not tracker issues.

## Dependency view

```text
E1: 011 → 012 → 013 → 014*        (*014 needs only 011)
           └→ 015 → 016 (also needs 013)
E2: 021 → 022 → 023 → 024 → 025
E3: 031 → 032 → 033
              └→ 034 (also needs 024, 041)
E4: 041 → {042, 043, 044} → 045
E5: 041 → 051 → {052, 053} → 054 → 055 (also needs 016)
Release: {016, 025, 033} → 060 → 081 (gated)
Bench:   {013, 044} → 080 (gated)
```

## Milestones

- **M1, "Prompt and errors"**: E1 and E3 done. Weaver can tell a model what
  to emit and tell a developer what went wrong.
- **M2, "See it"**: E2 done. Trace, replay, and the inspector.
- **M3, "Show it"**: E4 and E5 done. A realistic cookbook and a custom
  component recipe.
- **M4, "Ship it"**: WVR-060 done (0.3.0). Then the gated decisions:
  WVR-080 (benchmark) and WVR-081 (npm).

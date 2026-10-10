# Board

The single source of truth for status. Keep it in sync with each issue's front matter (see `README.md`).

| ID | Title | Epic | Pri | Status | Depends on | Est |
|---|---|---|---|---|---|---|
| [WVR-000](issues/WVR-000-housekeeping.md) | Fix stale package names and status in docs/PLAN.md; add roadmap pointer | E0 Housekeeping | P0 | `done` | — | S |
| [WVR-011](issues/WVR-011-prompt-generator-core.md) | Add generateA2UIV091Prompt() to Core (API, types, errors, determinism) | E1 Prompt generation | P0 | `done` | — | M |
| [WVR-012](issues/WVR-012-prompt-example-validation.md) | Validate prompt examples through a scratch runtime before emitting them | E1 Prompt generation | P0 | `done` | WVR-011 | S |
| [WVR-013](issues/WVR-013-prompt-golden-fixture.md) | Golden Basic-catalog prompt fixture with --check script wired into CI | E1 Prompt generation | P0 | `done` | WVR-012 | S |
| [WVR-014](issues/WVR-014-prompt-workerd-gate.md) | Exercise the prompt generator inside the packed-Core workerd gate | E1 Prompt generation | P0 | `done` | WVR-011 | S |
| [WVR-015](issues/WVR-015-prompt-sample-reference-app.md) | Reference-app prompt sample with a canned model response (no LLM) | E1 Prompt generation | P0 | `done` | WVR-012 | S |
| [WVR-016](issues/WVR-016-prompt-docs.md) | Document prompt generation (docs/prompt-generation.md + README section) | E1 Prompt generation | P0 | `done` | WVR-013, WVR-015 | S |
| [WVR-021](issues/WVR-021-runtime-observer-hook.md) | Add opt-in observer hook to WeaverRuntime | E2 Trace and replay | P0 | `done` | — | M |
| [WVR-022](issues/WVR-022-trace-recorder.md) | createWeaverTraceRecorder + weaver-trace v1 format + ingestion frame-error capture | E2 Trace and replay | P0 | `done` | WVR-021 | M |
| [WVR-023](issues/WVR-023-trace-replay.md) | replayWeaverTrace() with per-step divergence report | E2 Trace and replay | P0 | `done` | WVR-022 | M |
| [WVR-024](issues/WVR-024-playground-inspector.md) | Playground inspector page (load trace, step, snapshots, suppressed outbound log) | E2 Trace and replay | P0 | `done` | WVR-023 | L |
| [WVR-025](issues/WVR-025-debugging-docs.md) | Document tracing, replay and the inspector (docs/debugging.md) | E2 Trace and replay | P0 | `done` | WVR-024 | S |
| [WVR-031](issues/WVR-031-describe-weaver-error.md) | Core describeWeaverError() — exhaustive, human-actionable error descriptions | E3 Error presentation | P0 | `done` | — | M |
| [WVR-032](issues/WVR-032-describe-web-render-error.md) | Web describeWebRenderError() for WebRenderError and interaction errors | E3 Error presentation | P0 | `done` | WVR-031 | S |
| [WVR-033](issues/WVR-033-last-good-state-regressions.md) | Regression tests — malformed input leaves last good state and DOM; host gets described error | E3 Error presentation | P0 | `done` | WVR-032 | S |
| [WVR-034](issues/WVR-034-diagnostics-panel.md) | Diagnostics panel in the inspector and a cookbook "error demo" | E3 Error presentation | P0 | `ready` | WVR-032, WVR-024, WVR-041 | M |
| [WVR-041](issues/WVR-041-cookbook-scaffold.md) | Scaffold examples/cookbook (Vite multi-page, deterministic agents, happy-dom tests) | E4 Cookbook | P0 | `done` | — | M |
| [WVR-042](issues/WVR-042-cookbook-form.md) | Cookbook screen — validated form with server round-trip | E4 Cookbook | P0 | `done` | WVR-041 | M |
| [WVR-043](issues/WVR-043-cookbook-dashboard.md) | Cookbook screen — dashboard with data-model-only refresh | E4 Cookbook | P0 | `done` | WVR-041 | M |
| [WVR-044](issues/WVR-044-cookbook-ticket-board.md) | Cookbook screen — ticket board (move / assign / close) | E4 Cookbook | P0 | `done` | WVR-041 | L |
| [WVR-045](issues/WVR-045-cookbook-playwright-smoke.md) | Playwright smoke — 360px viewport and keyboard reachability for cookbook screens | E4 Cookbook | P0 | `done` | WVR-042, WVR-043, WVR-044 | M |
| [WVR-051](issues/WVR-051-cookbook-custom-catalog.md) | Define an app-owned cookbook catalog with defineCatalog() | E5 Custom catalog recipe | P0 | `done` | WVR-041 | S |
| [WVR-052](issues/WVR-052-datatable-renderer.md) | Trusted DataTable renderer (accessible, no innerHTML) | E5 Custom catalog recipe | P0 | `done` | WVR-051 | M |
| [WVR-053](issues/WVR-053-barchart-renderer.md) | Trusted dependency-free SVG BarChart renderer | E5 Custom catalog recipe | P0 | `done` | WVR-051 | M |
| [WVR-054](issues/WVR-054-cross-catalog-safety-tests.md) | Cross-catalog safety tests — unknown components fail safely, no fallback | E5 Custom catalog recipe | P0 | `done` | WVR-052, WVR-053, WVR-057 | S |
| [WVR-055](issues/WVR-055-custom-catalog-docs.md) | Document the custom catalog recipe (docs/custom-catalogs.md) | E5 Custom catalog recipe | P0 | `ready` | WVR-054, WVR-016, WVR-057 | S |
| [WVR-056](issues/WVR-056-row-scoped-action-dispatch.md) | Row-scoped action dispatch for DataTable rows | E5 Custom catalog recipe | P1 | `gated` | WVR-052 | M |
| [WVR-057](issues/WVR-057-cookbook-orders-report-screen.md) | Cookbook orders-report screen that mounts the custom catalog | E5 Custom catalog recipe | P1 | `done` | WVR-052, WVR-053 | S |
| [WVR-058](issues/WVR-058-basic-button-contrast.md) | Basic primary Button meets WCAG AA contrast (4.5:1) for its small text | F Follow-ups | P1 | `ready` | — | S |
| [WVR-059](issues/WVR-059-datatable-scroll-cue.md) | DataTable shows a cue when columns are hidden off-screen at narrow widths | F Follow-ups | P2 | `ready` | — | S |
| [WVR-060](issues/WVR-060-release-0.3.0.md) | Release prep 0.3.0 — synchronized version bump, README, PLAN.md | Release | P0 | `ready` | WVR-016, WVR-025, WVR-033 | S |
| [WVR-061](issues/WVR-061-barchart-sizing.md) | BarChart keeps its label text readable at 360px and stays within a height cap at 1280px | F Follow-ups | P2 | `ready` | — | S |
| [WVR-062](issues/WVR-062-hanging-assertion.md) | No assert.* receives DOM nodes, so a failing Web test reports instead of hanging | F Follow-ups | P2 | `ready` | — | S |
| [WVR-063](issues/WVR-063-playground-row-css-e2e.md) | Exercise the playground inspector's Row layout rules with a trace that contains a Row | F Follow-ups | P2 | `ready` | — | S |
| [WVR-080](issues/WVR-080-generation-benchmark.md) | Generation benchmark — Weaver A2UI vs OpenUI Lang on identical tasks | Gated | P1 | `gated` | WVR-013, WVR-044 | L |
| [WVR-081](issues/WVR-081-npm-publish.md) | Publish @cylayo/weaver-* to npm (stable preview) | Gated | P1 | `gated` | WVR-060 | M |
| [WVR-090](issues/WVR-090-gated-backlog.md) | Gated backlog — remaining audit items with their evidence gates | Gated | P1/P2 | `gated` | — | — |

**Totals:** done: 25, ready: 8, gated: 4 (37 issues)

## Start here (8 ready; 0 in-review; 25 done)

As of 2026-10-10, WVR-016, 024, 025, 054 and 057 are merged to `main` (cyruslayo/weaver#25,
merge commit 42f338c) and set to `done`. That clears the dependencies of WVR-034, WVR-055 and
WVR-060, which are promoted to `ready`. The five follow-up issues from the WVR-024/057 browser
review (epic F) were already `ready` and are unchanged. Pick the lowest ID inside the highest
priority within each lane.

**Roadmap lane**

- **WVR-034**, P0. Lane: E3 Error presentation. Touches a framework-free diagnostics panel
  module (`examples/shared/` or the playground, built with `textContent` only), wires it into the
  inspector (WVR-024), and adds an "Error demo" screen to `examples/cookbook`.
- **WVR-055**, P0. Lane: E5 Custom catalog recipe. Touches the new `docs/custom-catalogs.md`
  (the step-by-step recipe, with the "when to add a component" rule), and links it from the README.
- **WVR-060**, P0. Lane: Release. Release prep for 0.3.0. Touches the `@cylayo/weaver-{core,web,mcp}`
  versions (`0.3.0`, peer ranges `0.3.x`), `WEAVER_CORE_VERSION` in `packages/core/src/index.ts`,
  the README version table and tarball names, and `docs/PLAN.md`.

**Follow-ups (epic F Follow-ups, not on the roadmap)**

- **WVR-058**, P1. Lane: F Follow-ups. Touches `packages/web/src/basic/renderers.ts` (the
  primary Button fallback colour, which is 4.29:1 today), the Basic theme tests and, if the
  fallback is named there, `docs/web-rendering.md`. Changes the default visual output of
  `@cylayo/weaver-web` (note it for 0.3.0).
- **WVR-059**, P2. Lane: F Follow-ups. Touches `examples/cookbook/src/custom-catalog/dataTableRenderer.ts`
  (a scroll cue on the table wrapper at narrow widths) and `examples/cookbook/e2e/orders-report.spec.ts`.
- **WVR-061**, P2. Lane: F Follow-ups. Touches `examples/cookbook/src/custom-catalog/barChart.ts`
  (label text at 360px is about 8 to 9px, and the chart at 1280px has no height cap) and its spec.
- **WVR-062**, P2. Lane: F Follow-ups. Touches 43 `assert.*` call sites in six test files that
  pass DOM nodes to `assert` (the atomic-rerender test in `WebSurfaceRenderer.test.ts` is one of them;
  a failing one hangs the Web test file).
- **WVR-063**, P2. Lane: F Follow-ups. Touches `examples/playground/samples` (a new Row trace),
  `examples/playground/e2e/inspector.spec.ts` and `inspector.css`, so the Row rules are exercised.

Gated, do not start: WVR-056, WVR-080, WVR-081 and WVR-090. WVR-080 has all its dependencies
`done`, but it is gated and is not promoted until its evidence gate is met.

Notes:

- Lanes share `packages/core/src/index.ts` (exports) and the package test
  lists. Rebase and resolve those conflicts trivially.
- WVR-043 and WVR-044 mention "WVR-07" and "WVR-12". Those are audit item IDs
  (`source/` audit), not tracker issues.

## Dependency view

```text
E1: 011 → 012 → 013 → 014*        (*014 needs only 011)
           └→ 015 → 016 (also needs 013)
E2: 021 → 022 → 023 → 024 → 025
E3: 031 → 032 → 033
              └→ 034 (also needs 024, 041)
E4: 041 → {042, 043, 044} → 045
E5: 041 → 051 → {052, 053} → 057 → 054 → 055 (also needs 016)
Release: {016, 025, 033} → 060 → 081 (gated)
Bench:   {013, 044} → 080 (gated)
F:       058, 059, 061, 062, 063 (no dependencies; follow-ups from the WVR-024/057 browser review)
```

## Milestones

- **M1, "Prompt and errors"**: E1 and E3 done. Weaver can tell a model what
  to emit and tell a developer what went wrong.
- **M2, "See it"**: E2 done. Trace, replay, and the inspector.
- **M3, "Show it"**: E4 and E5 done. A realistic cookbook and a custom
  component recipe.
- **M4, "Ship it"**: WVR-060 done (0.3.0). Then the gated decisions:
  WVR-080 (benchmark) and WVR-081 (npm).

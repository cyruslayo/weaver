---
id: WVR-043
title: Cookbook screen — dashboard with data-model-only refresh
epic: E4 Cookbook
audit_ref: WVR-04, §4.B (changed-only updates), WVR-07 groundwork
priority: P0
status: done
depends_on: [WVR-041]
estimate: M
---

## Scope
- Build KPI tiles from Row, Column, Card and Text with weights, plus a List
  template over `/metrics/items`. Format values with `formatNumber` and
  `formatCurrency`.
- A "Refresh" action. The **host** owns the data: a deterministic
  pseudo-random generator seeded per click. The agent answers with
  `updateDataModel` only. This demonstrates the edit-mode guidance and the
  WVR-07 principle that the app owns data and Weaver receives only A2UI
  updates.
- A "Filter" ChoicePicker writes to a bound path. The host recomputes the
  items.

## Acceptance criteria
- [x] Refresh changes the values without any `updateComponents`. Assert on the
      emitted messages.
- [x] Focus stays on the Refresh button across updates. This exercises the
      existing focus restoration. Met by the follow-up Web change. See the Log.
- [x] The List renders N items from data, and N changes when filtered.

## Verification
`pnpm --filter @weaver/cookbook test`

## Definition of done
Merged.

## Log

- 2026-10-10: Branch `wvr-043-cookbook-dashboard` (from `fa731b4`), status
  `in-review`. Added the dashboard screen `src/screens/dashboard.ts` with
  `dashboard.html` and `src/entries/dashboard.ts`. It has KPI tiles (Row,
  Card with weight, Column, Text, formatted with `formatCurrency` and
  `formatNumber`), a List template over `/metrics/items`, a Filter ChoicePicker
  bound to `/filter`, and Refresh and Apply filter buttons. The host owns the
  data. Refresh is seeded from the click count through a mulberry32 generator.
  Each action sends the trusted filter selection, and the agent answers with
  `updateDataModel` only. The tests are in `src/screens/dashboard.test.ts`.
- Shared-file changes, each one additive: `vite.config.ts` (one input), the
  `index.html` landing link, one README table row, and the `package.json` test
  script, which now also runs `dist/screens/dashboard.test.js`. The shared
  harness also changed in two additive ways. It registers the Basic functions
  (`createBasicCatalogFunctionImplementations`) in the runtime config. Core
  treats them as opt-in, so without this every formatted value fails with
  `FUNCTION_EVALUATION_FAILED`. It also takes an optional `onOutbound` observer,
  which lets tests assert on emitted messages. Siblings get the function
  registration too.
- Design note: the Filter ChoicePicker writes only the local `/filter` path,
  and the list changes when Apply filter or Refresh sends that selection. Core
  has no action on input change in v0.9.1, so the host cannot recompute on
  selection alone.
- Acceptance criteria: the Refresh message criterion and the List criterion are
  ticked and tested (11 passing tests). The Refresh focus criterion is **not
  met**. The Basic Button renderer (`packages/web/src/basic/renderers.ts`)
  never calls `interactions.registerControl`, and the existing focus
  restoration (`WebSurfaceRenderer.ts`) works only for registered controls. A
  rerender replaces the Refresh button and focus falls to `BODY`. A Filter
  radio keeps focus through the same mechanism, and a test covers that. The
  Refresh case is a `todo` test, so the run stays green. Fixing it needs a
  one-line Web change, which is outside this issue. It should be tracked
  separately.
- Verification: `pnpm typecheck`, `pnpm build`, `pnpm test` (root, exit 0),
  `pnpm --filter @weaver/cookbook test` (11 pass, 1 todo), and
  `pnpm verify:packages` all pass.
- 2026-10-10 follow-up, criterion 2 met. This is a separate commit,
  `fix(web): register Basic Button as a focus-restorable control (WVR-043)`.
  `renderButton` in `packages/web/src/basic/renderers.ts` now calls
  `interactions.registerControl(button, "action")`. The identity is the same
  `(sourceComponentId, scopePath, localKey)` triple that tabs and the modal
  use, so it is stable across rerenders and unique per button instance. The
  Web test `a focused Basic Button survives a data-model rerender, and sibling
  buttons never take its focus` is in `WebSurfaceRenderer.test.ts`. The Web
  suite passes with 122 tests, all existing tests included. The todo in
  `dashboard.test.ts` is now a real passing test. The cookbook passes 12 of 12.
- Harness coexistence with WVR-042: the screen definition takes the same
  optional `web.functions` field that WVR-042 adds. The harness uses
  `definition.web?.functions` when a screen provides it, and the
  `createBasicCatalogFunctionImplementations` default otherwise, so no function
  name is registered twice. Dashboard, placeholder, and any screen that supplies
  nothing get the default. WVR-042 also adds `web.regexMatcher`, which this
  branch does not touch. When the two branches merge, the `harness.ts` conflict
  is expected and should keep both fields.
- 2026-10-10 merged in cyruslayo/weaver#21 (c2fc058)

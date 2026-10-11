---
id: WVR-072
title: BarChart category labels can touch at 360px with 5 or more bars
epic: F Follow-ups
audit_ref: follow-up to WVR-061 (residual risk recorded in its Log)
priority: P2
status: ready
depends_on: []
estimate: S
---

## Context
After WVR-061, the cookbook BarChart (`examples/cookbook/src/custom-catalog/barChart.ts`) has a 220-unit
viewBox (`VIEW_WIDTH = 220`). Its plot is 204 units wide (`PLOT_LEFT` to `PLOT_RIGHT` 212). At 360px the
chart renders at 236px wide, so the scale is 1.0727 and the 11u category labels render at 11.8px.

The density limit was not changed by WVR-061. The slot per bar is the plot width divided by the bar count.
At 4 bars the slot is 51 units, which is enough for "Refunded" at 11u (about 40 units). At 5 bars the slot is
40.8 units, so the widest label touches its neighbours. Measured at 360px and recorded in WVR-061's Log: with
about 5 or more bars, category labels start to touch. `DIRECT_LABEL_LIMIT` (`barChart.ts`, line 43) stays 12,
so a 12-bar chart at 360px draws direct labels and overlaps.

Scope of the risk: the cookbook example only. The orders report has 4 statuses (`ORDER_STATUSES` in
`examples/cookbook/src/screens/orders-report.ts`), so it is not affected today. No shipped package renders a
BarChart.

How it was found: arithmetic on the WVR-061 geometry, confirmed by its Log's measurements at 360px. A
reproduction with 8 bars is not yet in the repo.

## Scope
Decide the approach in the Log first. Options:

1. **Lower the direct-label limit for narrow containers.** Draw direct labels only up to the bar count that
   fits the slot at the minimum label size, and fall back to the existing non-direct path above that. Record
   the new threshold in the Log.
2. **Rotate or skip category labels when slots are narrow.** Rotate the labels, or draw every other label, when
   the slot is below the label width. This changes the label layout, so the Log must confirm that the
   accessible name and the visually hidden fallback table still hold.
3. **Document the limit.** Add a note to the cookbook README (or the chart's recipe section) that says a
   BarChart is sized for up to about 4 bars at 360px. This is the smallest change. It does not fix the overlap.

Recommendation: decide between 1 and 2 with the owner. Option 3 alone does not meet the acceptance below.

## Out of scope
- Chart types, colours, legends, or the catalog schema for `values`.
- The bar limit (`COOKBOOK_MAX_BARS`), unless option 1 needs it changed, and the Log records it if so.
- Any new dependency, including a chart library.
- The 1280px height cap and the 11px target that WVR-061 set.

## Files
- `examples/cookbook/src/custom-catalog/barChart.ts` (constants, label layout, `DIRECT_LABEL_LIMIT`)
- `examples/cookbook/src/custom-catalog/barChart.test.ts` (only if expectations change)
- `examples/cookbook/e2e/orders-report.spec.ts`, or a new e2e file, for the 8-bar test at 360px
- `scratch/issues/WVR-072-barchart-label-density-360.md`, `scratch/BOARD.md`

## Acceptance criteria
- [ ] The Log records the option chosen (1, 2 or 3) and the reason, before any code change.
- [ ] A real-browser test renders a BarChart with 8 bars at 360px, and asserts that the bounding boxes of the
      category label text elements do not overlap (each pair has a positive gap).
- [ ] The same test asserts that every label renders at 11px or more, using the effective scale that WVR-061
      defines.
- [ ] A mutation check reverts the fix (or the threshold) and shows the new test failing. The Log records the
      failure output and the revert.
- [ ] The 4-bar orders report still passes its existing e2e tests at both widths, and `barChart.test.ts` passes.
- [ ] No new dependency is added, and no `innerHTML` is introduced.

## Verification
- `pnpm --filter @weaver/cookbook test`
- `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm --filter @weaver/cookbook e2e`
- `pnpm test`, `pnpm typecheck`, `pnpm check:docs` (if docs change)

## Definition of done
Merged to `main`, with every acceptance criterion ticked on evidence.

## Log
- 2026-10-11: created from the WVR-061 Log (residual risk, found in its after-change review). Status `ready`,
  no dependencies, P2. Evidence: `barChart.ts` plot width 204 units (`VIEW_WIDTH` 220, `PLOT_RIGHT` 212);
  4 bars give a 51-unit slot and 5 bars give 40.8 units, against about 40 units for "Refunded" at 11u;
  `DIRECT_LABEL_LIMIT` 12 (line 43). No approach is chosen yet. The options are listed in Scope.

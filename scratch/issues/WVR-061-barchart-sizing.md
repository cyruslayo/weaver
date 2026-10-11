---
id: WVR-061
title: BarChart keeps its label text readable at 360px and stays within a height cap at 1280px
epic: F Follow-ups
audit_ref: follow-up to WVR-053 / WVR-057 (browser review)
priority: P2
status: in-review
depends_on: []
estimate: S
---

## Context
The cookbook BarChart (`examples/cookbook/src/custom-catalog/barChart.ts`) draws into a fixed
viewBox, `0 0 320 200` (`VIEW_WIDTH = 320`, `VIEW_HEIGHT = 200` at lines 33-34; `viewBox` set at
line 119). The SVG style at line 122 is `display: block; width: 100%; height: auto; overflow: visible;`.
There is no `max-width` and no `max-height`, so the chart scales with its container. Its text is set in
user units: the value labels at `font-size` 12 (line 170) and the category labels at `font-size` 11
(line 179). These are scaled by the same factor as the drawing.

Measured in Chromium through Playwright (built cookbook, `orders-report.html`):

- At 360px wide: the SVG is 236px wide, which is the container width. Its scale is 236/320 = 0.7375.
  The category labels render at **8.11px** and the value labels at **8.85px**. The bar count is 4, so
  direct labels are drawn (`DIRECT_LABEL_LIMIT = 12`, line 43).
- At 1280px wide: the SVG is **612px wide and 382.5px tall**, with a scale of 1.9125. Labels render at
  **21.0px** and **23.0px**. No cap applies.

So the text is too small at narrow widths, and the chart is very large at wide ones. Both come from the
same scaling with no limit in either direction.

The accessible name ("Order value by status (USD)") and the visually hidden fallback table
(`[data-weaver-chart-table]`) are covered by `orders-report.spec.ts:50-59`. The geometry is covered by
unit tests in `barChart.test.ts`, which do not check layout.

How it was found: Playwright measurement of the built page, plus reading `barChart.ts`.

## Scope
Decide the approach in the Log first. The real choice: at the measured 236px container, an 11px label
needs a scale of at least 1, so either the viewBox is no wider than about 236 user units, or the text is
not scaled with the drawing. Options:

1. **Narrow viewBox plus a height cap.** Set the viewBox width near the narrow container width (about
   240), so that units are close to px at 360px. Add `max-width` and `max-height` on the SVG (for example
   `max-height: 320px`) so the wide layout stays bounded. Geometry constants change, so the Log must
   record the new values.
2. **Keep the viewBox and cap the size.** Add `max-width` and `max-height` (for example
   `max-height: 320px`, and `max-width` to stop the chart growing past a set width). This bounds the
   1280px size but does not fix the 360px text, so it does not meet the 11px criterion on its own.
3. **HTML labels.** Render the value and category labels as HTML elements positioned over the SVG, sized
   in CSS with a minimum `font-size` (for example `max(11px, ...)`). This is the most flexible and the
   largest change. It touches the accessible structure, so the Log must confirm the chart's `role="img"`
   name and the fallback table still hold.
4. **Resize-driven text.** Set the SVG text sizes from the measured container width with a
   ResizeObserver, so the label size in user units is `11px / scale`. This needs a small DOM script.
   Record the choice in the Log.

## Out of scope
- Chart types, colours, legends, the bar limit (`COOKBOOK_MAX_BARS`), or the catalog schema for `values`.
- The DataTable (WVR-059).
- Any new dependency, including a chart library.
- Changing the accessible name or removing the fallback table.

## Files
- `examples/cookbook/src/custom-catalog/barChart.ts` (constants lines 33-44, SVG attributes lines 118-122, label `font-size` lines 170 and 179)
- `examples/cookbook/src/custom-catalog/barChart.test.ts` (geometry or text expectations, if they change)
- `examples/cookbook/e2e/orders-report.spec.ts` (new real-browser size assertions at both widths)
- `examples/cookbook/src/shared/style.css` (only if the caps are set there; inline is preferred)
- `scratch/issues/WVR-061-barchart-sizing.md`, `scratch/BOARD.md`

## Acceptance criteria
- [x] At 360px, every BarChart text label (value and category) renders at 11px or more, measured in the real browser as the computed `font-size` multiplied by the SVG's rendered scale (`getBoundingClientRect().width / viewBox width`). The Playwright test asserts this.
- [x] At 1280px, the chart's rendered height does not exceed the stated cap, which the Log sets (for example 320px). The Playwright test asserts `getBoundingClientRect().height <= cap`.
- [x] The chart still has `role="img"` and the accessible name "Order value by status (USD)". The fallback table is still present with 4 body rows (existing spec lines 50-59 still pass).
- [x] No horizontal page overflow at 360px or 1280px (`expectNoHorizontalOverflow` still passes).
- [x] The `barChart.test.ts` unit tests pass. Any constant that changes is recorded with its old and new value in the Log.
- [x] No new dependency is added, and no `innerHTML` is introduced.
- [x] The Log records the measured label sizes and chart heights before and after the change.

## Verification
- `pnpm --filter @weaver/cookbook test`
- `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm --filter @weaver/cookbook e2e`
- `pnpm test`, `pnpm typecheck`

## Definition of done
Merged to `main`, with every acceptance criterion ticked on evidence.

## Log
- 2026-10-10: created from the WVR-024/057 browser review. Status `ready`, no dependencies. Measured: at 360px the SVG is 236px wide (scale 0.7375) and labels are 8.11px and 8.85px. At 1280px the SVG is 612x382.5px (scale 1.9125) and labels are 21.0px and 23.0px. No `max-height` or `max-width` in `barChart.ts`.
- 2026-10-11: started on branch `wvr-061-barchart-sizing` from `a314299` (Merge PR #41). `pnpm install --frozen-lockfile` ran clean. Baseline: `pnpm --filter @weaver/cookbook test` exit 0, 99 tests pass, 0 fail. Baseline `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm --filter @weaver/cookbook e2e` exit 0, 40 passed (width-1280 and width-360, 20 tests each).
- 2026-10-11, BEFORE measurement (Chromium via `@playwright/test` 1.56.1, `vite preview` of the built cookbook, `orders-report.html`, script kept in the session scratchpad, not the repo). Scale is rendered SVG width / viewBox width. Label sizes are the computed font-size in user units times that scale.
  - 360px viewport: SVG 236 x 147.5 px, viewBox 320 x 200, scale 0.7375. Category labels (font-size 11) render at 8.11px. Value labels (font-size 12) render at 8.85px. Document scrollWidth 360 = innerWidth.
  - 1280px viewport: SVG 612 x 382.5 px, viewBox 320 x 200, scale 1.9125. Category labels render at 21.04px. Value labels render at 22.95px.
  - Labels are the 4 statuses (`ORDER_STATUSES` in `screens/orders-report.ts`: Pending, Paid, Shipped, Refunded), so 8 text elements.
- 2026-10-11, APPROACH (decided before any source change): option 1 (narrow viewBox) plus option 2 (height cap), with the text kept in user units.
  - Why not option 2 alone: the cap does nothing for width. At 236px the scale stays 236/320 = 0.7375, so 11u labels render at 8.11px. That fails the 11px target.
  - Why not option 3 or 4: they add a DOM layout script or HTML labels. The viewBox and a CSS cap meet the target with a smaller change.
  - Arithmetic for the narrow viewBox. Rendered label px = font-size(user units) x (container px / viewBox width). The container is 236px at 360px. For the 11u category label to reach 11px, the viewBox width must be at most 236 x 11 / 11 = 236. Option "about 240" from the issue fails: 11 x 236/240 = 10.82px. I chose a viewBox width of 220, which keeps about 7% headroom. At 236px the scale is 236/220 = 1.0727, so category labels render at 11 x 1.0727 = 11.80px, and value labels at 12 x 1.0727 = 12.87px. The 11px target is met as long as the container is at least 220px wide (11 x 220 / 11 = 220).
  - Height at 360px: 236 x 200/220 = 214.5px. The SVG gets taller than before (147.5px), which is the cost of holding the text size.
  - Height cap at 1280px: the width-driven SVG would be 612 x 556 px (scale 612/220 = 2.78). A `max-height: 320px` cap gives a rendered height of 320px. With `preserveAspectRatio` at its default (meet), the drawing scales by min(612/220, 320/200) = 1.6 and is centred horizontally. Category labels then render at 17.6px and value labels at 19.2px.
  - Test metric: the effective drawing scale is min(rendered width / viewBox width, rendered height / viewBox height). It equals the width-based scale at 360px and is the only correct one once the cap binds at 1280px.
  - New or changed constants (old -> new): `VIEW_WIDTH` 320 -> 220. `PLOT_RIGHT` is derived (`VIEW_WIDTH - 8`), so 312 -> 212. New `CHART_MAX_HEIGHT_PX` = 320 (no cap before). `VIEW_HEIGHT` 200 unchanged. `PLOT_LEFT`, `PLOT_TOP`, `PLOT_BOTTOM`, `BAR_GAP`, `BAR_MAX_WIDTH` (48), and the label font sizes (11 and 12) are unchanged.
  - Bar slot width: plot width 204 / 4 bars = 51 user units per slot. Bars keep `BAR_MAX_WIDTH` 48. Risk to check after the change: "Refunded" at 11u must fit in the 51-unit slot.
  - Known density limit (not changed): the plot is 204 units wide, so with about 5 or more bars, per-bar labels at 11u (about 40 units for "Refunded") start to touch their neighbours. The old 304-unit plot had the same problem at a higher count. `DIRECT_LABEL_LIMIT` stays 12, so the 12-bar case is a known overlap risk at 360px and is not fixed here.
- 2026-10-11, change (commits `1bded9c` source plus unit test, `9123913` e2e block): `VIEW_WIDTH` 320 -> 220, `PLOT_RIGHT` 312 -> 212 (derived), new `CHART_MAX_HEIGHT_PX` = 320, SVG style gains `max-height: 320px`. `barChart.test.ts` gets one new test that pins `viewBox="0 0 220 200"` and the 320px cap. `orders-report.spec.ts` gets a `WVR-061 BarChart sizing` block at the end with two tests, which run at both widths. A helper computes the effective scale, the smaller of width and height ratios.
- 2026-10-11, AFTER measurement (same script, same build method, Chromium, scratch copy of the built cookbook):
  - 360px: SVG 236 x 214.53 px, viewBox 220 x 200, effective scale 1.0727 (width and height ratios agree). Category labels 11.8px, value labels 12.87px. Minimum label 11.8px, against the target of 11px. All text inside the SVG box. Label gaps between category labels are positive (min 4.82px, the last pair). Document scrollWidth 360 = innerWidth.
  - 1280px: SVG 612 x 320 px, viewBox 220 x 200. Width ratio 2.7818, height ratio 1.6, effective scale 1.6 (the cap binds). Category labels 17.6px, value labels 19.2px. Baseline line rendered width confirms the effective scale: 1.6.
  - Note: the width-only scale at 1280px would be 2.78 and misleads. The 1280 tests therefore use the effective scale.
- 2026-10-11, MUTATION CHECK (run with `--grep "WVR-061"`, only the new block):
  - Mutation A, old behaviour restored (`VIEW_WIDTH` 320, no `max-height`): 2 failed, 2 passed. 1280px cap fails: `Expected <= 320, Received 382.5`. 360px label fails: `"278" at 360px Expected >= 11, Received 8.850000000000001`. The 1280px label test and the 360px cap test pass, as expected at those widths.
  - Mutation B, new viewBox but no cap: 1 failed, 3 passed. 1280px cap fails: `Expected <= 320, Received 556.359375`.
  - Restored: `git checkout -- barChart.ts`, rebuilt, `git status` clean. Passing run: 4 WVR-061 tests pass, all 44 e2e tests pass.
- 2026-10-11, verification (exit codes and counts):
  - Unit tests, `pnpm --filter @weaver/cookbook test`: before 99 pass, 0 fail. After 100 pass, 0 fail, exit 0 (one new test).
  - e2e, `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm --filter @weaver/cookbook e2e`: before 40 passed (exit 0). After 44 passed (exit 0). The 4 new tests are the WVR-061 ones (2 tests x 2 widths). The existing 40 are unchanged and pass.
  - Incident, disclosed: during the first after-run, Playwright's `reuseExistingServer` attached to a `vite preview` on port 4173 that belongs to another session (worktree `agent-a6a58f61131e26bc7`), so two WVR-061 tests failed on its old build. I did not kill that server. I ran the same suite on my own preview on 4199 (scratch config outside the repo). It passed 44/44. Once 4173 was free, the official command also passed 44/44. The 40-test baseline ran before that server existed (its log predates 11:00), so it used my own build.
  - `pnpm check:generated` exit 0. `pnpm check:docs` exit 0. `pnpm typecheck` exit 0. `pnpm test` exit 0. `pnpm build` exit 0. `pnpm verify:packages` exit 0. `pnpm verify:worker-core` exit 0.
- 2026-10-11, status `in-review`. Nothing pushed, tagged, or published. `scratch/BOARD.md` not touched. No change under `packages/`, no lockfile change, no version change.

---
id: WVR-061
title: BarChart keeps its label text readable at 360px and stays within a height cap at 1280px
epic: F Follow-ups
audit_ref: follow-up to WVR-053 / WVR-057 (browser review)
priority: P2
status: ready
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
- [ ] At 360px, every BarChart text label (value and category) renders at 11px or more, measured in the real browser as the computed `font-size` multiplied by the SVG's rendered scale (`getBoundingClientRect().width / viewBox width`). The Playwright test asserts this.
- [ ] At 1280px, the chart's rendered height does not exceed the stated cap, which the Log sets (for example 320px). The Playwright test asserts `getBoundingClientRect().height <= cap`.
- [ ] The chart still has `role="img"` and the accessible name "Order value by status (USD)". The fallback table is still present with 4 body rows (existing spec lines 50-59 still pass).
- [ ] No horizontal page overflow at 360px or 1280px (`expectNoHorizontalOverflow` still passes).
- [ ] The `barChart.test.ts` unit tests pass. Any constant that changes is recorded with its old and new value in the Log.
- [ ] No new dependency is added, and no `innerHTML` is introduced.
- [ ] The Log records the measured label sizes and chart heights before and after the change.

## Verification
- `pnpm --filter @weaver/cookbook test`
- `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm --filter @weaver/cookbook e2e`
- `pnpm test`, `pnpm typecheck`

## Definition of done
Merged to `main`, with every acceptance criterion ticked on evidence.

## Log
- 2026-10-10: created from the WVR-024/057 browser review. Status `ready`, no dependencies. Measured: at 360px the SVG is 236px wide (scale 0.7375) and labels are 8.11px and 8.85px. At 1280px the SVG is 612x382.5px (scale 1.9125) and labels are 21.0px and 23.0px. No `max-height` or `max-width` in `barChart.ts`.

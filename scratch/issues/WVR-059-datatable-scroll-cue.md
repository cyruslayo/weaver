---
id: WVR-059
title: DataTable shows a cue when columns are hidden off-screen at narrow widths
epic: F Follow-ups
audit_ref: follow-up to WVR-057 (browser review)
priority: P2
status: ready
depends_on: []
estimate: S
---

## Context
The Orders report (`examples/cookbook/src/screens/orders-report.ts:71-76`) has four columns: Order,
Customer, Status and Total (USD). The DataTable renderer (`examples/cookbook/src/custom-catalog/dataTableRenderer.ts:89-101`)
puts the table in a wrapper with `overflowX: "auto"`, `role="region"`, `tabindex="0"` and an
`aria-label` from the caption. Nothing else tells the user that more columns exist. The renderer has
no shadow, fade, or hint.

Measured in Chromium through Playwright (built cookbook, `orders-report.html`):

- At 360px wide (rendered at 360x780): the wrapper's `clientWidth` is 236px and its `scrollWidth`
  is 455px, so it overflows. The header positions show Order at 103px, fully visible. Customer is
  cut off, with 133 of its 143px visible. Status (97px) and Total (112px) have 0px visible.
- At 1280px wide: `clientWidth` and `scrollWidth` are both 612px, so nothing overflows.
- The page itself has no horizontal overflow at either width.

The existing spec (`examples/cookbook/e2e/orders-report.spec.ts:33-48`) checks that the wrapper
has `overflow-x: auto` and sits inside the viewport. It does not check for a cue. The DataTable
renderer test (`dataTableRenderer.test.ts`) runs in happy-dom and has no layout.

How it was found: a Playwright measurement of the built page, plus reading the renderer and the spec.

## Scope
Decide the approach in the Log first. Options, all CSS or plain DOM, with no dependency:

1. **CSS scroll shadow.** Use the standard pattern: `background` gradients on the wrapper with
   `background-attachment: local` (content) and `scroll` (shadow). The shadow shows only when there is
   content to scroll. It needs no JavaScript for the shadow itself, but a scroll-end state may need a
   small listener.
2. **Edge fade.** A `mask-image` linear gradient on the right edge, switched on while the content
   overflows and off at the end of the scroll. This needs a `scroll` listener to know the end.
3. **Visible hint.** A short visible line, such as "Scroll for more columns", placed beside the
   region and shown when `scrollWidth > clientWidth` (checked on render and on resize). Keep it out
   of the region's accessible name, so the region name stays "Orders".

Option 1 is preferred if it passes the acceptance criteria. Record the choice in the Log.

## Out of scope
- Row actions (WVR-056, gated), and any change to the column set.
- Hiding or reordering columns, a responsive card layout, or a sticky first column.
- Any JavaScript library or new dependency.
- Changing the region role, tabindex or name that WVR-057 established.

## Files
- `examples/cookbook/src/custom-catalog/dataTableRenderer.ts` (wrapper, lines 89-101)
- `examples/cookbook/src/custom-catalog/dataTableRenderer.test.ts` (only if the source-scan or DOM tests need an update)
- `examples/cookbook/e2e/orders-report.spec.ts` (the real-browser cue test at both widths)
- `examples/cookbook/src/shared/style.css` (only if the cue is styled in the shared stylesheet; the renderer uses inline styles, so inline is preferred)
- `scratch/issues/WVR-059-datatable-scroll-cue.md`, `scratch/BOARD.md`

## Acceptance criteria
- [ ] At 360px, with the four-column orders report, the cue is present at the wrapper's right edge while `scrollWidth > clientWidth`. The Playwright test asserts the cue's computed style (for example a `background-image`, `mask-image`, or visible hint element) is not `none` or absent.
- [ ] At 1280px, where `scrollWidth == clientWidth`, the cue is absent. The same test asserts this.
- [ ] Once the wrapper is scrolled to its end, the edge cue is removed or the hint is hidden. Options 2 and 3 require this. Option 1 satisfies it through `background-attachment`. The test scrolls the wrapper and asserts it.
- [ ] The wrapper keeps `role="region"`, `tabindex="0"` and its accessible name "Orders". The existing spec tests at lines 61-70 still pass.
- [ ] No horizontal page overflow at 360px (`expectNoHorizontalOverflow` in the orders-report spec still passes).
- [ ] No `innerHTML` is introduced (the existing source-scan test in `dataTableRenderer.test.ts` passes), and no new dependency is added.
- [ ] The real-browser test runs at both widths in `orders-report.spec.ts`, and its result is recorded in the Log.

## Verification
- `pnpm --filter @weaver/cookbook test`
- `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm --filter @weaver/cookbook e2e`
- `pnpm test`, `pnpm typecheck`

## Definition of done
Merged to `main`, with every acceptance criterion ticked on evidence.

## Log
- 2026-10-10: created from the WVR-024/057 browser review. Status `ready`, no dependencies. Measured at 360px: wrapper `clientWidth` 236, `scrollWidth` 455. Order fully visible, Customer 133 of 143px visible, Status and Total 0px visible. At 1280px `clientWidth` and `scrollWidth` are both 612.

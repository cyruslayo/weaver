---
id: WVR-059
title: DataTable shows a cue when columns are hidden off-screen at narrow widths
epic: F Follow-ups
audit_ref: follow-up to WVR-057 (browser review)
priority: P2
status: done
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
- [x] At 360px, with the four-column orders report, the cue is present at the wrapper's right edge while `scrollWidth > clientWidth`. The Playwright test asserts the cue's computed style (for example a `background-image`, `mask-image`, or visible hint element) is not `none` or absent. Evidence: after-change measurement at 360px, `scrollWidth` 455 > `clientWidth` 236, computed `background-image` is the gradient. The e2e test "at 360px the cue shows while columns are hidden past the right edge" passes at both projects.
- [x] At 1280px, where `scrollWidth == clientWidth`, the cue is absent. The same test asserts this. Evidence: after-change measurement at 1280px, `clientWidth` = `scrollWidth` = 612, `background-image` `none`. The e2e test "at 1280px nothing overflows, so the cue is absent" passes at both projects.
- [x] Once the wrapper is scrolled to its end, the edge cue is removed or the hint is hidden. Options 2 and 3 require this. Option 1 satisfies it through `background-attachment`. The test scrolls the wrapper and asserts it. Note: `background-attachment` alone does not do this (see the approach entry above). The listener does it. Evidence: after-change measurement, at `scrollLeft` 219 (the end) the computed `background-image` is `none`. The e2e test "...removed once the table is scrolled to its end, and returns at the start" passes, and it scrolls with a horizontal mouse wheel.
- [x] The wrapper keeps `role="region"`, `tabindex="0"` and its accessible name "Orders". The existing spec tests at lines 61-70 still pass. Evidence: after-change measurement reports `region`, `0`, `Orders` at both widths. The Tab-order e2e test passes.
- [x] No horizontal page overflow at 360px (`expectNoHorizontalOverflow` in the orders-report spec still passes). Evidence: after-change `pageOverflow` 0 at 360px. The e2e test "the orders report has no horizontal page scroll" passes.
- [x] No `innerHTML` is introduced (the existing source-scan test in `dataTableRenderer.test.ts` passes), and no new dependency is added. Evidence: the cookbook unit run is 99 pass, 0 fail, and the change has no `innerHTML` or `package.json` edit.
- [x] The real-browser test runs at both widths in `orders-report.spec.ts`, and its result is recorded in the Log. Evidence: the e2e run is 46 passed, which is 40 baseline plus 6 new (3 tests at 2 widths).

## Verification
- `pnpm --filter @weaver/cookbook test`
- `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm --filter @weaver/cookbook e2e`
- `pnpm test`, `pnpm typecheck`

## Definition of done
Merged to `main`, with every acceptance criterion ticked on evidence.

## Log
- 2026-10-10: created from the WVR-024/057 browser review. Status `ready`, no dependencies. Measured at 360px: wrapper `clientWidth` 236, `scrollWidth` 455. Order fully visible, Customer 133 of 143px visible, Status and Total 0px visible. At 1280px `clientWidth` and `scrollWidth` are both 612.
- 2026-10-11: started on branch `wvr-059-scroll-cue` from `a314299` (Merge PR #41). Status `in-progress`.
  - **Approach chosen: option 1, a CSS scroll shadow, with a small listener.** Pure CSS cannot meet
    "removed once scrolled to the end" on its own. A `background-attachment: scroll` shadow stays at
    the visible right edge at every scroll position, and a `local` cover would leave a non-`none`
    background-image at 1280px, so the cue could not be "absent" there. The renderer therefore sets
    the gradient as an inline `background-image` only while `scrollWidth > clientWidth` and the wrapper
    is not at its end. It re-checks on `scroll`, and on `ResizeObserver` for the wrapper and the table
    (which covers resize and Refresh). The issue's option 1 text allows this ("a scroll-end state may
    need a small listener"). No DOM structure changes, no focusable element is added, and no new
    dependency.
  - Before-change browser measurement (`examples/cookbook`, built, `vite preview` on 4173, Chromium via
    `node` and the cookbook's `@playwright/test`; script in the session scratchpad, output
    `wvr059-measure-before.json`):
    - 360px (viewport 360x780): `clientWidth` 236, `scrollWidth` 455, `scrollLeft` 0, `backgroundImage` `none`, `maskImage` `none`. After `scrollLeft = scrollWidth`: `scrollLeft` 219, `backgroundImage` `none`. Page `scrollWidth - innerWidth` 0.
    - 1280px (viewport 1280x900): `clientWidth` 612, `scrollWidth` 612, `backgroundImage` `none`. Page overflow 0.
    - Role `region`, tabindex `0`, name `Orders` at both widths.
  - Baseline before change: `pnpm --filter @weaver/cookbook test` exit 0, 99 tests pass, 0 fail.
    `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm --filter @weaver/cookbook e2e` exit 0, 40 passed.
  - Implementation: `dataTableRenderer.ts` adds `attachScrollCue(wrapper, table)`, called after the table
    is appended. The cue is `background: linear-gradient(...) right center / 16px 100% no-repeat scroll`
    as an inline style, and `none` otherwise. The first attempt set `style.backgroundImage` with the
    `/ 16px 100%` size, and the browser dropped it silently. The cue never showed, so the shorthand is
    needed. A keyboard `End` press on the focused region scrolled the page vertically, not the wrapper,
    so the e2e test scrolls with a horizontal mouse wheel instead.
  - After-change measurement (same script, same server, after the rebuild). The script's "before" key
    holds the page's state on load, and "atEnd" holds the state after `scrollLeft = scrollWidth`:
    - 360px: `clientWidth` 236, `scrollWidth` 455, load `backgroundImage` = the gradient. At the end
      (`scrollLeft` 219), `backgroundImage` `none`. Page overflow 0. Role `region`, tabindex `0`, name `Orders`.
    - 1280px: `clientWidth` 612, `scrollWidth` 612, `backgroundImage` `none` on load and at the end.
    - Output file: `wvr059-measure-after.json` in the session scratchpad.
  - Mutation check. The `attachScrollCue(wrapper, table);` call was commented out in the renderer, and
    `pnpm --filter @weaver/cookbook e2e` was run. Exit 1, `42 passed`, `4 failed`: the 360px cue test and
    the end-of-scroll test at both projects. The failure is `the cue is drawn on the wrapper`, with
    `Received string: "none"`, and the end test times out waiting for the gradient. The call was then
    restored, and e2e was rerun: exit 0, `46 passed`.
  - Commits: `5a59066` (approach and before measurement), `c2b8fe2` (renderer cue), `05b5f1b` (e2e tests).
  - Gate and verification (all run from the worktree after the commits):
    - `pnpm --filter @weaver/cookbook test`: exit 0. Unit counts: before 99 pass, after 99 pass, 0 fail.
      No unit test was added, because the DOM structure did not change.
    - `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm --filter @weaver/cookbook e2e`: exit 0. Before 40
      passed, after 46 passed.
    - `pnpm typecheck`: exit 0.
    - `pnpm check:generated`: exit 0. `pnpm check:docs`: exit 0 (this issue Markdown changed).
    - `pnpm test`: exit 0 (root unit suites, including the 8 and 3 test blocks printed by the runner). A
      root baseline count was not taken before the change.
    - `pnpm build`: exit 0. `pnpm verify:packages`: exit 0. `pnpm verify:worker-core`: exit 0.
  - Not run: `pnpm conformance:v0.9.1` (the README step 6 includes it, but the task gate did not).
  - Note for the next author: a `background-attachment: local` cover, which the option 1 text suggests,
    would leave a non-`none` background-image at 1280px. That is why the listener is used.
- 2026-10-11: integrated on branch `wvr-board-059-061-063`. Status `done`. Merged in the same PR as WVR-059,
  WVR-061 and WVR-063, and ready to merge in one PR together with the other two. The cookbook e2e count of
  46 above was measured before WVR-061 was integrated. With both, the combined cookbook e2e count is 50
  (40 baseline, plus 6 from this issue and 4 from WVR-061). The full gate is to be re-run before merge.

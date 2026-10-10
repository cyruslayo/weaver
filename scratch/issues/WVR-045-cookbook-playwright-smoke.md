---
id: WVR-045
title: Playwright smoke — 360px viewport and keyboard reachability for cookbook screens
epic: E4 Cookbook
audit_ref: WVR-04, Slice 3 ("keyboard and narrow-screen acceptance checks")
priority: P0
status: done
depends_on: [WVR-042, WVR-043, WVR-044]
estimate: M
---

## Context
happy-dom cannot check layout. Chromium is pre-installed in cloud sessions
(`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`); never run
`playwright install`.

## Scope
- `examples/cookbook/e2e/*.spec.ts` uses `@playwright/test` as a devDependency
  of the cookbook only.
- The script `pnpm --filter @weaver/cookbook e2e` builds the cookbook, runs
  `vite preview`, and runs the specs.
- For each screen, at viewport widths 360 and 1280:
  - assert no horizontal overflow
    (`document.documentElement.scrollWidth <= innerWidth`);
  - press Tab to every interactive control and assert each one gets focus
    with a visible focus indicator;
  - complete the primary flow by keyboard.
- Keep it outside required CI at first. After 10 consecutive green local runs
  with no flakes, open a follow-up issue to add it to CI.

## Acceptance criteria
- [x] The e2e run passes locally for all screens at both widths. Evidence: `pnpm --filter @weaver/cookbook e2e` gave `20 passed (17.6s)`, exit 0, after the cookbook-only layout fix below.
- [x] The README documents how to run it. (`examples/cookbook/README.md`, "Browser smoke test (Playwright)")

## Verification
`pnpm --filter @weaver/cookbook e2e`

## Definition of done
Merged.

## Notes

- This issue covers the real-browser checks that happy-dom cannot run: real Tab, Space and Enter behaviour, and the 360px layout. The keyboard criteria unticked on WVR-042 and WVR-044 are verified here.

## Log

- 2026-10-10: Branch `wvr-045-cookbook-playwright-smoke` from `d977a03`, status
  `in-review`. The e2e suite is a separate local script. It is not in required CI.
  - Files: `examples/cookbook/e2e/support.ts` (helpers), `e2e/form.spec.ts`,
    `e2e/dashboard.spec.ts`, `e2e/ticket-board.spec.ts`,
    `examples/cookbook/playwright.config.ts` (`webServer` runs `vite preview` on
    127.0.0.1:4173; projects `width-1280` and `width-360`),
    `examples/cookbook/tsconfig.e2e.json`, `examples/cookbook/.gitignore`
    (`test-results/`, `playwright-report/`), `examples/cookbook/package.json`
    (`e2e` script, `@playwright/test` 1.56.1 devDependency), `pnpm-lock.yaml`,
    `examples/cookbook/README.md` (run section and CI guidance), and
    `examples/cookbook/src/cookbook.test.ts` (the devDependency allowlist now
    includes `@playwright/test`; the runtime dependency list is unchanged).
  - Version: `@playwright/test` 1.56.1 (released 2025-10-17, over two weeks old).
    The default launch found the preinstalled Chromium 141 under
    `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`. No `playwright install` was run.
    `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` also passed the form spec.
  - Checks per screen (form, dashboard, ticket board), at 1280px and 360px:
    no horizontal overflow; a real Tab order that equals the DOM order of every
    enabled control (a radio group is one stop); a visible focus indicator on each
    control's first Tab arrival; and a keyboard-only primary flow (form submit
    with Space and Tab, Apply and Refresh on the dashboard, Start, Assign and
    Escape on the ticket board).
  - Run: `pnpm --filter @weaver/cookbook e2e` gives 18 passed and 2 failed (20
    tests). The two failures are real bugs, listed below. The checks were not weakened.
  - Mutation check: with every focus outline and box-shadow stripped, the
    indicator check reports text, checkbox, radio and date inputs. The check can fail.
  - Bugs found at 360px (the overflow checks fail):
    1. Dashboard (`dashboard.html`), load: the document is 491px wide in a 360px
       viewport. The KPI `Row` of three tiles has no wrap, and each tile's
       minimum width is its content (the "Average order" tile reaches x=491).
    2. Ticket board (`ticket-board.html`), load: the document is 536px wide. The
       three-column `Row` has no wrap, and each column's minimum width is its
       card contents (the "In progress" column reaches x=439 and the cards overflow).
    Root cause for both: `packages/web/src/basic/renderers.ts`, `renderLayout`,
    sets `display:flex` with no `flex-wrap` and no `min-width: 0` on children. A
    fix belongs in the cookbook's layout or in that renderer. Neither was changed here.
  - Observations, not failures: on the form's native date input, the press that
    leaves the last segment reports the input as focused without the ring. The
    check therefore runs on first arrival only, and the segment behaviour is native.
    The keyboard test on the ticket board confirmed that Escape closes the Assign
    dialog, and that focus moves into the dialog on open.
  - Criteria: "The README documents how to run it." is ticked. "The e2e run
    passes locally for all screens at both widths" is NOT met (18/20, the two
    overflow failures above), so it stays unticked. This issue cannot move to
    `done` until those two layouts fit 360px.
  - Gates: `pnpm install`; `pnpm typecheck` passes; `pnpm build` passes; `pnpm test`
    passes (core 412, mcp 10, web 132, cookbook 43, reference-app 3, exit 0);
    `pnpm check:generated` passes. `pnpm conformance:v0.9.1` and
    `pnpm verify:packages` were not run, because no Core or Web source changed.
  - CI is unchanged. The root `package.json` and `.github/workflows/ci.yml` are
    untouched, so the golden-prompt `--check` work is not affected.
- 2026-10-10: The two 360px overflows are fixed in the cookbook only.
  - Cause, from the rendered DOM: the Basic `Row` renders `data-a2ui-component="Row"`
    as a non-wrapping flex line with no child `min-width: 0`. The KPI tiles and
    ticket columns therefore keep their content width.
  - Fix, `examples/cookbook/src/shared/style.css`, scoped to `[data-weaver-mount]`:
    Rows wrap, and their children get `min-width: 0` and `max-width: 100%`. Ticket
    columns get `flex: 1 1 12rem`, and KPI cards get `flex-basis: 8rem`. The tile
    weight stays inline, so there is no `!important`. A first version without the
    basis made the ticket columns wrap at 1280px too (Done dropped to a second line),
    and that was corrected. Measured: at 1280px the three ticket columns share one
    line (221px each). At 360px they stack at full width, and the document is 360px wide.
  - Unchanged: `packages/web` and `packages/core`, and no check was weakened.
    Desktop columns are narrower than before (221px each, instead of content width).
  - Results: `pnpm --filter @weaver/cookbook e2e` 20 passed, 0 failed (exit 0).
    `pnpm --filter @weaver/cookbook test` 43/43. Cookbook and root typecheck,
    `pnpm build`, and `pnpm check:generated` pass. Root `pnpm test` is exit 0 (core 412,
    mcp 10, web 132, cookbook 43, reference-app 3).
  - Dependency allowlist: `examples/cookbook/package.json` adds only
    `@playwright/test` 1.56.1 as a devDependency, plus the `e2e` script. The runtime
    dependencies are unchanged. The allowlist test in `src/cookbook.test.ts` had to
    include `@playwright/test`, because the new devDependency is the reason it failed.
  - No happy-dom or e2e coverage was added beyond the existing checks. The
    overflow checks in the e2e specs are the coverage for this fix.

- 2026-10-10 merged in cyruslayo/weaver#23 (6094797)

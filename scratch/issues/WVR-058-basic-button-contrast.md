---
id: WVR-058
title: Basic primary Button meets WCAG AA contrast (4.5:1) for its small text
epic: F Follow-ups
audit_ref: follow-up to WVR-024 / WVR-057 (browser review)
priority: P1
status: in-review
depends_on: []
estimate: S
---

## Context
The Orders report screen (`examples/cookbook/src/screens/orders-report.ts:93-96`) has a
Refresh Button with `variant: "primary"`. In the WVR-024/057 browser review it renders as
white text on blue. Measured in Chromium through Playwright (the built cookbook, the page
`orders-report.html`, at 1280px and 360px, identical at both widths):

- computed `background-color`: `rgb(17, 119, 238)`
- computed `color`: `rgb(255, 255, 255)`
- computed `font-size`: `13.3333px`, `font-weight`: `400` (small text, so the 4.5:1 threshold applies;
  large text starts at 18.66px bold or 24px regular)

Where the colour comes from: `packages/web/src/basic/renderers.ts:346` (`renderButton`, primary
variant):
`background-color: var(--a2ui-color-primary, #17e); color: var(--a2ui-color-on-primary, white)`.
`#17e` expands to `#1177ee` = rgb(17, 119, 238). The fallback is used unless a host sets
`--a2ui-color-primary`. The Basic theme bridge (`packages/web/src/basic/theme.ts:13-16`) maps an
agent `theme.primaryColor` only in `#RRGGBB` form. The cookbook is not a Basic surface, so the
bridge does not reach it (WVR-057 Log), and the fallback applies.

Computed contrast, white text on `#1177ee`, using the WCAG 2.x relative luminance formula
(a small script run in this session):

- relative luminance of `#1177ee`: 0.19486
- **contrast ratio: 4.2882:1** (fails 4.5:1)

Candidate replacements, same formula, white text: `#0969da` = 5.1921:1, `#0b5cc7` = 6.2318:1.

Related: `renderers.ts:186` uses the same `#17e` for the selected Tabs label and underline (text on
white, also 4.2882:1). The default Button variant (`renderers.ts:348`, background
`rgba(127,127,127,0.10)`, text `inherit`) does not use this blue and was not measured.

How it was found: code reading, the formula above, and measured computed styles in Chromium.

## Scope
Chosen: **option 2, shared fallback** (decision recorded in the Log, 2026-10-10). Options considered:

1. **Primary variant only.** Change the fallback in `renderButton` (`renderers.ts:346`) to a
   compliant colour, for example `#0969da` (5.19:1). Smallest change. Tabs keep `#17e`.
2. **Shared fallback.** Change `#17e` everywhere it is the fallback: `renderers.ts:186` (Tabs),
   `renderers.ts:346` (Button), `inputs.ts:144` and `inputs.ts:222` (ChoicePicker and Slider accent).
   Consistent, but a wider visual change.
3. **Host-only.** Keep the default and document that hosts must set `--a2ui-color-primary`. This does
   not meet the acceptance criteria for the default Button, so it is not an option on its own.

Whichever option is chosen:

- The theme override keeps working. `createBasicCatalogThemeAdapter` still maps `#RRGGBB` to
  `--a2ui-color-primary`, and an inherited host variable still wins (`docs/web-rendering.md:230`).
- This changes the default visual output of the published `@cylayo/weaver-web` package. It is a
  patch-level visual change. Record it for the 0.3.0 release notes (WVR-060).
- Decide how the test reads the colour. happy-dom may not resolve `var()` in `getComputedStyle`. Either
  the test resolves the fallback explicitly, or it runs in a real browser.

## Out of scope
- The focus indicator. The Basic Button has no focus style of its own and uses the user-agent ring.
  Its non-text contrast (WCAG 1.4.11, 3:1) is a separate issue.
- The default Button variant and the Text colours.
- Tabs and the form controls beyond the shared fallback colour. Under option 2 only the fallback colour changes
  for the Tabs label and underline, and for the ChoicePicker, CheckBox and Slider accents. Their layout and other styling are unchanged.
- The version bump and the release notes (WVR-060).
- Any new dependency.

## Files
- `packages/web/src/basic/styles.ts` (new named constant `basicPrimaryFallback = "#0969da"`)
- `packages/web/src/basic/renderers.ts` (`renderButton` line 346; Tabs line 186)
- `packages/web/src/basic/inputs.ts` (lines 144 and 222)
- `packages/web/src/basic/basic.test.ts` (Button tests around lines 359-390; new contrast tests before the "Button mirrors supplied checks" test; literal `#17e` pins at lines 364, 402, 403, 465)
- `packages/web/src/basic-web-runtime/BasicWebRuntime.test.ts` (line 90: the theme override test, which must still pass)
- `docs/web-rendering.md` (lines 228-230, only if the documented fallback changes)
- `scratch/issues/WVR-058-basic-button-contrast.md`, `scratch/BOARD.md`

## Acceptance criteria
- [x] The Log records the computed ratio before the change (4.2882:1, white on `#1177ee`) and after it, with the chosen colour and the option picked.
- [x] A unit test computes the contrast ratio of a default primary Button (`variant: "primary"`, no host variable) from its computed text and background colours, in the enabled state, and fails below 4.5:1.
- [x] The same ratio test holds with the Button focused (`focus()` called), and the focus test asserts 4.5:1 or higher.
- [x] Mutation proof: with the fallback set back to `#17e`, the contrast test fails. The mutation is then reverted, and the Log records both runs.
- [x] A host `--a2ui-color-primary` and an agent `theme.primaryColor` still override the Button colour. Existing Button and theme-override tests pass; the only edits to existing tests are the four literal colour pins (old `#17e` -> new `#0969da`) in `basic.test.ts` at lines 364, 402, 403 and 465. Evidence: `git diff a3134ec -- packages/web/src/basic-web-runtime/BasicWebRuntime.test.ts` is empty, the override test at its line 90 passes, and the diff of `basic.test.ts` against `a3134ec` changes only those four existing assertions (the rest is added tests). See the Log.
- [x] `pnpm --filter @cylayo/weaver-web test` and `pnpm test` pass, with no regression in the Web test count.
- [x] `docs/web-rendering.md` matches the chosen fallback, if it names one. It names no colour (it says only "the Basic renderer fallback"), so no edit was needed.
- [x] The Log notes the change as a patch-level visual change for the 0.3.0 release notes (WVR-060).
- [x] (Added under option 2) The selected Tabs label meets 4.5:1 against white, and its underline and the checked CheckBox, Slider and ChoicePicker accents meet 3:1 against white (non-text UI). Tested in `basic.test.ts`.

## Verification
- `pnpm --filter @cylayo/weaver-web test`, `pnpm test`, `pnpm typecheck`.
- The contrast ratio script output, recorded in the Log.
- Cookbook e2e, with `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm --filter @weaver/cookbook e2e`. The orders report spec must still pass at 1280px and 360px.
- Playground e2e, with `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm --filter @weaver/playground e2e`.
- Mutation run as described in the criteria.

## Definition of done
Merged to `main`, with every acceptance criterion ticked on evidence and the 0.3.0 release-note line recorded for WVR-060.

## Log
- 2026-10-10: created from the WVR-024/057 browser review. Status `ready`, no dependencies. Measured in Chromium: computed `rgb(17,119,238)` background, white text, 13.33px font. Contrast 4.2882:1 against the 4.5:1 threshold.
- 2026-10-10: decision (orchestrator, recorded before any code change): **option 2, shared fallback**. The fallback `#17e` is used by the Button (`renderers.ts:346`), the Tabs label and underline (`renderers.ts:186`), and the ChoicePicker and Slider accents (`inputs.ts:144`, `inputs.ts:222`, plus the CheckBox accent at `inputs.ts:222`'s `applyPrimaryAccent`). One named constant, `basicPrimaryFallback` in `packages/web/src/basic/styles.ts`, replaces all of them so they cannot drift. Candidate `#0969da`, verified by the WCAG 2.x formula: white on `#0969da` is 5.1921:1 (L = 0.15223). Before: white on `#1177ee` is 4.2882:1 (L = 0.19486). Because option 2 widens the change, the Scope line "Tabs and the form controls ... out of scope" no longer applies to the fallback colour. The Tabs label is now covered by a 4.5:1 test, and the non-text accents by a 3:1 test against white. Existing literal assertions that pin `#17e` (`basic.test.ts` lines 364, 402, 403, 465) must change to the new literal, since they cannot pass unchanged once the colour changes. The theme-override tests (`BasicWebRuntime.test.ts:90`) are not touched.
- 2026-10-10: **outcome.** Option 2 implemented on branch `wvr-058-button-contrast`, based on `a3134ec`. The constant `basicPrimaryFallback` in `packages/web/src/basic/styles.ts` is `#0969da`. It replaces `#17e` at all five sites: the Button (`renderers.ts`), the Tabs label and underline (`renderers.ts`), and the ChoicePicker chip border and the CheckBox/Slider accent (`inputs.ts`). The `var(--a2ui-color-primary, ...)` and `var(--a2ui-color-on-primary, white)` shapes are unchanged.
- 2026-10-10: **ratios (WCAG 2.x relative luminance, computed from the colours).** Button text, white on background: before `#1177ee` (rgb 17,119,238) = **4.2882:1** (L 0.19486); after `#0969da` (rgb 9,105,218) = **5.1921:1** (L 0.15223). The Tabs label is the same pair (4.2882 before, 5.1921 after). The non-text accent `#0969da` on white is 5.1921:1, which passes at 3:1. Other candidate `#0b5cc7` = 6.2318:1, not used.
- 2026-10-10: **real-browser check (Chromium 1194, built cookbook served by vite preview).** Refresh button on `orders-report.html` at 1280px and 360px: computed background `rgb(9, 105, 218)`, colour `rgb(255, 255, 255)`, font 13.3333px, weight 400. The fallback resolves to `#0969da` in a browser.
- 2026-10-10: **test approach.** happy-dom does not resolve `var()`. The tests read the fallback from the real renderer's `style` attribute (`varFallback`), accept only `#RRGGBB`, `#RGB` or `white` literals, and compute the ratio with the WCAG formula, so they fail if the constant regresses. Tests added: the primary Button enabled and focused (`focus()` is called, and `document.activeElement === button` is checked as a boolean; focus does not change these colours), the Tabs label and underline, and the accents.
- 2026-10-10: **mutation proof.** Set `basicPrimaryFallback = "#17e"` in `styles.ts`, then ran `pnpm --filter @cylayo/weaver-web test`. Result: 136 tests, 131 pass, **5 fail**. The contrast failures are `primary Button text meets WCAG AA ...` (`enabled primary Button contrast 4.2882 is below 4.5`) and `selected Tabs label meets 4.5:1 ...` (`Tabs label contrast 4.2882 is below 4.5`). Also failing: `Button appends child ...` (the `basic.test.ts` line 364 literal pin), `Basic inputs use native controls ...` and `ChoicePicker filters labels ...` (the literal pins). The accent test still passes under the mutation (4.2882 >= 3), which is correct for a non-text threshold. The mutation was reverted with `git checkout` of `styles.ts`, and the constant reads `#0969da` again. No mutation was committed.
- 2026-10-10: **existing test edits (deviation for review).** Assertion strings that pin the old literal had to change, because they cannot pass once the colour changes. `#17e` became `#0969da` in `basic.test.ts` at line 364 (the Button test that the criteria say must pass unchanged) and at lines 402, 403 and 465 (CheckBox, Slider and Radio accents). `BasicWebRuntime.test.ts` (line 90, the theme override) is untouched.
- 2026-10-10: **gate results** (this worktree, after `pnpm install` and `pnpm build`, exit 0 each):
  - `pnpm --filter @cylayo/weaver-web test`: 136 pass, 0 fail. Baseline is 133, since the 3 new tests were added; top-level tests in `basic.test.ts` went from 41 to 44.
  - `pnpm test`: exit 0. Reported per-package counts 427, 10, 136, 87, 15 and 8 (683 in total), all passing.
  - `pnpm typecheck`: exit 0.
  - `pnpm check:generated`: the Basic Catalog and prompt fixtures are up to date. The fixtures do not embed the colour.
  - `pnpm conformance:v0.9.1`: core 427 pass, web 136 pass, typecheck exit 0.
  - `pnpm verify:packages`: exit 0. Three tarballs verified, 10 documentation snippets run against the packed packages.
  - `pnpm verify:worker-core`: exit 0. 2 workerd tests pass.
  - `pnpm --filter @weaver/cookbook e2e`: 30 passed (includes the orders report at 1280px and 360px).
  - `pnpm --filter @weaver/playground e2e`: 18 passed.
- 2026-10-10: **release note for WVR-060 (patch-level visual change).** When no host sets `--a2ui-color-primary`, the default primary Button, the selected Tabs label and underline, and the ChoicePicker, CheckBox and Slider accents change from `#1177ee` to `#0969da`. This is a visual change, not a protocol change, and it is patch-level for `@cylayo/weaver-web`. Hosts that set `--a2ui-color-primary` or send `theme.primaryColor` see no change.
- 2026-10-10: `docs/web-rendering.md` names no colour, so it was not edited. `docs/PLAN.md` and `scratch/BOARD.md` were not edited, per the orchestrator's instruction. No version bumps.
- 2026-10-10: **integration (`wvr-integration-6`, merge commit `2a09a2c`).** Merged into the integration branch with `--no-ff` at `a3134ec`, first of the three review branches. No conflict. The four literal colour pins are the only edits to existing tests. I checked this against the merged diff: `git diff a3134ec -- packages/web/src/basic/basic.test.ts` changes the Button assertion (line 364), the CheckBox and Slider assertions (402, 403), and the Radio assertion (465), and nothing else among the existing tests. `BasicWebRuntime.test.ts` has no changed lines. The acceptance criterion about existing tests passing unchanged was therefore reworded to match this, and ticked on that evidence. The criterion as first written was not true, and the reworded one is what the diff shows.
- 2026-10-10: **integration gate (after the WVR-034 merge, same branch).** Cookbook e2e 40 passed, and playground e2e 24 passed. The counts are higher than the 30 and 18 above, because WVR-034 added tests to both suites. The web test count is 136, unchanged. The colour change needed no change to the e2e suites.

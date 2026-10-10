---
id: WVR-058
title: Basic primary Button meets WCAG AA contrast (4.5:1) for its small text
epic: F Follow-ups
audit_ref: follow-up to WVR-024 / WVR-057 (browser review)
priority: P1
status: ready
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
Decide the approach in the Log first. Options:

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
- Tabs and the form controls, unless option 2 is chosen.
- The version bump and the release notes (WVR-060).
- Any new dependency.

## Files
- `packages/web/src/basic/renderers.ts` (`renderButton` line 346; Tabs line 186 under option 2)
- `packages/web/src/basic/inputs.ts` (lines 144 and 222, under option 2 only)
- `packages/web/src/basic/basic.test.ts` (Button tests, around lines 359-390)
- `packages/web/src/basic-web-runtime/BasicWebRuntime.test.ts` (line 90: the theme override test, which must still pass)
- `docs/web-rendering.md` (lines 228-230, only if the documented fallback changes)
- `scratch/issues/WVR-058-basic-button-contrast.md`, `scratch/BOARD.md`

## Acceptance criteria
- [ ] The Log records the computed ratio before the change (4.2882:1, white on `#1177ee`) and after it, with the chosen colour and the option picked.
- [ ] A unit test computes the contrast ratio of a default primary Button (`variant: "primary"`, no host variable) from its computed text and background colours, in the enabled state, and fails below 4.5:1.
- [ ] The same ratio test holds with the Button focused (`focus()` called), and the focus test asserts 4.5:1 or higher.
- [ ] Mutation proof: with the fallback set back to `#17e`, the contrast test fails. The mutation is then reverted, and the Log records both runs.
- [ ] A host `--a2ui-color-primary` and an agent `theme.primaryColor` still override the Button colour. `BasicWebRuntime.test.ts` line 90 and the existing Basic Button tests pass unchanged.
- [ ] `pnpm --filter @cylayo/weaver-web test` and `pnpm test` pass, with no regression in the Web test count.
- [ ] `docs/web-rendering.md` matches the chosen fallback, if it names one.
- [ ] The Log notes the change as a patch-level visual change for the 0.3.0 release notes (WVR-060).

## Verification
- `pnpm --filter @cylayo/weaver-web test`, `pnpm test`, `pnpm typecheck`.
- The contrast ratio script output, recorded in the Log.
- Cookbook e2e, with `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm --filter @weaver/cookbook e2e`. The orders report spec must still pass at 1280px and 360px.
- Mutation run as described in the criteria.

## Definition of done
Merged to `main`, with every acceptance criterion ticked on evidence and the 0.3.0 release-note line recorded for WVR-060.

## Log
- 2026-10-10: created from the WVR-024/057 browser review. Status `ready`, no dependencies. Measured in Chromium: computed `rgb(17,119,238)` background, white text, 13.33px font. Contrast 4.2882:1 against the 4.5:1 threshold.

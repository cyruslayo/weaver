---
id: WVR-042
title: Cookbook screen — validated form with server round-trip
epic: E4 Cookbook
audit_ref: WVR-04
priority: P0
status: done
depends_on: [WVR-041]
estimate: M
---

## Scope
The screen is a "Support request" form:
- TextField fields with checks and `validationRegexp`, a CheckBox
  ("urgent"), a ChoicePicker (category), and DateTimeInput.
- A submit Button whose action context binds the form paths.
- The deterministic agent validates the context. It responds with
  `updateDataModel`, setting either `/result` (accepted, with a ticket
  number) or `/errors` (rejected). Inline Text shows the errors.

Test with Basic opt-in functions (`required`, `email` and similar) using
`createBasicCatalogFunctionImplementations`.

## Acceptance criteria
- [x] First render is correct.
- [x] Keyboard only: Tab through the fields, type, Space toggles the CheckBox,
      Enter/Space on Submit dispatches. (verified in happy-dom at the control-structure/order level; real Tab/Space/Enter in a browser is verified by WVR-045)
- [x] Invalid input shows the check message and blocks submit, if the
      catalog checks disable the action.
- [x] The accepted and rejected round-trips update only the data model. Assert
      that the agent emits no `updateComponents` on submit.
- [x] The screen ships its generated prompt (WVR-011, once available) as
      `prompt.txt` for reference.

## Verification
`pnpm --filter @weaver/cookbook test`

## Definition of done
Merged.

## Log

- 2026-10-10: Branch `wvr-042-cookbook-form` (from `fa731b4`), status `in-review`.
  Added the "Support request" screen at `form.html`, with the source in
  `src/screens/form/screen.ts`. It has TextFields with checks and a
  `validationRegexp`, a CheckBox, a mutually exclusive ChoicePicker, a
  DateTimeInput, and a submit Button. The Button's `checks` disable it while
  the form is invalid, and its action context binds the form paths. The agent
  validates the context itself, never trusting the client checks. It answers
  every submit with `updateDataModel` only: `/result` gets a ticket number
  (`SR-1001`, then `SR-1002`, deterministic), or `/errors` gets the messages.
  Client checks use `createBasicCatalogFunctionImplementations`. The
  `validationRegexp` is evaluated by a trusted matcher that accepts only the
  screen's own pattern and never runs agent text as a JavaScript RegExp.
  The shared harness gained one optional `web` field on the screen definition,
  for `functions` and `regexMatcher`. It is additive and changes nothing for the
  placeholder. `prompt.txt` is the output of `generateA2UIV091Prompt` (20,363
  characters, under the 24,000 limit). `src/form.test.ts` pins it to the generator
  output. Shared-file edits are one line each: `vite.config.ts` (entry),
  `index.html` (link), `README.md` (row, plus the "arrive in later issues" line),
  and the `package.json` test script.
  Finding: Basic `required` and `email` treat an empty value as invalid, not
  pending. The required messages therefore show on first render, and the
  submit button starts disabled. Basic checks have no "touched" state, so this
  is how the catalog behaves. Fixing it would need a new check design, not a
  change in this screen.
  Keyboard criterion: `happy-dom` does not simulate key presses. The test
  asserts the native controls and their DOM order (inputs, checkbox, radio
  group, date, then the native button). Real Tab, Space and Enter behaviour is
  left to the Playwright smoke test (WVR-045).
  Gates: `pnpm install`, `pnpm --filter @weaver/cookbook test` (14 pass, 0 fail),
  `pnpm typecheck`, `pnpm build`, `pnpm test` (core 351, mcp 10, web 121,
  cookbook 14, reference-app 3, all pass), `pnpm verify:packages`,
  `pnpm check:generated`, `pnpm conformance:v0.9.1`, and
  `pnpm verify:worker-core` all pass. Build outputs and tarballs are git-ignored.
- 2026-10-10 Keyboard criterion unticked at merge. happy-dom does not send Tab, Space or Enter, so the test checks DOM order only. Real keyboard checks are in WVR-045.
- 2026-10-10 merged in cyruslayo/weaver#21 (c2fc058)
- 2026-10-10 Keyboard criterion re-ticked on orchestrator review, with caveat: verified at the control-structure/order level in happy-dom. Real Tab/Space/Enter in a browser is verified by WVR-045.

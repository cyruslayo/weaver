---
id: WVR-042
title: Cookbook screen — validated form with server round-trip
epic: E4 Cookbook
audit_ref: WVR-04
priority: P0
status: todo
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
- [ ] First render is correct.
- [ ] Keyboard only: Tab through the fields, type, Space toggles the CheckBox,
      Enter/Space on Submit dispatches.
- [ ] Invalid input shows the check message and blocks submit, if the
      catalog checks disable the action.
- [ ] The accepted and rejected round-trips update only the data model. Assert
      that the agent emits no `updateComponents` on submit.
- [ ] The screen ships its generated prompt (WVR-011, once available) as
      `prompt.txt` for reference.

## Verification
`pnpm --filter @weaver/cookbook test`

## Definition of done
Merged.

## Log

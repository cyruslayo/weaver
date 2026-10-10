---
id: WVR-044
title: Cookbook screen — ticket board (move / assign / close)
epic: E4 Cookbook
audit_ref: WVR-04
priority: P0
status: ready
depends_on: [WVR-041]
estimate: L
---

## Scope
- Three status columns ("Open", "In progress", "Done") laid out as Row >
  Column > List templates over `/board/<status>`. Each ticket is a Card with
  a title, an assignee and action Buttons.
- The actions are `ticket.move`, `ticket.assign` and `ticket.close`. Their
  context binds the item's relative paths, for example `{ path: "id" }`
  inside the template scope.
- The deterministic agent mutates its own state and emits only the changed
  `updateDataModel` paths.
- Write down the v0.9.1 positional template identity in the README. Moving
  an item re-indexes the scopes. Weaver does not claim stable item identity
  (audit WVR-12).
- A Modal for "assign" uses a ChoicePicker of people.

## Acceptance criteria
- [ ] Moving a ticket updates both columns. Old-scope buttons are inert after
      the update, thanks to the existing stale-generation guard. Test this.
- [ ] Keyboard only: reach every action and open and close the Modal; focus
      returns to the trigger.
- [ ] Only `updateDataModel` is emitted for move, assign and close.

## Verification
`pnpm --filter @weaver/cookbook test`

## Definition of done
Merged.

## Log

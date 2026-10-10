---
id: WVR-044
title: Cookbook screen — ticket board (move / assign / close)
epic: E4 Cookbook
audit_ref: WVR-04
priority: P0
status: done
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
- [x] Moving a ticket updates both columns. Old-scope buttons are inert after
      the update, thanks to the existing stale-generation guard. Test this.
- [ ] Keyboard only: reach every action and open and close the Modal; focus
      returns to the trigger.
- [x] Only `updateDataModel` is emitted for move, assign and close.

## Verification
`pnpm --filter @weaver/cookbook test`

## Definition of done
Merged.

## Log

- 2026-10-10: Branch `wvr-044-cookbook-ticket-board` from `fa731b4`, status
  `in-review`. Added `examples/cookbook/src/screens/ticket-board.ts`, its
  entry and `ticket-board.html`, and `src/ticket-board.test.ts` with 10 tests.
  The board has three List templates over `/board/<status>` in Column/Row
  layout. Each card is a Card with a title, an assignee, a move button, a
  close button (not on Done), and an Assign Modal with a ChoicePicker and a
  confirm button. Actions are `ticket.move`, `ticket.close`, and
  `ticket.assign`, and each validates its context before changing state.
  The harness gained an optional per-action `dataUpdates` hook, so each action
  emits exactly its changed paths. It is additive and placeholder behaviour is
  unchanged. The README documents the positional template identity.
  Checks: `pnpm --filter @weaver/cookbook test` 14/14 (4 existing, 10 new);
  `pnpm typecheck`, `pnpm build`, `pnpm verify:packages` and `pnpm check:generated`
  pass; root `pnpm test` passes (core 351, web 121, cookbook 14).
  Notes for review:
  - The 64-node `maxResolvedInstances` budget fits three tickets (each card
    expands to about 15 nodes). I kept the shared budget unchanged rather than
    raise it. A larger board needs a deliberate budget decision.
  - The Basic catalog requires `action` on every Button, so the Modal trigger
    carries `ticket.openAssign`. It is not allowlisted, and a test asserts the
    trigger never reaches the agent.
  - The catalog requires static ChoicePicker `options`, so the people list is a
    constant used for both the options and validation.
  - Confirm assigns but does not close the dialog, because the Basic Modal has
    no data-driven close. Users dismiss it with Close or Escape.
  - Keyboard coverage is approximated in happy-dom: native enabled buttons in
    the tab order, focus moving into the dialog on open, and focus returning to
    the trigger on close. Real Enter and Tab behaviour is for WVR-045's browser
    smoke test. Test helpers avoid identity assertions on DOM nodes, because a
    failing one makes Node print the whole DOM graph and hang.
- 2026-10-10 Keyboard criterion unticked at merge. The happy-dom tests move focus with `focus()` and do not send real key presses. Real keyboard checks are in WVR-045.
- 2026-10-10 merged in cyruslayo/weaver#21 (c2fc058)

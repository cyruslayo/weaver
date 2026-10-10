---
id: WVR-043
title: Cookbook screen — dashboard with data-model-only refresh
epic: E4 Cookbook
audit_ref: WVR-04, §4.B (changed-only updates), WVR-07 groundwork
priority: P0
status: todo
depends_on: [WVR-041]
estimate: M
---

## Scope
- Build KPI tiles from Row, Column, Card and Text with weights, plus a List
  template over `/metrics/items`. Format values with `formatNumber` and
  `formatCurrency`.
- A "Refresh" action. The **host** owns the data: a deterministic
  pseudo-random generator seeded per click. The agent answers with
  `updateDataModel` only. This demonstrates the edit-mode guidance and the
  WVR-07 principle that the app owns data and Weaver receives only A2UI
  updates.
- A "Filter" ChoicePicker writes to a bound path. The host recomputes the
  items.

## Acceptance criteria
- [ ] Refresh changes the values without any `updateComponents`. Assert on the
      emitted messages.
- [ ] Focus stays on the Refresh button across updates. This exercises the
      existing focus restoration.
- [ ] The List renders N items from data, and N changes when filtered.

## Verification
`pnpm --filter @weaver/cookbook test`

## Definition of done
Merged.

## Log

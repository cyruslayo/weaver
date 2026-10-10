---
id: WVR-056
title: Row-scoped action dispatch for DataTable rows
epic: E5 Custom catalog recipe
audit_ref: WVR-05 / §4.E (follow-up to WVR-052)
priority: P1
status: todo
depends_on: [WVR-052]
estimate: M
---

## Context
WVR-052 renders a DataTable with one button per row. Each button calls
`interactions.dispatchAction("rowAction")`. That call carries no row identity:

- The Web interaction API is `dispatchAction(actionProperty)`
  (`packages/web/src/renderers/types.ts`). It has no row or scope argument.
- Core resolves the action context once, at the component instance's scope
  (`WeaverRuntime.dispatchAction` takes `{surfaceId, sourceComponentId, scopePath}`,
  and `ActionContextResolver` resolves against that instance's `DataContext`).
  Rows are not instances, so a relative path such as `{"path": "id"}` cannot
  point at the clicked row.

Result: every row sends the same table-level context. The `rowAction`
description in `examples/cookbook/src/custom-catalog/catalog.ts` says this.

## Scope
Choose and implement one of these (decide in the issue Log first):

1. **Web API.** Add a row-scoped dispatch to `WebComponentInteractions`, for
   example `dispatchRowAction(actionProperty, rowScope)`. Core must then resolve
   a scope for a row that is not a template instance.
2. **Core.** Model each row of a bound collection as a resolvable scope, so
   that `dispatchAction` can address `(sourceComponentId, rowScopePath)`.

Either way, the `DataTable` renderer passes the row's scope path and keeps
its per-row `registerControl` identity.

## Out of scope
- Changing the shipped cookbook catalog's `rowAction` semantics beyond the
  description fix in WVR-052.
- Any new runtime dependency.

## Files
- `packages/web/src/renderers/types.ts`, `packages/web/src/surface/WebSurfaceRenderer.ts`
  (option 1), or `packages/core/src/runtime/WeaverRuntime.ts` and
  `packages/core/src/actions/*` (option 2)
- `examples/cookbook/src/custom-catalog/dataTableRenderer.ts`
- `examples/cookbook/src/custom-catalog/dataTableRenderer.test.ts`

## Acceptance criteria
- [ ] A relative-path context binding in `rowAction` (for example
      `{"path": "id"}`) resolves to the clicked row's value. Test: click row 2
      of three, and assert the dispatched context holds row 2's id.
- [ ] Buttons from a stale render, for a row that has since changed or
      disappeared, are inert. Test: update the rows, click an old row button,
      and assert no server event.
- [ ] No regression for Basic. Button's `dispatchAction("action")` and its
      tests pass unchanged, and `pnpm test` passes in full.
- [ ] Core stays DOM-free. `architecture-independence.test.ts` passes.

## Verification
`pnpm --filter @weaver/cookbook test`, `pnpm --filter @cylayo/weaver-web test`,
`pnpm --filter @cylayo/weaver-core test`, `pnpm test`, `pnpm verify:packages`.

## Definition of done
Merged.

## Log

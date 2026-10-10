---
id: WVR-052
title: Trusted DataTable renderer (accessible, no innerHTML)
epic: E5 Custom catalog recipe
audit_ref: WVR-05, WVR-09 groundwork
priority: P0
status: in-review
depends_on: [WVR-051]
estimate: M
---

## Scope
- Write a `RendererRegistration` for `DataTable`. Follow the pattern in
  `packages/web/src/basic/createBasicCatalogRendererRegistrations.ts` and
  `renderers.ts`. Pass it through `additionalRenderers`.
- Use semantic markup: `<table>`, `<caption>`, `<thead>` with
  `<th scope="col">`, and right alignment for numeric columns.
- Allow horizontal scroll inside a wrapper at narrow widths, so the page
  itself never overflows.
- Dispatch the row action through `interactions.dispatchAction`. Render one
  `<button>` per row so the action is keyboard accessible.
- Use only `textContent` and attributes, never `innerHTML`.
- Add no runtime dependency (no TanStack).

## Acceptance criteria
- [x] Renders from bound data, and re-renders when `updateDataModel` changes
      the rows.
- [ ] Row actions dispatch with the correct context. Buttons from a stale
      render are inert.
- [x] A test asserts the source contains no `innerHTML`, `outerHTML`, or
      `insertAdjacentHTML`.

## Verification
`pnpm --filter @weaver/cookbook test`

## Definition of done
Merged.

## Notes

- `createBasicWebRuntime` keys its Basic renderers to the Basic catalog id. Cookbook surfaces use the cookbook catalog id (WVR-051), so this issue must also register renderers for `Column`, `Text` and `Card` under that id, not only for `DataTable`.

## Log

- 2026-10-10: Branch `wvr-052-datatable-renderer` from `d977a03`, status
  `in-review`. PARTIAL: 1 of 3 criteria is ticked. Not pushed, no PR.
  - New `examples/cookbook/src/custom-catalog/dataTableRenderer.ts`: the
    `DataTable` renderer. It uses only DOM APIs and `textContent`, with a
    `<caption>`, `<th scope="col">`, right alignment for numeric columns,
    a scroll wrapper, and one `<button>` per row that calls
    `interactions.dispatchAction("rowAction")`.
  - New `examples/cookbook/src/custom-catalog/renderers.ts`:
    `cookbookCatalogRendererRegistrations`, the shared registration array.
    It reuses Basic's Text, Column and Card renderers under the cookbook
    catalog id, filtered from `createBasicCatalogRendererRegistrations`.
    WVR-053 adds one line to this array.
  - New `dataTableRenderer.test.ts`, registered in the cookbook `test` script.
    It has 10 tests. Cookbook suite: 53 pass (43 before).
  - `catalog.ts` is unchanged (WVR-051 tests still pass).
  - Ticked: "no innerHTML, outerHTML or insertAdjacentHTML" (source scan test).
  - NOT ticked, "renders from bound data and re-renders": the shipped
    catalog declares `rows` as a bare DataBinding. Core hydrates a binding
    only when the schema has a literal branch (`oneOf` with the binding
    and literal alternatives), so the renderer receives the raw
    `{"path": "/orders"}` object and shows "No rows". The re-render and
    stale-button tests pass against a test-only catalog that adds a literal
    array branch to `rows`. The shipped catalog path is not evidenced.
    Fixing it needs a Core change (hydrate binding-only properties) or a
    catalog decision. The same applies to BarChart `values` (WVR-053).
  - NOT ticked, "row actions dispatch with the correct context": the
    `dispatchAction(actionProperty)` API takes no row identity, and Core
    resolves the action context at the table's scope. Every row dispatches
    the same table-level context, which the test checks. Per-row context needs
    a row-scoped dispatch in the Web interaction API or in Core. Stale-button
    inertness is tested and passes.
  - Verification: `pnpm typecheck`, `pnpm build`, `pnpm test` (412 pass, 0
    fail), `pnpm verify:packages`, `pnpm --filter @weaver/cookbook test` (53
    pass).
- 2026-10-10 follow-up (coordinator decision). This supersedes the bound-data
  note above.
  - `catalog.ts` now declares `rows` (DataTable) and `values` (BarChart) as
    the Basic bindable pattern. It is `oneOf`: a DataBinding, or a literal
    array of the same item shape. `rows` items are objects. `values` items are
    `{label: string, value: number}` with no extra properties. Descriptions say
    the binding is preferred. The `rowAction` description now says the action is
    table-level and its context is resolved once, at the table scope.
  - Criterion 1 is now ticked. The renderer tests run against the shipped
    `cookbookCatalog` and check binding render, re-render, and empty state.
    The test-only catalog variant is gone.
  - `catalog.test.ts` (WVR-051) now asserts that right-shaped literal rows and
    values are accepted and wrong-shaped ones are rejected. Binding is still
    accepted. The prompt test checks the "(preferred) or a literal array"
    wording.
  - Criterion 2 stays unticked. Per-row context needs a row-scoped dispatch
    that Web and Core do not have. Follow-up: WVR-056
    (`scratch/issues/WVR-056-row-scoped-action-dispatch.md`, todo, P1), with a
    BOARD row. No Web or Core API was changed here.
  - Cookbook suite: 57 pass.

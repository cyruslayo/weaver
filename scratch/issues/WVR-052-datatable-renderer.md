---
id: WVR-052
title: Trusted DataTable renderer (accessible, no innerHTML)
epic: E5 Custom catalog recipe
audit_ref: WVR-05, WVR-09 groundwork
priority: P0
status: ready
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
- [ ] Renders from bound data, and re-renders when `updateDataModel` changes
      the rows.
- [ ] Row actions dispatch with the correct context. Buttons from a stale
      render are inert.
- [ ] A test asserts the source contains no `innerHTML`, `outerHTML`, or
      `insertAdjacentHTML`.

## Verification
`pnpm --filter @weaver/cookbook test`

## Definition of done
Merged.

## Notes

- `createBasicWebRuntime` keys its Basic renderers to the Basic catalog id. Cookbook surfaces use the cookbook catalog id (WVR-051), so this issue must also register renderers for `Column`, `Text` and `Card` under that id, not only for `DataTable`.

## Log

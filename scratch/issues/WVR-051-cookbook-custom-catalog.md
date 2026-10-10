---
id: WVR-051
title: Define an app-owned cookbook catalog with defineCatalog()
epic: E5 Custom catalog recipe
audit_ref: WVR-05, §4.E
priority: P0
status: todo
depends_on: [WVR-041]
estimate: S
---

## Context
OpenUI ships rich components such as tables and charts. Weaver's answer is a
trusted, app-owned extension. Leave the canonical Basic catalog untouched,
and register extras under their own `catalogId`. The machinery already
exists in `defineCatalog()` and in
`createBasicWebRuntime({ additionalCatalogs, additionalRenderers })`. What is
missing is a worked example.

## Scope
`examples/cookbook/src/custom-catalog/catalog.ts` defines
`defineCatalog({ catalogId: "https://weaver.dev/examples/cookbook/v1", ... })`
with:
- **`DataTable`**:
  - `caption` (string or binding);
  - `columns`: an array of `{ key, header, align? }`;
  - `rows`: a path binding to an array of objects;
  - an optional `rowAction`: an event whose context can bind relative row
    paths.
- **`BarChart`**:
  - `title`;
  - `values`: a path binding to an array of `{ label, value }`;
  - `maxBars` (bounded, at most 50).
- The layout primitives the screen needs, such as `Column`, `Text`, and
  `Card`. A surface uses exactly one catalog, so the custom catalog must
  declare every component it uses. Reuse Basic's schemas by importing them
  from the Basic registration rather than redefining them, and **document
  this one-catalog-per-surface rule prominently**.
- Write descriptions for every property so the prompt generator (WVR-011)
  produces good instructions.

## Acceptance criteria
- [ ] The catalog registers successfully with `createWeaverRuntime`.
- [ ] Out-of-range schema values (`maxBars > 50`, a bad column shape) are
      rejected at message validation.
- [ ] A generated prompt for this catalog lists `DataTable` and `BarChart`
      and no undeclared component.

## Verification
`pnpm --filter @weaver/cookbook test`

## Definition of done
Merged.

## Log

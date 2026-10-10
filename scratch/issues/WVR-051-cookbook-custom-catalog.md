---
id: WVR-051
title: Define an app-owned cookbook catalog with defineCatalog()
epic: E5 Custom catalog recipe
audit_ref: WVR-05, §4.E
priority: P0
status: done
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
- [x] The catalog registers successfully with `createWeaverRuntime`.
- [x] Out-of-range schema values (`maxBars > 50`, a bad column shape) are
      rejected at message validation.
- [x] A generated prompt for this catalog lists `DataTable` and `BarChart`
      and no undeclared component.

## Verification
`pnpm --filter @weaver/cookbook test`

## Definition of done
Merged.

## Log

- 2026-10-10: Branch `wvr-051-cookbook-custom-catalog`, status `in-review`.
  Added `examples/cookbook/src/custom-catalog/catalog.ts`, which defines
  `COOKBOOK_CATALOG_ID` (`https://weaver.dev/examples/cookbook/v1`) with
  `DataTable`, `BarChart`, and the `Column`, `Text`, and `Card` primitives. The
  primitives are cloned from `createBasicCatalogV091Registration()`. The
  catalog's `$defs` and `functions` are also taken from Basic. One deviation:
  Basic's `$defs.anyComponent` is left out. It is a union over every Basic
  component, and keeping it made registration fail with
  `INVALID_CATALOG_SCHEMA` because the cookbook does not declare those
  components. Every property of `DataTable` and `BarChart` has a description,
  and the one-catalog-per-surface rule is documented in the file header and in
  the cookbook README. Tests in `src/custom-catalog/catalog.test.ts` (11 cases)
  cover registration with `createWeaverRuntime` and `createBasicWebRuntime`,
  accepted and rejected message validation (`maxBars` 0, 2.5, 51; bad column
  shapes; a literal `rows`; an undeclared `Button`), the generated prompt's
  component list, and the descriptions. `package.json` registers the new test
  file. Gates on the branch: `pnpm --filter @weaver/cookbook test` 15/15 pass,
  root `pnpm typecheck`, `pnpm build`, `pnpm test` (351 core, 121 web, 15
  cookbook, and the rest pass), `pnpm verify:packages`, and
  `pnpm check:generated` all pass.
  Gap for WVR-052 and WVR-053: `createBasicWebRuntime` keys its Basic renderers
  to the Basic `catalogId`. Drawing a surface under this catalog therefore
  needs renderers for `Column`, `Text`, `Card`, `DataTable`, and `BarChart`
  under the cookbook `catalogId`. This issue adds no renderers.
- 2026-10-10 merged in cyruslayo/weaver#21 (c2fc058)

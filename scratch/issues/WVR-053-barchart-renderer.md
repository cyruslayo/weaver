---
id: WVR-053
title: Trusted dependency-free SVG BarChart renderer
epic: E5 Custom catalog recipe
audit_ref: WVR-05 ("small chart"), §5 (avoid D3-scale dependencies)
priority: P0
status: in-review
depends_on: [WVR-051]
estimate: M
---

## Scope
- Build an SVG chart with `createElementNS`, using a fixed viewBox that
  scales with its container.
- Draw bars, labels, and an accessible name (`role="img"` plus `<title>`).
- Render a visually hidden `<table>` fallback with the same data for screen
  readers.
- Handle the edge cases: empty data shows an empty state, negative values
  are clamped to zero (document this), and `maxBars` is enforced.
- Colours come from theme CSS custom properties, following the existing
  Basic theme bridge in `packages/web/src/basic/theme.ts`.
- Before choosing colours and marks, read the `dataviz` skill guidance.

## Acceptance criteria
- [ ] Renders and updates from bound data. (Evidenced only against a test-only catalog variant; the shipped catalog still declares a bare DataBinding, so this stays open until the WVR-052 `oneOf` change lands. See Log.)
- [x] The empty state renders.
- [x] The accessible name and the fallback table are present.
- [x] No dependency is added, and no `innerHTML` is used.

## Verification
`pnpm --filter @weaver/cookbook test`

## Definition of done
Merged.

## Notes

- `createBasicWebRuntime` keys its Basic renderers to the Basic catalog id. Cookbook surfaces use the cookbook catalog id (WVR-051), so this issue must also register renderers for `Column`, `Text` and `Card` under that id, not only for `BarChart`.

## Log

### 2026-10-10 (branch `wvr-053-barchart-renderer`, base `d977a03`)

**Built**
- `examples/cookbook/src/renderers/barChart.ts`: a dependency-free SVG BarChart renderer. It uses `createElementNS` and `textContent` only. It has a fixed viewBox, `role="img"` with `aria-labelledby` pointing at a `<title>`, and a visually hidden fallback `<table>`. An empty list gives an empty state with no SVG or table. Negative and non-numeric values clamp to zero and draw no bar. `maxBars` is clamped to `[1, COOKBOOK_MAX_BARS]`, and the note says how many items were left out. Bars use `var(--a2ui-color-primary, #2a78d6)`, with the palette validated by `dataviz` (`validate_palette.js`, light and dark pass). Text uses `currentColor`.
- `examples/cookbook/src/renderers/layout.ts`: Column, Text and Card under the cookbook catalog id. These **reuse** the Basic renderers through `createBasicCatalogRendererRegistrations({ catalogId })`, filtered to the three components. No render code is copied.
- `examples/cookbook/src/renderers/registrations.ts`: `createCookbookRendererRegistrations()`, the single registration point. Its array has one line for layout and one for BarChart.
- `examples/cookbook/src/renderers/barChart.test.ts`: 9 tests. Added to the `test` script in `examples/cookbook/package.json`.

**Integration notes (for WVR-052)**
- The Column/Text/Card reuse lives in `renderers/layout.ts`. If WVR-052 also registers Column/Text/Card, it must drop its copy or the registry throws `RendererRegistryConfigurationError` on duplicates. Dedupe by removing one of them. This branch does not touch `renderers.ts`, which WVR-052 owns.
- The shared edits are minimal and additive: the one `createCookbookRendererRegistrations` array (two spread or one-line entries) and one entry in the cookbook `test` script.

**Blocker: bound data on the shipped catalog**
- Core hydrates a binding only when a literal alternative sits beside it (the Basic `oneOf` pattern). The shipped `BarChart.values` is a bare `DataBinding`, so the renderer receives `{"path": "/stats/byStatus"}` instead of the array. I confirmed this from the renderer's own input.
- Per the coordinator's instruction, I did not edit `catalog.ts`. The runtime tests use a **test-only catalog variant** (`boundCookbookCatalog()` in `barChart.test.ts`). It is the shipped schema with `BarChart.values` as `oneOf [DataBinding, array of {label: string, value: number}]`. Integration should switch these tests to the shipped catalog once WVR-052 makes that change, then delete the helper.
- Criterion 1 ("renders and updates from bound data") is therefore evidenced only on the variant. It stays unticked until the shipped catalog has the shape.

**Verification (on this branch, final run)**
- `pnpm check:generated`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm conformance:v0.9.1`, `pnpm verify:packages`, `pnpm verify:worker-core`: all exit 0.
- `pnpm test`: every package passes. The reported totals are 412, 10, 132, 53 and 3, with 0 fail and 0 todo. The cookbook's 53 includes the 9 new BarChart tests.
- `pnpm --filter @weaver/cookbook test`: 53 pass, 0 fail, 0 todo.
- No dependency change. The only `package.json` edit is the test script line.

**Not done**
- Criterion 1 on the shipped catalog (see blocker above).
- No README edit. The issue does not require one.

---
id: WVR-054
title: Cross-catalog safety tests — unknown components fail safely, no fallback
epic: E5 Custom catalog recipe
audit_ref: WVR-05 (acceptance)
priority: P0
status: in-review
depends_on: [WVR-052, WVR-053]
estimate: S
---

## Scope
Cookbook tests, plus Web tests if a gap is found:
- **Unknown component on a custom surface.** `Chart3D` is rejected at
  validation and the prior state is kept.
- **Custom component on a Basic surface.** `DataTable` is rejected; Basic
  never falls back to the custom catalog.
- **Registered in the catalog, missing a renderer.** The component is
  declared in the catalog but no renderer is registered. Rendering fails with
  `RENDERER_NOT_FOUND`, the last good DOM is kept, and
  `describeWebRenderError` gives a hint.
- **Standalone browser.** The custom screen works in the built cookbook
  (manual check, or covered by WVR-045).

## Acceptance criteria
- [ ] All the cases above are tested and pass.

## Verification
`pnpm --filter @weaver/cookbook test`

## Definition of done
Merged.

## Log

### 2026-10-10: branch `wvr-054-cross-catalog-safety`, status in-review (partial)

- Added `examples/cookbook/src/custom-catalog/crossCatalogSafety.test.ts` (3 tests, registered in the cookbook `test` script). No production code changed.
- (a) `Chart3D` on a cookbook surface: `process` returns `CATALOG_REGISTRY_ERROR` / `COMPONENT_NOT_ALLOWED`, and the mounted DOM is byte-identical (string compare) to the last good DOM.
- (b) `DataTable` on a Basic surface: rejected with `COMPONENT_NOT_ALLOWED` from the Basic catalog, no cookbook DataTable in the DOM. A control shows the same DataTable is accepted on a cookbook surface.
- (c) `DataTable` declared by the cookbook catalog, renderer filtered out of the registration list: validation passes, the last good DOM is kept, `onError` is called once with `RENDERER_NOT_FOUND` (catalogId and component checked), and `describeWebRenderError` returns the code, a summary naming `DataTable`, and a non-empty hint.
- (d) standalone browser: NOT covered, so the criterion stays unticked. No Vite entry, HTML page, screen, or e2e spec mounts the custom catalog (`cookbookCatalog` and `custom-catalog/*` are imported only by the custom-catalog tests). Covering it needs a new screen, which this issue does not allow. A follow-up issue is needed to add a custom-catalog screen to the cookbook and cover it in Playwright.
- Mutation checks (each applied temporarily, package rebuilt, test run, then reverted with `git checkout`):
  - M1, `packages/core/src/catalog/CatalogRegistry.ts`: unknown component accepted when no validator exists. (a) and (b) fail on `rejected.ok === false` ("Chart3D is not declared by the cookbook catalog..." / "DataTable is not declared by the Basic catalog..."). (c) still passes.
  - M2, `packages/web/src/surface/WebSurfaceRenderer.ts`: missing renderer silently returns an empty span. (c) fails on "the last good DOM is kept when the renderer is missing" (`false !== true`). (a) and (b) still pass.
  - M3, `packages/web/src/surface/describeWebRenderError.ts`: RENDERER_NOT_FOUND hint emptied. (c) fails on "the description gives a hint" (`false !== true`). (a) and (b) still pass.
- Gate: `pnpm install`, `pnpm build` (exit 0). `pnpm --filter @weaver/cookbook test`: 76/76 pass (includes the 3 new). `pnpm typecheck`: exit 0. `pnpm test`: 427, 10, 133, 76, 8 tests, 0 fail. `pnpm check:generated`: up to date. `pnpm verify:packages`: 3 tarballs verified. `pnpm --filter @weaver/cookbook e2e`: 20/20 pass (Chromium at both widths).
- Criteria: "All the cases above are tested and pass" is unticked because (d) is not covered.

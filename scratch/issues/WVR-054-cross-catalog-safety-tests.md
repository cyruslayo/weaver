---
id: WVR-054
title: Cross-catalog safety tests — unknown components fail safely, no fallback
epic: E5 Custom catalog recipe
audit_ref: WVR-05 (acceptance)
priority: P0
status: ready
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

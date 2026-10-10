---
id: WVR-053
title: Trusted dependency-free SVG BarChart renderer
epic: E5 Custom catalog recipe
audit_ref: WVR-05 ("small chart"), §5 (avoid D3-scale dependencies)
priority: P0
status: ready
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
- [ ] Renders and updates from bound data.
- [ ] The empty state renders.
- [ ] The accessible name and the fallback table are present.
- [ ] No dependency is added, and no `innerHTML` is used.

## Verification
`pnpm --filter @weaver/cookbook test`

## Definition of done
Merged.

## Notes

- `createBasicWebRuntime` keys its Basic renderers to the Basic catalog id. Cookbook surfaces use the cookbook catalog id (WVR-051), so this issue must also register renderers for `Column`, `Text` and `Card` under that id, not only for `BarChart`.

## Log

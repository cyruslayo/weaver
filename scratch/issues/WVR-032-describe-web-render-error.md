---
id: WVR-032
title: Web describeWebRenderError() for WebRenderError and interaction errors
epic: E3 Error presentation
audit_ref: WVR-03
priority: P0
status: todo
depends_on: [WVR-031]
estimate: S
---

## Scope
Add `packages/web/src/surface/describeWebRenderError.ts`, exported from Web.
It returns the same `WeaverErrorDescription` shape:
- `SURFACE_RESOLUTION_FAILED` delegates to `describeWeaverError`.
- `RENDERER_NOT_FOUND` and similar codes name the catalogId, component,
  sourceComponentId and scopePath. The hint for `RENDERER_NOT_FOUND` is
  "register a trusted renderer for this catalog/component".
- Also cover `WebInteractionError`, which includes
  `STALE_RENDER_INTERACTION`.

Use an exhaustive `never` check here too, as in WVR-031.

## Acceptance criteria
- [ ] Every `WebRenderError` and `WebInteractionError` code is described and
      tested.
- [ ] Core is not changed to import Web types.

## Verification
`pnpm --filter @cylayo/weaver-web test`

## Definition of done
Merged.

## Log

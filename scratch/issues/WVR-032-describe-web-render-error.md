---
id: WVR-032
title: Web describeWebRenderError() for WebRenderError and interaction errors
epic: E3 Error presentation
audit_ref: WVR-03
priority: P0
status: done
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
- [x] Every `WebRenderError` and `WebInteractionError` code is described and
      tested.
- [x] Core is not changed to import Web types.

## Verification
`pnpm --filter @cylayo/weaver-web test`

## Definition of done
Merged.

## Log
- 2026-10-10: Branch `wvr-032-describe-web-error` (not pushed, no PR). The
  implementation is commit `a2af0cc`. A review follow-up on the same branch adds
  `INVALID_LOCAL_STATE_VALUE`.
  - Added `packages/web/src/surface/describeWebRenderError.ts`, exported from
    the surface barrel as `describeWebRenderError` and `DescribableWebError`.
    It returns Core's `WeaverErrorDescription` shape.
  - All 10 codes are described: 5 `WebRenderError` codes, 2 `WebInteractionError`
    codes, `INVALID_LOCAL_STATE_VALUE` (the `setLocalState` failure, added by
    review so hosts get a description), `RENDERER_*` naming catalogId, component,
    sourceComponentId and scopePath, and `SURFACE_RESOLUTION_FAILED` delegating
    to Core with its cause chain kept.
  - Tests: `describeWebRenderError.test.ts`, 10 cases, registered in the Web
    `test` script. Includes a compile-time code inventory covering all three
    unions and a generic fallback for unknown codes.
    `pnpm --filter @cylayo/weaver-web test` passes.
  - Core is unchanged. Gate: typecheck, build, `verify:packages`,
    `verify:worker-core`, `check:generated`, full `pnpm test`, and
    `conformance:v0.9.1` all pass.
- 2026-10-10 merged in cyruslayo/weaver#21 (c2fc058)

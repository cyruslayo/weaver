---
id: WVR-033
title: Regression tests — malformed input leaves last good state and DOM; host gets described error
epic: E3 Error presentation
audit_ref: WVR-03 (acceptance), §5 fail-safe behaviour
priority: P0
status: todo
depends_on: [WVR-032]
estimate: S
---

## Context
Strict validation before mutation is Weaver's key advantage over OpenUI's
permissive parser. These tests lock that property in and prove that the new
describers produce actionable output for the failures.

## Scope
- In `A2UIV091StreamIngestion.test.ts`: process valid frames, then a
  malformed JSON frame, then a catalog-invalid frame, then a valid frame.
  Assert the following:
  - the surface snapshot after each bad frame equals the snapshot before it;
  - ingestion continues after the bad frames;
  - `describeWeaverError(err, { frame })` names the frame number and, for the
    catalog error, the component id.
- In `WebSurfaceRenderer.test.ts`: once a surface is mounted, a later update
  that references an unregistered renderer keeps the previous DOM and calls
  `onError`. `describeWebRenderError` then names the component.
- Before adding anything, check which of these cases already exist. Add only
  the missing ones and the describer assertions.

## Acceptance criteria
- [ ] The tests above pass.
- [ ] No production behaviour changes. The PR touches only tests, unless a
      test exposes a real bug; in that case, file a separate issue.

## Verification
`pnpm test`

## Definition of done
Merged.

## Log

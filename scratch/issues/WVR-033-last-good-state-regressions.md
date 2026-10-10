---
id: WVR-033
title: Regression tests — malformed input leaves last good state and DOM; host gets described error
epic: E3 Error presentation
audit_ref: WVR-03 (acceptance), §5 fail-safe behaviour
priority: P0
status: in-review
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
- [x] The tests above pass.
- [x] No production behaviour changes. The PR touches only tests, unless a
      test exposes a real bug; in that case, file a separate issue.

## Verification
`pnpm test`

## Definition of done
Merged.

## Log
- 2026-10-10: Branch `wvr-033-last-good-state` (reset to base `d977a03`, not
  pushed, no PR). Test-only change in two files.
  - `packages/core/src/stream-ingestion/A2UIV091StreamIngestion.test.ts`: new
    case. A valid surface is created, then a malformed JSON frame (frame 4) and
    a catalog-invalid frame (frame 5, component `bad`) each leave the surface
    snapshot unchanged. `describeWeaverError` names frame 4 in its summary and
    frame field, and names `bad` as `componentId` for frame 5. A later valid
    frame (frame 6) still applies. The existing tests did not cover this
    sequence with prior state, or any describer assertion.
  - `packages/web/src/surface/WebSurfaceRenderer.test.ts`: new case. A later
    update to an unregistered renderer keeps the previous DOM, calls `onError`
    once, and `describeWebRenderError` names catalog `test`, component
    `Missing`, and componentId `root`. The existing rerender test covered the
    DOM and `onError` but not the describer.
  - No new test files, so no `test` script changes were needed.
  - No product bug found. No production code changed.
  - Gate: `pnpm install`, `pnpm typecheck`, `pnpm build`, `pnpm test` (exit 0;
    core 413/413, web 133/133, mcp 10/10, cookbook 43/43, reference-app 3/3),
    `pnpm verify:packages` and `pnpm verify:worker-core` all exit 0.
  - Mutation check (temporary, reverted, not committed): a catalog-invalid
    frame that writes to the last good surface fails the new Core case at the
    surface-snapshot assertion (`dataModel.name` `MUTATED` vs `Ada`). Skipping
    `onError` fails the new Web case at `errors.length` (0 vs 1). Mutating the
    Web DOM on a failed rerender kills the whole Web test file (SIGKILL), which
    is a failure but not an assertion-level one.
  - Follow-up: the new Web case now compares DOM markup as strings and checks
    node identity as booleans, and it fails cleanly under the clear and
    append mutations. The file-level SIGKILL comes from the existing
    `rerender failure is atomic` test, which passes DOM nodes to `assert.equal`
    and hangs when it fails; it is not fixed here.

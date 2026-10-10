---
id: WVR-023
title: replayWeaverTrace() with per-step divergence report
epic: E2 Trace and replay
audit_ref: WVR-02 (acceptance: same final surface, no extra side effects)
priority: P0
status: done
depends_on: [WVR-022]
estimate: M
---

## Scope
```ts
replayWeaverTrace(trace: WeaverTrace, options: { runtime: WeaverRuntime; until?: number /* seq */ })
  → { steps: Array<{ seq; kind; recorded; replayed; diverged: boolean }>; surfaces: Record<string, SurfaceSnapshot> }
```

- Replay works on a fresh runtime that the caller builds. The caller chooses
  the catalogs and the mock functions.
- `message` entries are re-processed. `frame-error` entries are reported and
  not applied. `input` and `action` entries are re-issued.
- Replay never touches a transport. Core `dispatchAction` is already
  transport-neutral, so side effects live only in host callbacks, which
  replay never installs. Document that effectful catalog functions such as
  `openUrl` must be given mock implementations by the caller.
- A step diverges when `ok` or the error `code` differs from the recording.
- `until` supports step-to-N in the inspector.

## Acceptance criteria
- [x] Record, then replay into an identically configured runtime: zero steps
      diverge, and every surface snapshot deep-equals the original.
- [x] Replaying into a runtime missing a catalog marks the affected steps as
      diverged.
- [x] `until` stops at the right step.
- [x] A test proves replay makes no outbound calls: a spy callback is never
      invoked.

## Verification
`pnpm --filter @cylayo/weaver-core test`

## Definition of done
Merged.

## Log
- 2026-10-10: Implemented on branch `wvr-023-trace-replay` (base `d977a03`).
  - New `packages/core/src/trace/replayWeaverTrace.ts`:
    `replayWeaverTrace(trace, { runtime, until? })` returns `{ steps, surfaces }`.
    It is exported from Core, together with `WEAVER_TRACE_REPLAY_INVALID_INPUT`.
  - `message` entries go to `process()`. `input` and `action` go to
    `writeInput()` and `dispatchAction()`. `frame-error` is reported with
    `replayed: null`, `diverged: false`, and is never applied.
  - `surfaces` is built with `getSurface()` for the IDs that the replay names,
    because `WeaverRuntime` has no public list method.
  - A malformed `input` or `action` request is reported as diverged with code
    `REPLAY_INVALID_INPUT`. It is not thrown. A non-safe-integer `until` throws
    `RangeError`.
  - Replay re-issues each local function action through the caller's runtime.
    Effectful functions such as `openUrl` must therefore be given mocks by the
    caller. This is documented in the JSDoc.
  - Tests: 7 new in `replayWeaverTrace.test.ts`, one per criterion plus
    frame-error, divergence-by-code, and malformed-input cases. Registered in the
    Core test script. Core suite 419/419.
  - Criterion 4 is evidenced this way: the recording's host callback runs once
    while recording, and never again during replay. Replay runs the action
    through the replay runtime's own mock.
  - Gates: `pnpm install`, `pnpm typecheck`, `pnpm build`, `pnpm test`
    (core 419, mcp 10, web 132, cookbook 43, reference-app 3, all pass),
    `pnpm verify:packages`, `pnpm verify:worker-core`, `pnpm check:generated`,
    and `pnpm conformance:v0.9.1` all exit 0.
  - Not done here: no push and no PR. `scratch/BOARD.md` and `docs/PLAN.md`
    were left alone, as the session asked.
  - Review follow-up: added a two-surface round-trip test, which checks every
    surface deep-equals the original, and a mid-trace frame-error test. Tests
    total 9 in `replayWeaverTrace.test.ts`. Core suite is now 421/421.

- 2026-10-10 merged in cyruslayo/weaver#23 (6094797)

---
id: WVR-023
title: replayWeaverTrace() with per-step divergence report
epic: E2 Trace and replay
audit_ref: WVR-02 (acceptance: same final surface, no extra side effects)
priority: P0
status: ready
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
- [ ] Record, then replay into an identically configured runtime: zero steps
      diverge, and every surface snapshot deep-equals the original.
- [ ] Replaying into a runtime missing a catalog marks the affected steps as
      diverged.
- [ ] `until` stops at the right step.
- [ ] A test proves replay makes no outbound calls: a spy callback is never
      invoked.

## Verification
`pnpm --filter @cylayo/weaver-core test`

## Definition of done
Merged.

## Log

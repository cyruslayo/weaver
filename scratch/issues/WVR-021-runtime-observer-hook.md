---
id: WVR-021
title: Add opt-in observer hook to WeaverRuntime
epic: E2 Trace and replay
audit_ref: WVR-02, §4.D
priority: P0
status: done
depends_on: []
estimate: M
---

## Context
Tracing needs to see every message, input write and action outcome. A
wrapping decorator can't do this. `WeaverRuntime` is a class with `#private`
members, so a wrapper is not assignable to `WeaverRuntime`, and Web APIs take
`WeaverRuntime`. A small opt-in config hook is the least invasive option.

## Scope
- Add `observer?: (event: WeaverRuntimeEvent) => void` to
  `WeaverRuntimeConfig` in `packages/core/src/runtime/types.ts`.
- Define `WeaverRuntimeEvent`:
  - `{ kind: "message"; input: JsonValue | unknown; result: MessageProcessorResult }`.
    Fire it once per message, including for each item in `processMany`.
  - `{ kind: "input"; request: WeaverInputRequest; result: WeaverInputResult }`.
  - `{ kind: "action"; request: WeaverActionRequest; result: WeaverActionResult }`.
- Deliver payloads as defensive copies made with the existing
  `cloneRuntimeJson` helper. Inputs that are not JSON-safe and that the
  validator rejected are passed as a `{ unserializable: true }` marker.
- Wrap observer calls in `try/catch` and ignore any exception. An observer
  must never change runtime results or state.
- Do no work when `observer` is undefined. Don't clone anything.
- Thread the observer through `createWeaverRuntime.ts`.
- `createBasicWebRuntime` already passes `runtime` options through. Verify
  the observer reaches the runtime, and add a Web test if needed.

## Out of scope
- Resolution or render events.
- Persistence.

## Files
`packages/core/src/runtime/{types.ts,WeaverRuntime.ts,createWeaverRuntime.ts,WeaverRuntime.test.ts}`

## Acceptance criteria
- [x] The observer receives events in order for `process`, `processMany`,
      `writeInput` and `dispatchAction`, covering success and failure.
      (`WeaverRuntime.test.ts`: "observer receives message, input, and action
      events in order...", "processMany fires one message event per item...")
- [x] Mutating a received event does not affect runtime state.
      (`WeaverRuntime.test.ts`: "observer payloads are defensive copies...")
- [x] A throwing observer leaves results identical to a run with no observer.
      (`WeaverRuntime.test.ts`: "a throwing observer leaves every result
      identical...")
- [x] Existing runtime tests pass unchanged.
      (All 307 pre-existing core tests pass. Only the test helpers `runtime()`
      and `readyRuntime()` gained optional parameters. No existing test body
      changed.)

## Verification
`pnpm --filter @cylayo/weaver-core test && pnpm --filter @cylayo/weaver-web test && pnpm verify:worker-core`

## Definition of done
Merged. PLAN.md task entry added.

## Log

- 2026-10-10: Implemented on branch `wvr-021-runtime-observer`, commit
  `cb2fb8d`. Not pushed, no PR.
  - `types.ts`: `observer?` on `WeaverRuntimeConfig`, plus the
    `WeaverRuntimeEvent` and `WeaverRuntimeObserver` types, exported from
    `runtime/index.ts`.
  - `WeaverRuntime.ts`: the factory lives here, not in `createWeaverRuntime.ts`
    (a one-line re-export), so the observer is threaded through this file.
    Emits from `process`, `writeInput` and `dispatchAction`. `processMany`
    reaches it through `process`. Events are built lazily, so nothing is
    copied with no observer. Observer exceptions are swallowed.
  - Hardening beyond the issue text: `cloneJson` has no cycle detection, so a
    cyclic host input would hang a naive copy. A JSON-safety check (iterative,
    cycle-aware, plain objects only) runs first. Rejected non-JSON-safe input
    becomes the `{ unserializable: true }` marker, and the copy never walks it.
  - Web: `createBasicWebRuntime` already passed `runtime` through, so no code
    change was needed. One test confirms the observer arrives.
  - Verification: core test 313/313 (307 baseline, 6 new). Web test 121/121
    (120 baseline, 1 new). `pnpm typecheck` clean across all five projects.
    `pnpm verify:worker-core` passed (packed Core in workerd consumer).
  - Not done: `docs/PLAN.md` task entry and `BOARD.md` status, both left to the
    orchestrator as instructed. The `scratch/` tracker is not in this git
    tree, so this log lives in an uncommitted file in this worktree.
- 2026-10-10 merged in cyruslayo/weaver#20 (619d4ef)

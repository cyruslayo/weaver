---
id: WVR-021
title: Add opt-in observer hook to WeaverRuntime
epic: E2 Trace and replay
audit_ref: WVR-02, §4.D
priority: P0
status: ready
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
- [ ] The observer receives events in order for `process`, `processMany`,
      `writeInput` and `dispatchAction`, covering success and failure.
- [ ] Mutating a received event does not affect runtime state.
- [ ] A throwing observer leaves results identical to a run with no observer.
- [ ] Existing runtime tests pass unchanged.

## Verification
`pnpm --filter @cylayo/weaver-core test && pnpm --filter @cylayo/weaver-web test && pnpm verify:worker-core`

## Definition of done
Merged. PLAN.md task entry added.

## Log

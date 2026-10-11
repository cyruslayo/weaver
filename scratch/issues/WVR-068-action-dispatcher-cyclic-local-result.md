---
id: WVR-068
title: ActionDispatcher: guard host localFunction results against cyclic values
epic: F Follow-ups
audit_ref: follow-up to WVR-060 (observer audit, 0.3.0); predates 0.3.0
priority: P2
status: ready
depends_on: []
estimate: S
---

## Context
`packages/core/src/actions/ActionDispatcher.ts` returns a host `localFunction` result with
`cloneJson(evaluated.value)` (around line 198). `cloneJson` is in `packages/core/src/data-model/clone.ts`.
It is iterative and has no cycle check, so a host function that returns a cyclic value, or a
non-JSON value that `cloneJson` cannot copy, can hang or exhaust the heap. The host contract says
the result is `JsonValue`, but nothing checks it at this call site.

This is expected to hang `dispatchAction` even without an observer. It was found by reading the
code during the WVR-060 observer audit (see WVR-060's Log, 2026-10-10 "audit" entry). It has
**not been reproduced yet**, and it predates 0.3.0.

The observer-side hang was fixed in WVR-060. The observer now checks every caller-supplied payload
with the cycle-aware `isJsonValue` before any clone (`packages/core/src/runtime/WeaverRuntime.ts`).
This issue covers the dispatcher's own copy, which the observer fix does not touch.

## Scope
- Write a failing reproduction first: a host `localFunction` that returns a cyclic object, run
  through `dispatchAction` with no observer.
- Make the dispatcher return a typed error for a result that is not JSON-safe, instead of cloning
  it. Pick an existing error code if one fits, or add one and record the choice in the Log.
  Check it against `describeWeaverError` so the error is still described.
- Keep the behaviour for valid results the same. A JSON-safe value is still returned, copied, as before.

## Out of scope
- Changing `cloneJson` itself, unless the Log shows that a cycle check there is the better fix.
  If it is, record the decision first.
- Changing the observer path in `WeaverRuntime.ts` (already fixed in WVR-060).
- Changing the public types of the action result, unless a new error code requires it.

## Files
- `packages/core/src/actions/ActionDispatcher.ts` (around line 198)
- `packages/core/src/actions/` test file for the dispatcher (add the reproduction next to the existing tests)
- `packages/core/src/data-model/clone.ts` (read only, unless the Log decides otherwise)
- `packages/core/src/diagnostics/describeWeaverError.ts` (only if a new error code is added)
- `packages/core/package.json` (the test list, if a new test file is added; keep the spaces in the list)
- `scratch/issues/WVR-068-action-dispatcher-cyclic-local-result.md`, `scratch/BOARD.md`

## Acceptance criteria
- [ ] A failing reproduction is written first. It runs in a child process with `--max-old-space-size`
      and a timeout, as in `packages/core/src/runtime/observerCyclicPayloads.test.ts`, so a hang
      fails the suite and does not block it. The Log records that it failed before the fix.
- [ ] The dispatcher returns a typed error for a host `localFunction` result that is not JSON-safe.
      The error is described by `describeWeaverError`.
- [ ] No behaviour change for valid results: existing dispatcher and runtime tests pass without edits.
- [ ] `pnpm conformance:v0.9.1` passes, since Core behaviour changed on an error path.

## Verification
- The reproduction test, failing before the fix and passing after it. Record both runs in the Log.
- `pnpm --filter @cylayo/weaver-core test`, `pnpm typecheck`, `pnpm conformance:v0.9.1`.
- `pnpm check:docs` if any Markdown changed.

## Definition of done
Merged to `main`, with every acceptance criterion ticked on evidence.

## Log
- 2026-10-11: created from the WVR-060 observer audit. Status `ready`, no dependencies. Not reproduced
  yet. The first step is the reproduction in Scope.

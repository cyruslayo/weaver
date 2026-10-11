---
id: WVR-068
title: ActionDispatcher: guard host localFunction results against cyclic values
epic: F Follow-ups
audit_ref: follow-up to WVR-060 (observer audit, 0.3.0); predates 0.3.0
priority: P2
status: done
depends_on: []
estimate: S
---

## Context
**Verdict: already guarded. No code fix is needed.** A host `localFunction` result that contains a
cycle is rejected before the dispatcher copies it, and the reproduction test pins that behaviour.

The guard, traced from the action entry point:

- `packages/core/src/functions/FunctionEvaluator.ts:316` calls `validReturnValue(result, definition.returnType)`.
  `validReturnValue` (`:109-114`) calls `isJsonSafe` (`:36-76`), which is cycle-aware: its `active` set
  detects a value that contains itself.
- A rejected value returns `FUNCTION_RETURN_TYPE_MISMATCH` (`:316-329`). The dispatcher reports it as
  `ACTION_DISPATCH_FAILED > LOCAL_FUNCTION_FAILED > FUNCTION_RETURN_TYPE_MISMATCH`.
- Only a JSON-safe value reaches the evaluator's clone (`FunctionEvaluator.ts:332`) and the dispatcher's
  `cloneJson` (`packages/core/src/actions/ActionDispatcher.ts:198`). `cloneJson`
  (`packages/core/src/data-model/clone.ts`) still has no cycle check, but on this path it never receives a cycle.
- The published `@cylayo/weaver-core@0.3.0` behaves the same way: a cyclic result returns the typed error in 2 ms.

**Original suspicion (disproved).** The issue said a host `localFunction` result with a cycle would hang
`dispatchAction`, because `cloneJson` at `ActionDispatcher.ts:198` has no cycle check and the dispatcher
does not validate the result. Both halves are true of the code, but the value is rejected at
`FunctionEvaluator.ts:316` before it reaches that line, so the hang does not happen.

Other problems found while verifying this (a throwing getter that escapes `dispatchAction`, and a shared-reference
value that blows up the walk) are not cycles and are not covered here. They are filed as WVR-069.

## Scope
Closed without a code change. The Scope items below were written before the guard was found, and none of them
is needed. The reproduction test is the only deliverable.
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
- [x] A child-process reproduction exists and passes. It is `packages/core/src/actions/ActionDispatcher.cyclicLocalResult.test.ts`,
      run with `--max-old-space-size=128` and a 10 s timeout, and registered in `packages/core/package.json`.
- [x] It covers cyclic object, cyclic array, cyclic `void`, BigInt, function, `Map`, `NaN`/`Infinity`, and an
      `undefined` member. Each returns the typed error `FUNCTION_RETURN_TYPE_MISMATCH`.
- [x] Observer and no-observer results are identical for every host result.
- [x] Valid results are unchanged: a plain object is copied, and a 100 000-deep acyclic chain is still returned.
      Existing tests pass without edits (437 before the new file).
- [x] The mutation check shows the test fails when the guard is removed (see Log).
- [ ] not applicable: already guarded. "A failing reproduction is written first ... fails before the fix." The
      reproduction passes at `574f4c8`, because the guard already exists at `FunctionEvaluator.ts:316`. It is a
      passing pin, and the mutation check is the evidence that it bites.
- [ ] not applicable: already guarded. "The dispatcher returns a typed error for a non-JSON-safe result." The typed
      error already comes from `FunctionEvaluator.ts:316`. The dispatcher was not changed, and no new error code was added.
- [x] `pnpm conformance:v0.9.1` passes (Core 442/442, Web 139/139).

## Verification
- `pnpm --filter @cylayo/weaver-core test`: 442 pass, 0 fail.
- Mutation check: compiled `dist/functions/FunctionEvaluator.js:253` changed to `if (false)` in a scratch copy. The child
  dies with SIGABRT and 5 of 5 tests fail.
- `pnpm typecheck`: exit 0. `pnpm check:docs`: 166/166 links OK. `pnpm conformance:v0.9.1`: exit 0.

## Definition of done
Closed: no code fix needed; regression test merged.

## Log
- 2026-10-11: created from the WVR-060 observer audit. Status `ready`, no dependencies. Not reproduced
  yet. The first step is the reproduction in Scope.
- 2026-10-11: phase 1 (reproduction) on branch `wvr-068-repro`, from base `574f4c8` (Merge PR #37).
  Status set to `in-progress`. No source file changed in this phase.

  **Verdict: ALREADY GUARDED.** The cyclic host result is rejected before `ActionDispatcher.ts:198`
  copies it. The suspicion was right that `cloneJson` has no cycle check, but the value never reaches it.
  The reproduction therefore passes at this commit and pins the guard. It is not a failing reproduction,
  so the acceptance box "fails before the fix" cannot be met as written. The Scope section needs a
  decision (see Open questions below).

  **Traced path of a localFunction result (base `574f4c8`):**
  1. `ActionDispatcher.ts:176` calls `functionEvaluator.evaluateAction(...)`, which calls
     `FunctionEvaluator.ts:181-183` → `#evaluate(..., allowActionRoot = true)`.
  2. `FunctionEvaluator.ts:192-226` validates the call against the catalog. `:248-262` requires a
     registration (`FUNCTION_IMPLEMENTATION_NOT_FOUND`). `:263-274` allows the `action` effect as a root.
  3. `FunctionEvaluator.ts:276-288` resolves arguments. `:290-314` runs the host implementation inside
     a `try`. A throw becomes `FUNCTION_EXECUTION_FAILED`.
  4. **The guard:** `FunctionEvaluator.ts:316` calls `validReturnValue(result, definition.returnType)`.
     `:113` returns `value === undefined` for `void`. `:114` gates every other type with
     `isJsonSafe`. `isJsonSafe` (`FunctionEvaluator.ts:36-76`) is iterative and detects cycles with the
     `active` set (`:41`, `:63`, exit frames `:48-50`). A cycle, a BigInt, a function, a `Map`, a
     non-finite number, a non-plain object, an array with extra keys, or an `undefined` member all
     return `false`. A rejection returns `FUNCTION_RETURN_TYPE_MISMATCH` (`:316-329`).
  5. Only then does `FunctionEvaluator.ts:332` clone the result, and `ActionDispatcher.ts:198` clones
     it again. The dispatcher's clone is reached only with a JSON-safe value.
  6. Nothing in `FunctionRegistry.ts:19-46` (register) or `functions/types.ts:44-49` inspects return
     values. `runtime/safety.ts` exports resolution budgets only (depth and instance counts). It does
     not check function results.
  7. The runtime wrapper `WeaverRuntime.ts:282-288` and `:309-325` only maps errors. With an observer,
     `observedActionResult` (`:133-142`) copies the result through `observedValue` (`:89-92`), which
     runs `isJsonValue` first. Results that the guard rejects never produce a `localFunction` value.

  **Test added:** `packages/core/src/actions/ActionDispatcher.cyclicLocalResult.test.ts`, registered
  in `packages/core/package.json` after `dist/actions/ActionDispatcher.test.js`. It is a child process
  with `--max-old-space-size=128` and a 10 s timeout, using `createWeaverRuntime` and `dispatchAction`
  with a catalog Button whose `functionCall` calls the host function. It runs with and without an
  observer and asserts the typed error.

  **Commands and outputs:**
  - `git fetch origin main && git checkout -B wvr-068-repro 574f4c8...` then `git log --oneline -1` →
    `574f4c8 Merge pull request #37 from cyruslayo/claude/busy-allen-uf99ec`.
  - `pnpm install --frozen-lockfile` → `Done in 764ms using pnpm v10.15.0`.
  - Baseline `pnpm --filter @cylayo/weaver-core test` → `# tests 437 / # pass 437 / # fail 0`.
  - Probe (scratch script, not committed), 128 MB heap, 10 s timeout, one runtime per mode. Each row is
    one host function returning the value shown. The outcomes are identical with and without observer.
    The observer run records 13 action events: 10 `false`, 3 `true`. The getter dispatch records none:

    | host result | outcome (no observer) | with observer |
    |---|---|---|
    | cyclic object (`a.self = a`), returnType `any` | `ok:false` `ACTION_DISPATCH_FAILED > LOCAL_FUNCTION_FAILED > FUNCTION_RETURN_TYPE_MISMATCH` | same |
    | cyclic array (`a.push(a)`), `any` | same typed error | same |
    | cyclic object, returnType `void` | same typed error | same |
    | `1n` (BigInt) | same typed error | same |
    | function | same typed error | same |
    | `Map` | same typed error | same |
    | `NaN` / `Infinity` | same typed error (each) | same |
    | `{ a: undefined }` | same typed error | same |
    | `undefined` under returnType `any` | same typed error | same |
    | acyclic chain, 100 000 nested `{next}` | `ok:true`, copied (143 ms) | same (302 ms) |
    | `undefined` under returnType `void` | `ok:true`, no value | same |
    | plain `{owned:true}` | `ok:true`, copied | same |
    | getter that throws (`{ get boom() { throw } }`) | **throws `Error: getter` out of `dispatchAction`** | no event, same throw |

  - Probe result for the shared-reference DAG (`{left:v,right:v}` repeated N times, acyclic, passes
    `isJsonSafe`). The first clone is `FunctionEvaluator.ts:332`, so the cost lands there, not at
    `ActionDispatcher.ts:198`:
    - N=16 → `ok:true`, 177 ms. N=18 → `ok:true`, 565 ms.
    - N=20 → `FATAL ERROR: ... JavaScript heap out of memory`, exit 134 (SIGABRT).
    - N=24 → heap out of memory, exit 134. N=28 → timed out at 10 s, exit 124.
  - Mutant check (scratch copy of the compiled `dist`, source not touched): the return check at
    `dist/functions/FunctionEvaluator.js:253` was replaced with `if (false)`. The new test then fails:
    the child dies with `signal SIGABRT` after 0.84 s, the heap is exhausted in `cloneJson`, and all
    five tests fail. This shows the test catches a real regression.
  - Committed test in `ba19c37`: `pnpm --filter @cylayo/weaver-core test` →
    `# tests 442 / # pass 442 / # fail 0`. The 5 new tests are the only additions (437 + 5).
  - `pnpm typecheck` → exit 0 for all workspace packages.

  **Other findings (not in WVR-068 scope, not fixed here):**
  - A shared-reference DAG (acyclic, JSON-safe by `isJsonSafe`) exhausts the heap at depth 20 with a
    128 MB heap, and times out at depth 28. The cost is the clone at `FunctionEvaluator.ts:332`
    (unmemoised `cloneJson`) and the 2^N walk in `isJsonSafe`. This is a resource-exhaustion path that
    the guard does not cover. It should be its own issue. It is a DoS on a valid-looking value, not
    the cyclic case.
  - A getter that throws escapes `dispatchAction` as a raw `Error`. `validReturnValue` runs at
    `FunctionEvaluator.ts:316`, outside the `try` at `:290-314`, so `Object.values` in `isJsonSafe`
    throws out of `evaluate`. The observer is skipped because `#dispatchAction` throws before
    `#observe` (`WeaverRuntime.ts:283`).
  - A host function declared `any` that returns `undefined` is rejected as a return-type mismatch
    (`isJsonSafe(undefined)` is false, `:114`). A `void` function returning `undefined` is accepted.
    This may be intended, but it is surprising.

  **Open questions for the owner:**
  1. The guard already exists at `FunctionEvaluator.ts:316`. Should WVR-068 instead be closed as
     "already guarded" with the pinned test, or should the dispatcher-level typed error still be added
     as defence in depth? The second option would make the test a passing pin plus a dispatcher guard.
  2. The getter escape and the DAG blow-up are not in WVR-068 scope. File them as new issues?

  The committed test deliberately excludes the getter, the `undefined` under `any` case and the DAG.
  Pinning them would lock in behaviour that the owner has not decided.

  Acceptance boxes were not ticked. `scratch/BOARD.md` was not touched.
- 2026-10-11 phase 2 (reproduction and mutation check, branch `wvr-068-close`, base `574f4c8`):
  - Cherry-picked `ba19c37` (the test and its `package.json` entry) as `ce5b943`, and `0f78b48` (the verdict log)
    as `732f03a`. Both applied without conflict.
  - `pnpm --filter @cylayo/weaver-core test` → `# tests 442 / # pass 442 / # fail 0` (437 + 5).
  - Mutation check. A scratch copy of the built `packages/core/dist` (outside the repo) had the return-value check at
    compiled `dist/functions/FunctionEvaluator.js:253` changed from `if (!validReturnValue(...))` to `if (false)`.
    The new test, run against that copy, failed 5 of 5. Each child died with `signal SIGABRT` after about 0.9 s, with
    the heap exhausted in `cloneJson`. Source was not edited.
- 2026-10-11 closure: **already guarded. Status `done`.**
  - The premise is false. A cyclic host `localFunction` result is rejected at `FunctionEvaluator.ts:316`
    (`validReturnValue` → cycle-aware `isJsonSafe`, `:36-76`) with `FUNCTION_RETURN_TYPE_MISMATCH`, before
    `FunctionEvaluator.ts:332` or `ActionDispatcher.ts:198` clones it. The missing cycle check in `cloneJson` is never reached.
  - Confirmed against the published `@cylayo/weaver-core@0.3.0`: a cyclic result returns the typed error in 2 ms.
  - The test is kept as a regression pin. The acceptance items that assumed a failing reproduction and a dispatcher
    change are marked not applicable, with the reason in the list.
  - Two other defects found while verifying are not cycles. They are filed as **WVR-069**: a shared-reference DAG
    that blows up `isJsonSafe` and `cloneJson` (and the observer's `isJsonValue`), and a throwing getter that escapes
    `dispatchAction` as a raw `Error`.

---
id: WVR-069
title: Reject shared-reference JSON values and typed errors for throwing getters
epic: F Follow-ups
audit_ref: follow-up to WVR-068 (cyclic localFunction result, closed as already guarded 2026-10-11); observer audit WVR-060
priority: P2
status: ready
depends_on: []
estimate: M
---

## Context
Found while closing WVR-068. A host value that is cyclic is rejected correctly, but two related
host-value paths are not. Both were reproduced on the published `@cylayo/weaver-core@0.3.0`.

**Problem A: shared references make the JSON check and the copy exponential.**
`isJsonSafe` in `packages/core/src/functions/FunctionEvaluator.ts` (lines ~36-76) keeps an
ancestors-only `active` set. That detects cycles, but a value that repeats the same child object
is not a cycle. For example, `let v = { leaf: true }; for (i < N) v = { left: v, right: v };` has
only N+1 distinct objects, but it is walked once per path, which is 2^N work.

Measured on published 0.3.0, with a host `localFunction` returning such a value:

- N=10: 12 ms. N=16: 194 ms. N=18: 672 ms.
- N=20 and N=22 abort with a heap out-of-memory at `--max-old-space-size=128` (exit 134).
- N=22 blocks about 9.3 s at the default heap.

After validation, `cloneJson` (`packages/core/src/data-model/clone.ts`, no visited set) copies the
DAG into a TREE. That is exponential in the OUTPUT size too, so memoising the check alone is not enough.

The same ancestors-only pattern is in `isJsonValue` in `packages/core/src/runtime/WeaverRuntime.ts`
(line ~50), which was added in 0.3.0 for the observer. Measured on published 0.3.0: an untyped
`dispatchAction()` request with a shared-reference extra property and an observer attached takes
1.9 s at N=20 and exhausts a 128 MB heap at N=22. Without an observer the same call takes 1 ms.
The code comment there says the check "cannot exhaust or hang" host input. That is wrong for shared
references, and this issue must correct it. The observer is new in 0.3.0, so this is not a regression from 0.2.1.

Other `isJsonValue` copies to be audited: `packages/core/src/trace/parseWeaverTrace.ts` (line ~24) and
`packages/core/src/protocol/a2ui/v0_9_1/validation.ts` (line ~61). The first task is to read each one and
record in the Log whether it has the same ancestors-only shape, and whether its input can come from untrusted
JSON text. `JSON.parse` output cannot contain shared references, so text from a model or a trace file is not affected.

**Problem B: a throwing getter escapes as a raw `Error`.**
`validReturnValue` runs at `FunctionEvaluator.ts` line ~316, outside the `try` at lines ~290-314. A host
result such as `{ get boom() { throw new Error("getter exploded"); } }` makes `isJsonSafe` throw, because
it reads values with `Object.values`. The raw `Error` then escapes `dispatchAction()`. This was reproduced:
the call throws "getter exploded", with no typed error.
Also to audit: the same getter risk in the observer's `isJsonValue` path (which reads with `Object.keys`
plus property access), and in `cloneJson`.

**Reach.** Only HOST code can trigger either problem: a trusted function that returns a DAG or a
throwing getter, or a caller that passes one to `dispatchAction`. JSON parsed from a model cannot contain
shared references or getters.

**Severity.** Low. This is a host-side robustness gap, not a remote issue.

## Scope
Decide the approach in the first Log entry before any code change.

**Recommended approach (to confirm in the Log):** define "JSON-safe" as a TREE. Use one shared visited set
across the whole walk. Any object seen twice, cyclic or not, makes the value not JSON-safe, and the
function returns the existing typed error (`FUNCTION_RETURN_TYPE_MISMATCH` for a function result). This
is linear time, needs no memoisation of the clone, and matches what `JSON.stringify` of a tree means.
Wrap value reads in try/catch, so a throwing getter becomes the same typed error. Keep valid results
byte-for-byte unchanged.

Alternatives to record: a memoised walk plus a node-count budget. A memoised walk alone does not fix the
output-size blow-up in `cloneJson`.

Items:

1. Audit the three `isJsonValue` copies and `cloneJson` (see Context). Record the result for each in the Log.
2. Reject shared-reference values in every place the audit finds with the same shape, using the rule above.
3. Handle throwing getters: move `validReturnValue` into the guarded region, or catch inside `isJsonSafe`, so the
   host error becomes a typed error and does not escape `dispatchAction()`.
4. Correct the "cannot exhaust or hang" comment in `WeaverRuntime.ts`.
5. Document the rule "JSON-safe means tree" where host function results are documented (find the right page in
   `docs/`, for example the custom-catalog or architecture docs).
6. Add child-process regression tests, in the style of `packages/core/src/actions/ActionDispatcher.cyclicLocalResult.test.ts`
   (small heap, timeout), for: DAG at N=22, with and without an observer; and a throwing getter, with and without an observer.
   Each must fail before the fix and pass after it.
7. Add a CHANGELOG entry under a new "Unreleased" heading when the fix lands.
8. This is a candidate for a 0.3.1 patch, not a blocker.

## Out of scope
- Any change to the published 0.3.0 tag.
- The DataModel.
- The protocol validator's input from model text, unless the audit in item 1 shows it is affected.
- Cyclic values. They are already rejected (see WVR-068).

## Files
- `packages/core/src/functions/FunctionEvaluator.ts` (`isJsonSafe` lines ~36-76, `validReturnValue` ~109-114, the call at ~316)
- `packages/core/src/runtime/WeaverRuntime.ts` (`isJsonValue` line ~50, and the comment)
- `packages/core/src/data-model/clone.ts` (read; change only if the audit requires it)
- `packages/core/src/trace/parseWeaverTrace.ts` (`isJsonValue` line ~24, audit)
- `packages/core/src/protocol/a2ui/v0_9_1/validation.ts` (`isJsonValue` line ~61, audit)
- New or existing child-process tests under `packages/core/src/` (next to `observerCyclicPayloads.test.ts` and the WVR-068 test); register each new file in `packages/core/package.json`
- `docs/` (the page where host function results are documented)
- `CHANGELOG.md` (an "Unreleased" entry)
- `scratch/issues/WVR-069-shared-reference-json-and-throwing-getter.md`, `scratch/BOARD.md`

## Acceptance criteria
- [ ] The Log records the audit of the three `isJsonValue` copies and `cloneJson`, with the shape and the input source of each.
- [ ] The Log records the chosen approach (tree rule, or the alternative), before any code change.
- [ ] A DAG at N=22 returns the typed error in a child process with `--max-old-space-size=128` and a timeout, with and without an observer. The test failed before the fix and passes after it.
- [ ] A host result with a throwing getter returns a typed error through `dispatchAction()`, with and without an observer. The raw `Error` does not escape. The test failed before the fix and passes after it.
- [ ] Valid results are unchanged. Existing tests pass without edits, and no test is removed.
- [ ] The "cannot exhaust or hang" comment in `WeaverRuntime.ts` is corrected.
- [ ] The "JSON-safe means tree" rule is documented where host function results are documented, and linked from there.
- [ ] A CHANGELOG entry exists under "Unreleased".

## Verification
- `pnpm --filter @cylayo/weaver-core test` and `pnpm typecheck`, with no test removed.
- Mutation checks: restore the ancestors-only walk, and remove the try/catch. The new tests must fail in each case.
- `pnpm conformance:v0.9.1`, since Core behaviour changed on an error path.
- `pnpm check:docs`, since the docs and CHANGELOG changed.
- Re-run the probes in the Log (DAG N=10 to N=22 at 128 MB; throwing getter through `dispatchAction`), before and after.

## Definition of done
Merged to `main`, with every acceptance criterion ticked on evidence.

## Log
- 2026-10-11: created while closing WVR-068 (already guarded). Status `ready`, no dependencies, estimate M.
  Evidence, measured on published `@cylayo/weaver-core@0.3.0`: the DAG timings and heap failures, the observer
  timings, and the throwing-getter escape, as in Context. The probe code is not committed.
  No approach is chosen yet. The recommendation is the tree rule in Scope.

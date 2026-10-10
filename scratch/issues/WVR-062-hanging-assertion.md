---
id: WVR-062
title: No assert.* receives DOM nodes, so a failing Web test reports instead of hanging
epic: F Follow-ups
audit_ref: follow-up to WVR-033 (browser review)
priority: P2
status: ready
depends_on: []
estimate: S
---

## Context
`packages/web/src/surface/WebSurfaceRenderer.test.ts:407-418`, the test `rerender failure is atomic,
reports errors, and later valid state recovers`, passes DOM nodes straight to `assert`:

- line 412: `const oldNode = target.querySelector("span");`
- line 414: `assert.equal(target.querySelector("span"), oldNode);`
- line 416: `assert.notEqual(target.querySelector("span"), oldNode);`

When such an assertion fails, `node:assert` tries to build a diff of happy-dom nodes, and the
test file does not return. The WVR-033 Log (`scratch/issues/WVR-033-last-good-state-regressions.md:65-72`)
records that a Web DOM mutation on a failed rerender "kills the whole Web test file (SIGKILL)" and
attributes it to this test. That Log gives no duration. The "about 60s" figure is not in the tracker
or the code, and it was not reproduced in this issue's creation run.

Scan: a type-aware TypeScript scan (the TypeScript program built from `packages/web/tsconfig.json`,
`examples/cookbook/tsconfig.json`, and `examples/playground/tsconfig.test.json`). It flags every
`assert.*` call whose first two arguments are statically typed as `Element`, `HTML*Element`, `SVG*Element`,
`Node`, `ChildNode`, or arrays of them, including the `| null` forms. It found **43** call sites, 41
`equal`/`notEqual` and 2 `deepEqual`. The list is in Files. The scan does not see values typed `any`,
which is a known limit.

How it was found: reading the test, the WVR-033 Log, and the type-aware scan above.

## Scope
Decide the approach in the Log first. The real choice is how to express identity and null checks
without a node reaching `assert`:

1. **Boolean assertions.** `assert.ok(a === b, "message")` for identity, and `assert.equal(x === null, true, "message")`
   for null checks. No helper, and the failure text is readable. Recommended for the 43 sites.
2. **Named helper.** A small test-local helper, `sameNode(label, actual, expected)`, that records
   `actual === expected` and `actual === null` and throws a short message. Use it only if the Log
   shows the same pattern repeating more than the 43 sites justify.
3. **Node identifiers.** Give each node a stable string key from a `WeakMap` index, then compare the keys.
   More code than the boolean approach, and not needed here.

For the atomic test itself: keep the same identity meaning (the old node is still there after a failed
rerender, and a new node appears after recovery), and express it with option 1.

Also convert the `deepEqual` at `WebSurfaceRenderer.test.ts:216` and `:220`, which compares the
`childNodes` array to `oldChildren`. Compare the length and each `===` as booleans.

## Out of scope
- Any change to renderer behaviour. Only test code changes.
- Changing `node:assert`, adding a test runner, or changing the timeouts. A timeout setting is not
  the fix, because a SIGKILL does not come from a timeout.
- Assertions that already compare strings, numbers, or booleans. They are not in scope.
- The `any`-typed call sites the scan cannot see. Note them in the Log if any are found.

## Files
- `packages/web/src/surface/WebSurfaceRenderer.test.ts` (test at lines 407-418, and these `assert` lines: 112, 133, 134, 156, 163, 183, 188, 216, 220, 262, 372, 392, 414, 416, 455, 543, 619, 694, 714, 715, 716)
- `packages/web/src/basic/basic.test.ts` (lines 53, 64, 98, 123, 124, 155, 224)
- `packages/web/src/basic-web-runtime/BasicWebRuntime.test.ts` (lines 91, 92, 154, 167)
- `examples/cookbook/src/custom-catalog/barChart.test.ts` (lines 105, 106, 137, 138, 184, 186, 196, 197)
- `examples/cookbook/src/custom-catalog/renderers.test.ts` (lines 56, 58)
- `examples/cookbook/src/ticket-board.test.ts` (line 182)
- `scratch/issues/WVR-062-hanging-assertion.md`, `scratch/BOARD.md`

## Acceptance criteria
- [ ] The type-aware scan reports zero `assert.*` calls with DOM-typed arguments across the three test programs. The command and its zero-hit output are recorded in the Log.
- [ ] Mutation proof: a temporary change that replaces the container in a failed rerender makes `rerender failure is atomic` FAIL, with a readable message, within 10 seconds. There is no hang. The mutation is then reverted, and the Log records the failure text and the time.
- [ ] The atomic test still checks what it checked: the old node is still in the DOM after a failed rerender, and a new node appears after the recovery render. Both are asserted as booleans.
- [ ] `WebSurfaceRenderer.test.ts` passes in full, and the Web test count is unchanged from before this change (`pnpm --filter @cylayo/weaver-web test`).
- [ ] The cookbook test files pass (`pnpm --filter @weaver/cookbook test`), with the same test count as before.
- [ ] `pnpm test` and `pnpm typecheck` pass.
- [ ] No production source file is changed. `git diff --stat` shows only test files.

## Verification
- The type-aware scan, run before and after the change, output in the Log.
- `pnpm --filter @cylayo/weaver-web test`, `pnpm --filter @weaver/cookbook test`, `pnpm test`, `pnpm typecheck`.
- The mutation run, with its time and output in the Log.

## Definition of done
Merged to `main`, with every acceptance criterion ticked on evidence.

## Log
- 2026-10-10: created from the WVR-024/057 browser review. Status `ready`, no dependencies. The atomic test passes DOM nodes at `WebSurfaceRenderer.test.ts:414` and `:416`. The type-aware scan found 43 `assert.*` call sites with DOM-typed arguments (41 equal/notEqual, 2 deepEqual). The "about 60s" hang duration is not in the tracker and was not confirmed.

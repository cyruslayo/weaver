---
id: WVR-062
title: No assert.* receives DOM nodes, so a failing Web test reports instead of hanging
epic: F Follow-ups
audit_ref: follow-up to WVR-033 (browser review)
priority: P2
status: in-review
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
- [x] The type-aware scan reports zero `assert.*` calls with DOM-typed arguments across the three test programs. The command and its zero-hit output are recorded in the Log. (Evidence: AFTER scan, Log 2026-10-10.)
- [x] Mutation proof: a temporary change that replaces the container in a failed rerender makes `rerender failure is atomic` FAIL, with a readable message, within 10 seconds. There is no hang. The mutation is then reverted, and the Log records the failure text and the time. (Evidence: mutation (a), Log 2026-10-10.)
- [x] The atomic test still checks what it checked: the old node is still in the DOM after a failed rerender, and a new node appears after the recovery render. Both are asserted as booleans. (Evidence: WebSurfaceRenderer.test.ts:414 and :416.)
- [x] `WebSurfaceRenderer.test.ts` passes in full, and the Web test count is unchanged from before this change (`pnpm --filter @cylayo/weaver-web test`: 139 before, 139 after).
- [x] The cookbook test files pass (`pnpm --filter @weaver/cookbook test`), with the same test count as before (99 before, 99 after).
- [x] `pnpm test` and `pnpm typecheck` pass.
- [x] No production source file is changed. `git diff --stat` shows only test files.

## Verification
- The type-aware scan, run before and after the change, output in the Log.
- `pnpm --filter @cylayo/weaver-web test`, `pnpm --filter @weaver/cookbook test`, `pnpm test`, `pnpm typecheck`.
- The mutation run, with its time and output in the Log.

## Definition of done
Merged to `main`, with every acceptance criterion ticked on evidence.

## Log
- 2026-10-10: created from the WVR-024/057 browser review. Status `ready`, no dependencies. The atomic test passes DOM nodes at `WebSurfaceRenderer.test.ts:414` and `:416`. The type-aware scan found 43 `assert.*` call sites with DOM-typed arguments (41 equal/notEqual, 2 deepEqual). The "about 60s" hang duration is not in the tracker and was not confirmed.
- 2026-10-10: approach chosen: option 1, boolean assertions (`assert.ok(a === b, "message")` for identity, `assert.equal(x === null, true, "message")` for null checks). Owner approved. No helper unless the pattern repeats far beyond the listed sites. A failing assertion must never receive a DOM node, because `node:assert` tries to inspect and diff happy-dom nodes and the test file hangs until SIGKILL.
- 2026-10-10: type-aware scan, BEFORE. Built with a TypeScript compiler-API script (kept in the session scratchpad, not committed: this change touches test files only, and the issue asks for no committed guard). It walks the 8 tsconfig programs: packages/core, packages/mcp, packages/web, examples/cookbook, examples/shared, examples/playground (`tsconfig.json` and `tsconfig.test.json`), examples/reference-app. It flags every `assert*` call (any callee rooted at `assert`, including `assert.ok`, `assert(...)`, and the `equal` family) where an argument, or a template or `+` piece in a message, is typed as a DOM node or contains one, one level down through unions, arrays, generic arguments and object properties. Command: `node <scratchpad>/scan-dom-asserts.cjs .` after `pnpm build` (the build is needed so cross-package imports resolve; without it 313 arguments came back `any`). Result: **57** call sites, not 43. Per program: core 1429 assert calls, mcp 54, web 788, cookbook 470, shared 30, playground 44 (both tsconfigs), reference-app 65.
- 2026-10-10: drift against the issue's list. None of the 43 cited locations has moved: each still holds a DOM-typed assert on the cited line. Cited 43 = WebSurfaceRenderer 21, basic.test 7, BasicWebRuntime 4, barChart 8, renderers 2, ticket-board 1. The 14 uncited sites are the extra ones: `assert.ok(node)` presence checks (13) and one `deepEqual` at WebSurfaceRenderer.test.ts:331 whose value holds `child?: Node` (the relationship record). The extra sites are barChart.test.ts:45,115,123; dataTableRenderer.test.ts:133,191; ticket-board.test.ts:170,187,201; prompt-sample.test.ts:70; reference-app.test.ts:67; WebSurfaceRenderer.test.ts:331,709,711,712. The `any` bucket after the build has 15 arguments, all plain JSON or trace data or `as any` meta values (core definition, trace recorder, parseWeaverTrace; mcp index; http-sse). None embeds DOM, so none needs conversion.
- 2026-10-10: BEFORE test counts (`pnpm test`): core 428, shared 11, mcp 10, web 139, cookbook 99, playground 15, reference-app 8. All pass.
- 2026-10-10: BEFORE DOM-typed site list (file:line): cookbook barChart.test.ts 45,105,106,115,123,137,138,184,186,196,197; dataTableRenderer.test.ts 133,191; renderers.test.ts 56,58; ticket-board.test.ts 170,182,187,201; reference-app prompt-sample.test.ts 70; reference-app.test.ts 67; web BasicWebRuntime.test.ts 91,92,154,167; basic.test.ts 53,64,98,123,124,155,224; WebSurfaceRenderer.test.ts 112,133,134,156,163,183,188,216,220,262,331,372,392,414,416,455,543,619,694,709,711,712,714,715,716.
- 2026-10-10: conversion. All 57 sites converted to booleans, in 9 test files, with no helper. Presence checks became `assert.ok(x !== null, msg)`. Absence checks became `assert.equal(x === null, true, msg)`. Identity became `assert.ok(a === b, msg)`, and non-identity `assert.ok(a !== b, msg)`. Two sites use `== null` (barChart.test.ts:137-138) because `bars(target)[i]?.` can yield `undefined` at runtime, and the loose `assert.equal(x, null)` treated that as null. The `deepEqual` of `childNodes` against `oldChildren` (WebSurfaceRenderer.test.ts:216, :220) became a length check plus an every-`===` boolean. The old `deepEqual` compared nodes structurally, so the new check is identity. The atomic-rerender intent is identity, so this is stricter, not weaker, and the current tree is green. The `deepEqual` at :331 compared a record whose `child?: Node` could reach a failure message. It became a length check, a kind/property check, an exact own-key check, and a JSON comparison of the plain `location` data. The `any` bucket (15 arguments) was judged by hand: plain JSON, trace or meta data, no DOM. The atomic test keeps its two identity checks (:414 old node stays, :416 new node appears) and its text check.
- 2026-10-10: AFTER scan, zero hits. Command: `node <scratchpad>/scan-dom-asserts.cjs .` in the worktree after `pnpm build`. Output: `DOM-typed assert call sites: 0`. The programs are unchanged, and the `any` bucket is the same 15 hand-checked arguments. Assert-call totals rose by 3 in web (788 to 791) because of the :331 rewrite. Test counts did not change.
- 2026-10-10: mutation (a), temporary `if (!rendered.ok) { container.replaceChildren(); return rendered; }` in `WebSurfaceRenderer.ts` `#render` (reverted with git checkout). `node --test dist/surface/WebSurfaceRenderer.test.js` finished in about 2 s wall (22:03:46 to 22:03:48), exit 1. Not a hang or SIGKILL. 39 tests, 36 pass, 3 fail. `rerender failure is atomic` fails in 19 ms with `Expected values to be strictly equal: '' !== 'old'`. The other two failures are `unregistered renderer on a later update keeps the last DOM...` and `Basic media policy receives bound hydrated URLs and policy exceptions preserve prior DOM`.
- 2026-10-10: mutation (b), temporary `root.append(document.createElement("table"))` in the empty-state branch of `barChart.ts` (reverted with git checkout). `node --test dist/custom-catalog/barChart.test.js` exited 1 in about 2 s (22:04:32 to 22:04:34). 10 tests, 9 pass, 1 fail: `the empty state renders with no SVG and no table` with message `no table`. The converted boolean assertion at barChart.test.ts:106 catches it. An earlier try at `renderers.test.ts:58` (a DataTable renderer changed to a `div`) did NOT fail. `barChart.ts` always renders a visually hidden table, so the `table` selector is matched by BarChart's table too. That assertion never isolated the DataTable's table, before or after this change. It is recorded here, not changed, because changing its meaning is out of scope.
- 2026-10-10: test counts, before and after (`pnpm test`): core 428 to 428, shared 11 to 11, mcp 10 to 10, web 139 to 139, cookbook 99 to 99, playground 15 to 15, reference-app 8 to 8. All pass.
- 2026-10-10: gates on the final tree: `pnpm install`, `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm check:generated`, `pnpm check:docs`, `pnpm conformance:v0.9.1`, `pnpm verify:packages`, `pnpm verify:worker-core`, all exit 0. `pnpm --filter @cylayo/weaver-web test` 139/139. `pnpm --filter @weaver/cookbook test` 99/99. `pnpm --filter @weaver/cookbook e2e` 40 passed. Playground e2e not run, because no playground test file changed.
- 2026-10-10: follow-up fix for the ambiguous selector (coordinator review). `renderers.test.ts` asserted `querySelector("table")` for "DataTable must render as a table", but BarChart's visually hidden table also matches. It now reads `const dataTable = target.querySelector('[data-cookbook-component="DataTable"]')` and asserts `assert.equal(dataTable !== null && dataTable.querySelector("table") !== null, true, "DataTable must render its own table")`. Still boolean-only, with no DOM node passed to assert. Passes on the real renderer. Proof: temporary `document.createElement("div")` in place of the DataTable's `table` in `dataTableRenderer.ts` (reverted with git checkout). `node --test dist/custom-catalog/renderers.test.js` exited 1 in about 1 s (22:10:02 to 22:10:03). 4 tests, 3 pass, 1 fail, with message `DataTable must render its own table` (`false !== true`). Neighbour scan: `dataTableRenderer.test.ts` `table(target)` uses an unscoped `querySelector("table")`, but its mount renders no BarChart (verified: no BarChart in that file's screens), so it is unambiguous today. It is left unchanged. The `wrapper.contains(table(target))` check is also left as it is, since scoping the helper would make it trivially true. Every other `renderers.test.ts` assertion uses `data-a2ui-component` or `button` selectors, which BarChart cannot satisfy in a way that changes the result. Test counts unchanged (renderers 4, cookbook 99).
- 2026-10-10: the scanner was not committed. This change is test-only and the diff must stay test files plus this issue. It lives in the session scratchpad, and the command above reproduces it. Branch `wvr-062-dom-assertions`, based on `e40daf9`. Not pushed, no PR.

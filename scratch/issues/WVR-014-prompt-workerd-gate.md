---
id: WVR-014
title: Exercise the prompt generator inside the packed-Core workerd gate
epic: E1 Prompt generation
audit_ref: WVR-01, §3.2 (Core portability)
priority: P0
status: done
depends_on: [WVR-011]
estimate: S
---

## Context
Core must stay worker-safe. The generator calls `CatalogRegistry` and a
scratch runtime, so it has to be proven inside `workerd`, just as runtime
validation already is.

## Scope
Extend the request handler in `integration/workerd-consumer/worker.test.js` to
call `generateA2UIV091Prompt({ catalogs: [catalog] })`. Assert `ok: true` and
that the output contains `Text`.

## Files
`integration/workerd-consumer/worker.test.js`

## Acceptance criteria
- [x] `pnpm verify:worker-core` passes and covers prompt generation.

## Verification
`pnpm verify:packages && pnpm verify:worker-core`

## Definition of done
Merged. CI is green.

## Log
- 2026-10-10: Implemented on branch `wvr-014-prompt-workerd-gate` (base `fa731b4`). `integration/workerd-consumer/worker.test.js` now imports `generateA2UIV091Prompt` from the packed `@cylayo/weaver-core`. The request handler calls it with the same `worker-test` catalog and returns `prompt: { ok, containsText }`. A new test asserts `{ ok: true, containsText: true }`. The existing registration, validation and rejection assertions are unchanged. Evidence: `pnpm verify:packages` passes (3 tarballs). `pnpm verify:worker-core` passes with 2/2 workerd tests (`prompt generation` and the existing runtime test) inside `vpw` isolated runtimes. `pnpm typecheck`, `pnpm build` and `pnpm test` pass. Not done here: the docs/PLAN.md task entry and the scratch/BOARD.md update, which the orchestrator handles.
- 2026-10-10 merged in cyruslayo/weaver#21 (c2fc058)

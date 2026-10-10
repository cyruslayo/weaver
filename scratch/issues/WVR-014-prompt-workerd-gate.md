---
id: WVR-014
title: Exercise the prompt generator inside the packed-Core workerd gate
epic: E1 Prompt generation
audit_ref: WVR-01, §3.2 (Core portability)
priority: P0
status: todo
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
- [ ] `pnpm verify:worker-core` passes and covers prompt generation.

## Verification
`pnpm verify:packages && pnpm verify:worker-core`

## Definition of done
Merged. CI is green.

## Log

---
id: WVR-015
title: Reference-app prompt sample with a canned model response (no LLM)
epic: E1 Prompt generation
audit_ref: WVR-01 ("minimal model generation sample"), Slice 1
priority: P0
status: todo
depends_on: [WVR-012]
estimate: S
---

## Context
Developers need to see the whole loop: catalog, then prompt, then model
output, then strict ingestion, then UI. The example stays deterministic and
needs no API key, so it can run in CI.

## Scope
- `examples/reference-app/src/prompt-sample.ts` exports
  `buildReferencePrompt()`. It uses the Basic catalog plus the app's single
  trusted action, `reference.createRequest`, with its context shape.
- `examples/reference-app/src/canned-model-response.jsonl` holds a
  hand-written "model output" that is valid A2UI.
- Add a test in `reference-app.test.ts`, or in a new test file registered in
  the example's `test` script. The test feeds the canned JSONL through
  `createA2UIV091StreamIngestion`, asserts that every event is `ok`, and
  asserts the surface renders in happy-dom. Feed a second, deliberately broken
  response and assert the prior surface survives.
- In the README, add a section showing where a real provider call would
  replace the canned text, in pseudo-code. Add no SDK dependency.

## Files
`examples/reference-app/src/*` and `examples/reference-app/README.md`

## Acceptance criteria
- [ ] The prompt includes `reference.createRequest` and no other action.
- [ ] The canned response renders. The broken response is rejected and the
      prior surface stays.
- [ ] The example still declares no network or LLM dependency.

## Verification
`pnpm --filter @weaver/reference-app test`

## Definition of done
Merged.

## Log

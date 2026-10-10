---
id: WVR-015
title: Reference-app prompt sample with a canned model response (no LLM)
epic: E1 Prompt generation
audit_ref: WVR-01 ("minimal model generation sample"), Slice 1
priority: P0
status: done
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
- [x] The prompt includes `reference.createRequest` and no other action.
- [x] The canned response renders. The broken response is rejected and the
      prior surface stays.
- [x] The example still declares no network or LLM dependency.

## Verification
`pnpm --filter @weaver/reference-app test`

## Definition of done
Merged.

## Log

- 2026-10-10: In review on branch `wvr-015-prompt-sample-reference-app`, based on `d977a03`.
  - `examples/reference-app/src/prompt-sample.ts` exports `buildReferencePrompt()`. It calls `generateA2UIV091Prompt()` with the Basic catalog, the single action `reference.createRequest` (context bound to `/draft/title` and `/draft/priority`, the same as the app's Submit button), and one worked example that the generator validates.
  - `src/canned-model-response.jsonl` holds three valid v0.9.1 frames that create the `reference-request` surface. The README gained a section with pseudo-code for where a provider call would replace the canned text. No SDK dependency was added.
  - Tests are in the new `src/prompt-sample.test.ts`, registered in `examples/reference-app/package.json` `test` (a `package.json` change outside the Files list). Eight tests cover the criteria. Criterion 1 asserts the Actions section and every event name in the prompt. Criterion 2 feeds the canned JSONL through `createA2UIV091StreamIngestion` and checks the happy-dom render. The broken response has an undeclared component (`CATALOG_REGISTRY_ERROR`) and truncated JSON (`INVALID_JSON`). Both are rejected, and the tree, data model and text stay unchanged. Criterion 3 checks the manifest dependencies and scans `src/*.ts` for network APIs.
  - Verification: `pnpm --filter @weaver/reference-app test` 8/8. Workspace `pnpm typecheck`, `pnpm build`, `pnpm test` (core 412, mcp 10, web 132, cookbook 43, reference-app 8, all passing), `pnpm verify:packages`, `pnpm check:generated`, and `pnpm conformance:v0.9.1` pass. `pnpm verify:worker-core` was run as a gate (see below).

- 2026-10-10 merged in cyruslayo/weaver#23 (6094797)

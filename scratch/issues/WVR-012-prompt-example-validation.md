---
id: WVR-012
title: Validate prompt examples through a scratch runtime before emitting them
epic: E1 Prompt generation
audit_ref: WVR-01
priority: P0
status: in-review
depends_on: [WVR-011]
estimate: S
---

## Context
A prompt that teaches the model an invalid example is worse than no example.
Every example message must pass Weaver's own strict pipeline before it can
appear in a prompt.

## Scope
- In `generateA2UIV091Prompt`, for each example, create a fresh runtime with
  `createWeaverRuntime({ catalogs, functions })` and run `processMany(messages)`.
- On the first failure, return
  `{ code: "EXAMPLE_INVALID", exampleIndex, messageIndex, cause: MessageProcessorError }`.
- Also call `resolveSurface` for each created surface. If resolution fails,
  return `EXAMPLE_INVALID`, so examples with dangling child ids or depth
  violations are rejected too.
- Ship 2 or 3 canonical Basic examples as an exported constant: a simple card,
  a form with a bound TextField and a Button action, and an edit-mode
  `updateDataModel`-only update. Build them with `createA2UIV091Producer()`.

## Out of scope
- Rendering examples in a DOM.

## Files
- `packages/core/src/prompt/generateA2UIV091Prompt.ts`
- New: `packages/core/src/prompt/basicExamples.ts`
- Tests

## Acceptance criteria
- [x] An example with an unknown component, a bad property type or a missing
      `root` returns `EXAMPLE_INVALID` with correct indices.
- [x] The shipped Basic examples pass and appear in the output.
- [x] Validation runs in a separate runtime and has no side effects.

## Verification
`pnpm --filter @cylayo/weaver-core test`

## Definition of done
Merged. Tests registered.

## Log

- 2026-10-10: In review on branch `wvr-012-prompt-example-validation`, based on `fa731b4`.
  - `generateA2UIV091Prompt` validates each example in a fresh `createWeaverRuntime({ catalogs, functions })`. It runs `processMany`, then `resolveSurface` for every surface still alive. Errors are `EXAMPLE_INVALID` with `exampleIndex`, `exampleTitle` and a `stage` of `runtime`, `process` or `resolve`. `process` adds `messageIndex`, and `resolve` adds `surfaceId`. Each carries a typed `cause`.
  - The validator only runs when examples are given, so prompts without examples do not change.
  - `resolveSurface` returns `ok` for a surface with no root or a dangling child, so the generator also requires the tree and checks to be ready and the surface issues to be empty. Those failures use a `SURFACE_NOT_READY` cause.
  - Ships `A2UI_V091_BASIC_PROMPT_EXAMPLES` (simple card, bound form with a button action, edit-mode update) from `packages/core/src/prompt/basicExamples.ts`, exported from the prompt index.
  - Assumption: the edit example is a three-message sequence (create, component, initial value) followed by the edit `updateDataModel`. A lone `updateDataModel` cannot pass a fresh runtime, because it has no surface. The title says only the last line is the edit.
  - Existing tests that used `deleteSurface` without a create now create first. The `describeWeaverError` fixture gained the new fields.
  - Tests: `packages/core/src/prompt/examples.test.ts` (registered in the core test script), 18 cases.

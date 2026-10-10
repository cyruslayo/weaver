---
id: WVR-012
title: Validate prompt examples through a scratch runtime before emitting them
epic: E1 Prompt generation
audit_ref: WVR-01
priority: P0
status: todo
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
- [ ] An example with an unknown component, a bad property type or a missing
      `root` returns `EXAMPLE_INVALID` with correct indices.
- [ ] The shipped Basic examples pass and appear in the output.
- [ ] Validation runs in a separate runtime and has no side effects.

## Verification
`pnpm --filter @cylayo/weaver-core test`

## Definition of done
Merged. Tests registered.

## Log

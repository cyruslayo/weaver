---
id: WVR-031
title: Core describeWeaverError() — exhaustive, human-actionable error descriptions
epic: E3 Error presentation
audit_ref: WVR-03
priority: P0
status: ready
depends_on: []
estimate: M
---

## Context
Weaver's errors are precise typed unions, but a host developer must read the
source to understand them. The audit asks for grouping by frame, component,
path and cause, so a failure can be found without searching through the
console.

## Scope
New module `packages/core/src/diagnostics/`, exported from Core:

```ts
export interface WeaverErrorDescription {
  code: string;
  severity: "error" | "warning";
  summary: string;                 // one sentence, no jargon
  surfaceId?: string; componentId?: string; scopePath?: string; dataPath?: string; frame?: number;
  causes: readonly WeaverErrorDescription[];   // flattened cause chain (e.g. COMPONENT_PROPERTY_RESOLUTION_FAILED → cause)
  hint?: string;                   // what to change in the A2UI output or host config
}
describeWeaverError(error: MessageProcessorError | JsonlDecodeError | WeaverSurfaceResolutionError
                    | WeaverRuntimeInteractionError | A2UIV091StreamIngestionError, context?: { frame?: number }): WeaverErrorDescription
```

- Make the function exhaustive with a `never` check, so that adding an error
  code anywhere fails compilation until someone describes it.
- Inventory every code first by reading each `errors.ts` under
  `packages/core/src/**`.
- When WVR-011 is done, also cover `A2UIPromptGenerationError`. If WVR-011
  merges later, it adds that coverage itself.
- Keep the module pure: no DOM, no i18n framework. English strings are fine.

## Files
- New: `packages/core/src/diagnostics/*`
- Edit: `index.ts` and the package test list

## Acceptance criteria
- [ ] Every code in every listed union has a description. A test enumerates
      fixtures for each code.
- [ ] Nested causes are flattened in order.
- [ ] A catalog-validation failure names the component id and the offending
      property path.

## Verification
`pnpm --filter @cylayo/weaver-core test && pnpm typecheck`

## Definition of done
Merged.

## Log

---
id: WVR-031
title: Core describeWeaverError() — exhaustive, human-actionable error descriptions
epic: E3 Error presentation
audit_ref: WVR-03
priority: P0
status: done
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
- [x] Every code in every listed union has a description. A test enumerates
      fixtures for each code.
- [x] Nested causes are flattened in order.
- [x] A catalog-validation failure names the component id and the offending
      property path.

## Verification
`pnpm --filter @cylayo/weaver-core test && pnpm typecheck`

## Definition of done
Merged.

## Log
- 2026-10-10: Branch `wvr-031-describe-error`, commit `9ded769` (not pushed, no PR).
  - Added `packages/core/src/diagnostics/` (`describeWeaverError`, types, index),
    exported from `src/index.ts`, and registered the test file in the core
    `test` script. `pnpm --filter @cylayo/weaver-core test` passes (316/316,
    including 9 new diagnostics tests). `pnpm typecheck` passes.
  - Inventory: 15 `errors.ts` files plus the nested unions they reference. A
    compile-time check in the test fails if the code list drifts from those unions.
  - Scope call: the accepted union also includes `WeaverRuntimeConfigurationError`
    (runtime) and `FunctionRegistryError` (functions). Neither is reachable from the
    five listed unions, so without them their codes would have no `never` check.
  - Skipped: `A2UIPromptGenerationError` (WVR-011 not available), as instructed.
  - Not done: the workflow asks for a `docs/PLAN.md` entry. Left out because the
    task said not to edit `docs/PLAN.md`. `BOARD.md` is also untouched.
- 2026-10-10: Integration (`wvr-integration`). WVR-011 is now merged, so
  `A2UIPromptGenerationError` joins the accepted union. Its four codes
  (`CATALOG_INVALID`, `ACTION_NAME_INVALID`, `PROMPT_TOO_LARGE`,
  `EXAMPLE_INVALID`) each get a summary and an actionable hint. `CATALOG_INVALID`
  nests its `CatalogRegistryError` cause. The inventory and fixtures cover all
  four codes, and the switch is exhaustive, with a `never` check in the default.
  The `docs/PLAN.md` entry (Task 63) is now written.
- 2026-10-10 merged in cyruslayo/weaver#20 (619d4ef)

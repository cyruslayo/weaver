---
id: WVR-011
title: Add generateA2UIV091Prompt() to Core (API, types, errors, determinism)
epic: E1 Prompt generation
audit_ref: WVR-01, §4.A, §4.B
priority: P0
status: ready
depends_on: []
estimate: M
---

## Context
OpenUI compiles its component library into model instructions
(`lang-core/src/parser/prompt.ts`), so the allowed UI and the prompt cannot
drift apart. Weaver already holds the input for this: a trusted catalog JSON
Schema with descriptions (`defineCatalog()` and
`createBasicCatalogV091Registration()`). What is missing is a deterministic
compiler from the catalog to **A2UI v0.9.1** instructions. It must never
emit OpenUI Lang.

## Scope
A new module `packages/core/src/prompt/`, made of `index.ts`,
`generateA2UIV091Prompt.ts`, `types.ts`, `errors.ts` and
`generateA2UIV091Prompt.test.ts`. Export it from `packages/core/src/index.ts`.

```ts
export interface A2UIV091PromptConfig {
  catalogs: readonly CatalogRegistration[];
  functions?: readonly FunctionRegistration[];   // listed only if declared in catalog AND registered
  actions?: readonly A2UIPromptAction[];          // { name, description, context?: JsonObject }
  examples?: readonly A2UIPromptExample[];        // { title, messages: readonly unknown[] } (validation: WVR-012)
  mode?: "create" | "edit";                        // default "create"
  maxCharacters?: number;                          // default 24_000
}
export type A2UIV091PromptResult =
  | { ok: true; value: { text: string; sections: readonly A2UIPromptSection[] } }
  | { ok: false; error: A2UIPromptGenerationError };
export function generateA2UIV091Prompt(config: A2UIV091PromptConfig): A2UIV091PromptResult;
```

The prompt is built from these sections, in a fixed order:
1. **Envelope rules.** `version: "v0.9.1"`, one JSON message per line (JSONL),
   exactly one of `createSurface`, `updateComponents`, `updateDataModel` or
   `deleteSurface` per message, a component tree rooted at id `root`, flat
   components referenced by id, and `catalogId` equal to the catalog's id.
2. **Components.** For each catalog component, sorted by name: the component
   description, plus each property sorted by name with its type, whether it
   is required, its `enum` values and its description. Describe the binding
   forms (`{ "path": "/..." }` and function-call values) wherever the schema
   allows them. Derive all of this from the schema. Do not hand-write it.
3. **Functions.** Only functions that are declared in the catalog **and**
   present in `functions`. List name, description and arguments.
4. **Actions.** The host-declared event names with their descriptions and
   context shape. State explicitly that no other action names are allowed.
5. **Edit mode only.** "Emit only changed components with `updateComponents`
   (upsert by id) and data changes with `updateDataModel`. Do not re-send
   unchanged components or recreate the surface." This adapts audit §4.B to
   A2UI.
6. **Examples.** Rendered as JSONL blocks.

Errors, defined as typed values in `errors.ts`:
- `CATALOG_INVALID`: wraps `CatalogRegistryError`. Register the catalogs into
  a scratch `CatalogRegistry` first.
- `ACTION_NAME_INVALID`: the name is empty or duplicated.
- `PROMPT_TOO_LARGE`: carries `{ characters, maxCharacters }`. The generator
  never truncates silently.
- `EXAMPLE_INVALID`: the shape is reserved here and implemented in WVR-012.

## Out of scope
- Calling any model or provider SDK.
- Token counting. Characters are the budget unit for now.
- A non-Basic catalog fixture (see WVR-013 and WVR-051).

## Files
- New: `packages/core/src/prompt/*`
- Edit: `packages/core/src/index.ts` (export) and
  `packages/core/package.json` (add `dist/prompt/generateA2UIV091Prompt.test.js`
  to the `test` script)
- Reuse: `CatalogRegistry` and `cloneJson` (from `data-model/clone.ts`)

## Acceptance criteria
- [ ] Identical input produces byte-identical output across runs. Object keys
      are sorted, and the output contains no time or randomness.
- [ ] A component or function not in the catalog never appears. A catalog
      function that is not registered is not listed.
- [ ] Changing a component's schema `description` changes the output.
- [ ] Output above `maxCharacters` returns `PROMPT_TOO_LARGE`.
- [ ] An invalid catalog returns `CATALOG_INVALID`. A duplicate action name
      returns `ACTION_NAME_INVALID`.
- [ ] Generating the prompt for the Basic catalog succeeds and lists all 18
      components.
- [ ] `architecture-independence.test.ts` still passes: no DOM, `eval` or Web
      imports.

## Verification
`pnpm --filter @cylayo/weaver-core test && pnpm typecheck`

## Definition of done
Merged. The API is exported. Tests are registered in the package test script.
PLAN.md has a task entry.

## Log

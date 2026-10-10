# Prompt generation

`generateA2UIV091Prompt()` in `@cylayo/weaver-core` compiles a trusted A2UI
v0.9.1 catalog into model instructions. The prompt is built from the same
catalog the runtime validates against, so the UI a model may describe and the
instructions it reads cannot drift apart.

It is a pure function. Weaver does not call a model. Your application sends
the returned text to its own provider SDK, and the model's output then goes
through the strict pipeline like any other untrusted text (see
[validated A2UI stream ingestion](a2ui-stream-ingestion.md)).

The output is deterministic. Object keys are sorted, nothing is timestamped,
and nothing is truncated: a prompt over budget fails with an error instead.

## Quick start

```ts
import {
  createBasicCatalogV091Registration,
  generateA2UIV091Prompt,
} from "@cylayo/weaver-core";

const result = generateA2UIV091Prompt({
  catalogs: [createBasicCatalogV091Registration()],
  actions: [
    { name: "submit_signup", description: "Submit the sign-up form.", context: { name: { path: "/form/name" } } },
  ],
});
if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);

// Pass this as the system prompt of your own model call.
const systemPrompt = result.value.text;
```

The Basic catalog is the canonical A2UI v0.9.1 catalog. Its registration
helper is `createBasicCatalogV091Registration()`.

## API

```text
generateA2UIV091Prompt(config: A2UIV091PromptConfig): A2UIV091PromptResult
```

| Field | Required | Meaning |
|---|---|---|
| `catalogs` | yes, at least one | Trusted catalog registrations. Each catalog's components are listed. |
| `functions` | no | Function registrations. A function is listed only if the catalog declares it AND it is registered here. |
| `actions` | no | Host actions the model may emit as event names: `{ name, description, context? }`. |
| `examples` | no | Example conversations, each `{ title, messages }`. Each is validated before it can appear (see below). |
| `mode` | no | `"create"` (default) or `"edit"`. |
| `maxCharacters` | no | Character budget. Defaults to `24000`. |

The result is one of two values:

- `{ ok: true, value: { text, sections } }`. `text` is the full prompt.
  `sections` is the same content split by section, so a host can inspect or
  reorder it.
- `{ ok: false, error }`. There is never a partial prompt. `error.code` is one
  of the codes listed under [Errors](#errors).

## Sections

The prompt is the sections below, joined with a blank line, in this order.

| `id` | Title | When it appears |
|---|---|---|
| `envelope` | Envelope rules | Always. Lists the catalog ids that `createSurface` may use, and the message shapes. |
| `components` | Components | Always. One `### Name` entry per component of each catalog, with its description and properties. |
| `functions` | Functions | Always. Lists the functions allowed in this prompt, or says none are available. |
| `actions` | Actions | Always. Lists the host action names allowed in an event, or says none are. |
| `edit` | Edit mode | Only when `mode` is `"edit"`. |
| `examples` | Examples | Always. Each example is a JSONL block. The heading alone appears when there are no examples. |

In a component entry, each property line gives its type, whether it is
`required` or `optional`, its `enum` values if any, and `binding allowed` when
the property accepts a data binding or a function call. A property's schema
description follows.

## Create mode and edit mode

`create` is the default. It teaches the model to create a surface with
`createSurface` and then `updateComponents` and `updateDataModel`.

`edit` adds the **Edit mode** section. It tells the model to send only changed
components (`updateComponents`, upserted by id) and data changes
(`updateDataModel`), and not to recreate the surface. Use it for follow-up
turns on an existing surface.

## Example validation

Each entry in `examples` runs through its own scratch runtime, built from the
same catalogs and functions. An example is valid only when every message is
accepted and every surface it leaves behind resolves to a complete tree.
Scratch runtimes are discarded, so one example cannot see another's surfaces.
Invalid examples are never shown in the prompt.

The shipped Basic examples are exported as `A2UI_V091_BASIC_PROMPT_EXAMPLES`.
Your own examples are checked the same way.

## Size budget

The default budget is 24,000 characters, measured as the JavaScript string
length of `text`. Going over it returns `PROMPT_TOO_LARGE`, and the prompt is
not truncated.

Measured sizes of the committed Basic fixtures (see
[Regenerating the fixtures](#regenerating-the-fixtures)):

| Fixture | `text.length` (the budget's measure) | `wc -m` on the file | Headroom to 24,000 |
|---|---|---|---|
| `basic-catalog.create.prompt.txt` | 22,165 | 22,166 | 1,835 |
| `basic-catalog.edit.prompt.txt` | 22,350 | 22,351 | 1,650 |

`text.length` is the generator's output length. The file on disk adds one
trailing newline, so `wc -m` is one higher. The text is ASCII, so characters and
bytes match. These figures were checked against the committed fixtures by
`wc -m` and by reading `text.length` from the generator's output.

The Basic catalog fits the default budget with little room. A larger catalog,
more examples or more actions can exceed it. Raise `maxCharacters`, or drop
examples, rather than letting the prompt be cut.

## What the prompt lists, and what it does not guarantee

The prompt lists only what the host declared:

- **Components:** only components of the catalogs passed in. A component that
  is not in a catalog never appears.
- **Functions:** only functions that the catalog declares and that are
  registered in `functions`. A declared but unregistered function is not
  listed. With none, the prompt says no functions are available.
- **Actions:** only the names in `actions`. With none, the prompt says no
  action names are allowed.

The prompt is guidance for the model, not enforcement. Enforcement stays in
the runtime. A component or function outside the catalog is rejected at
message validation, so a model that ignores the prompt still cannot create UI
outside the trusted catalog.

## Errors

Every failure is one of these `error.code` values. The generator never returns
partial text.

| `code` | When | Fields |
|---|---|---|
| `CATALOG_INVALID` | No catalogs, or a catalog the registry rejects (for example a duplicate id or a missing theme). | `message`, `catalogId?`, `cause?` (the `CatalogRegistryError`) |
| `ACTION_NAME_INVALID` | An action name is empty, or declared twice. | `message`, `actionName`, `reason`: `"empty"` or `"duplicate"` |
| `PROMPT_TOO_LARGE` | The text is above `maxCharacters`. | `message`, `characters`, `maxCharacters` |
| `EXAMPLE_INVALID` | An example failed validation. | `message`, `exampleIndex`, `exampleTitle`, `stage`, plus the fields for that stage |

`EXAMPLE_INVALID` has a `stage` that says where it failed:

- `"runtime"`: the scratch runtime could not be created. `cause` is a
  `WeaverRuntimeConfigurationError`.
- `"process"`: a message was rejected. `messageIndex` is its position, and
  `cause` is a `MessageProcessorError`.
- `"resolve"`: a surface did not resolve, or is not complete. `surfaceId` names
  it. `cause` is a `WeaverSurfaceResolutionError` or a `SURFACE_NOT_READY` cause
  with the tree and checks status and the issues.

A host can branch on these fields:

```ts
import {
  A2UI_V091_BASIC_PROMPT_EXAMPLES,
  createBasicCatalogV091Registration,
  generateA2UIV091Prompt,
} from "@cylayo/weaver-core";

const result = generateA2UIV091Prompt({
  catalogs: [createBasicCatalogV091Registration()],
  mode: "edit",
  examples: A2UI_V091_BASIC_PROMPT_EXAMPLES,
  maxCharacters: 24_000,
});

if (result.ok) {
  for (const section of result.value.sections) console.log(section.id, section.title);
} else {
  const error = result.error;
  switch (error.code) {
    case "EXAMPLE_INVALID":
      console.error(`example ${error.exampleIndex} "${error.exampleTitle}" failed at ${error.stage}`);
      if (error.stage === "process") console.error(`message ${error.messageIndex} was rejected`);
      if (error.stage === "resolve") console.error(`surface "${error.surfaceId}" is not complete`);
      break;
    case "PROMPT_TOO_LARGE":
      console.error(`${error.characters} characters is above the ${error.maxCharacters} budget`);
      break;
    default:
      console.error(error.code, error.message);
  }
}
```

## Custom catalogs

A host can pass its own catalog next to Basic. Give it its own `catalogId`.
The canonical Basic catalog is never modified. Functions follow the same rule:
a function is listed only when it is both declared by a catalog and registered.

```ts
import {
  A2UI_V091_BASIC_CATALOG_ID,
  createBasicCatalogFunctionImplementations,
  createBasicCatalogV091Registration,
  generateA2UIV091Prompt,
  type JsonObject,
} from "@cylayo/weaver-core";

const notesCatalogId = "https://example.com/catalogs/notes/v1";
const notesSchema: JsonObject = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  catalogId: notesCatalogId,
  components: {
    NoteBadge: {
      type: "object",
      description: "A short label for a note, such as its status.",
      properties: {
        id: { type: "string" },
        component: { const: "NoteBadge" },
        label: {
          $ref: "common_types.json#/$defs/DynamicString",
          description: "The badge text.",
        },
      },
      required: ["id", "component", "label"],
      additionalProperties: false,
    },
  },
  functions: {},
  $defs: {
    theme: { type: "object", additionalProperties: false },
    commonTypes: {
      $id: "common_types.json",
      $defs: {
        DynamicString: {
          oneOf: [
            { type: "string" },
            { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
          ],
        },
      },
    },
  },
};

const result = generateA2UIV091Prompt({
  catalogs: [createBasicCatalogV091Registration(), { catalogId: notesCatalogId, schema: notesSchema }],
  functions: createBasicCatalogFunctionImplementations({
    catalogId: A2UI_V091_BASIC_CATALOG_ID,
    regexMatcher: () => false, // The prompt never calls a matcher.
  }),
  actions: [{ name: "open_note", description: "Open the note the user picked." }],
});
if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
```

The cookbook app shows a real custom catalog, with the `DataTable` and
`BarChart` components, in
[`examples/cookbook/README.md`](../examples/cookbook/README.md#custom-catalog).
Its schema is `examples/cookbook/src/custom-catalog/catalog.ts`. Notable
points in the generated prompt:

- `DataTable.rows` and `BarChart.values` take a data binding, which is
  preferred, or a literal array of the same item shape.
- `DataTable` is read-only. It has no row actions and rejects `rowAction` at
  message validation. For per-row actions, use a `List` template of `Card`s.

A dedicated custom-catalog guide, `docs/custom-catalogs.md`, is planned under
WVR-055. It does not exist yet.

## Where the generator is used

- `packages/core/src/prompt/generateA2UIV091Prompt.ts`: the generator.
- `examples/reference-app/src/prompt-sample.ts`: `buildReferencePrompt()`, one
  trusted action and one validated example.
- `examples/cookbook/src/screens/form/screen.ts`: `formPrompt()`, the cookbook
  form prompt.

## Regenerating the fixtures

The Basic prompt fixtures are committed in
`packages/core/src/prompt/fixtures/`:

- `basic-catalog.create.prompt.txt`
- `basic-catalog.edit.prompt.txt`

They are generated by `scripts/generate-prompt-fixtures.mjs`, from the shared
config in `packages/core/src/prompt/basicPromptFixtures.test-helper.ts`.

- `node scripts/generate-prompt-fixtures.mjs` builds Core and Web, then writes
  both files.
- `node scripts/generate-prompt-fixtures.mjs --check` exits 1 and names the
  stale files. `pnpm check:generated` runs this check.

The cookbook form prompt is a different case. Its file
`examples/cookbook/src/screens/form/prompt.txt` has no regeneration script.
Each screen-specific prompt file is pinned by its own test instead. The
cookbook test `prompt.txt is the generated prompt for this screen` in
`examples/cookbook/src/form.test.ts` compares the file exactly with
`formPrompt()` and fails when it is stale. Refresh the file by hand from
`formPrompt()`.

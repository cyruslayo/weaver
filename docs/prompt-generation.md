# Prompt generation

`generateA2UIV10Prompt()` in `@cylayo/weaver-core` compiles a trusted A2UI v1.0 catalog into
the model instructions for that catalog. The model is told the components, functions and actions
that the runtime enforces. The generator is deterministic. It calls no model, sends nothing, and
returns text for the application to pass to its own provider call.

The output is a pure function of its input: keys are sorted, nothing is timestamped, and nothing is
truncated silently.

```ts
import { createBasicCatalogV10Registration, generateA2UIV10Prompt } from "@cylayo/weaver-core";

const result = generateA2UIV10Prompt({
  catalogs: [createBasicCatalogV10Registration()],
  actions: [
    { name: "submit_signup", description: "Submit the sign-up form.", context: { name: { path: "/form/name" } } },
  ],
});
if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);

const systemPrompt = result.value.text;
```

## Configuration

`A2UIV10PromptConfig` has these fields:

| Field | Meaning |
|---|---|
| `catalogs` | Required. The trusted catalog registrations. They are validated the same way `createWeaverRuntime` validates them. |
| `functions` | Optional. Function registrations. A function is listed only when the catalog declares it **and** it is registered here. |
| `actions` | Optional. Action names the application accepts, with a description and optional context. Context values are copied and key-sorted. |
| `examples` | Optional. Example message sequences, each with a `title`. Every example is checked (see below). |
| `mode` | `"create"` (the default) or `"edit"`. `"edit"` adds the incremental-update section. |
| `maxCharacters` | Optional. The budget, 24,000 characters by default. |

An action name that is empty or duplicated fails with `ACTION_NAME_INVALID`.

## The result

The result is either `{ ok: true, value: { text, sections } }` or a typed
`A2UIV10PromptGenerationError`. The generator never returns a partial prompt.

`sections` lists the prompt sections in order. Each has an `id`, a `title`, and its Markdown `text`.
The section ids are:

| Id | Content |
|---|---|
| `envelope` | The v1.0 message envelope and the server message types |
| `instructions` | The catalog's `instructions`, with its Markdown headings demoted so they cannot replace the prompt's own headings |
| `components` | Each declared component and its properties, with whether each property accepts a binding |
| `functions` | Each function that is declared and registered, with its arguments and return type |
| `actions` | The configured action names and their context |
| `edit` | Present only in `"edit"` mode: how to send incremental `updateComponents` and `updateDataModel` messages |
| `examples` | Present only when examples are configured |

Properties marked "binding allowed" accept a literal value, a data binding such as
`{"@path": "/json/pointer"}`, or a function call such as `{"@call": "<name>", "args": {...}}`,
as the property schema allows. The prompt states this rule, and the runtime enforces it.

## Using the prompt

The application sends `result.value.text` as the system prompt in its own provider call, and
passes the model's text to the stream ingestion (see [validated A2UI stream ingestion](a2ui-stream-ingestion.md)).
The prompt does not change what the runtime accepts. A model that ignores the prompt is still
checked by validation.

```ts
import {
  A2UI_V10_BASIC_PROMPT_EXAMPLES,
  createBasicCatalogV10Registration,
  generateA2UIV10Prompt,
} from "@cylayo/weaver-core";

const edit = generateA2UIV10Prompt({
  catalogs: [createBasicCatalogV10Registration()],
  mode: "edit",
  examples: A2UI_V10_BASIC_PROMPT_EXAMPLES,
  maxCharacters: 32_000,
});
if (!edit.ok) {
  console.error(edit.error.code, edit.error.message);
} else {
  for (const section of edit.value.sections) {
    console.log(section.id, section.text.length);
  }
}
```

## Budget

The default budget is 24,000 characters. Output above the budget returns `PROMPT_TOO_LARGE`,
with the size and the limit. Raise `maxCharacters` only when the model's context needs it. A
smaller catalog or fewer examples is the usual fix.

## Handling a failed generation

Branch on the error `code`. Each code carries the fields you need to explain the failure:

```ts
import { createBasicCatalogV10Registration, generateA2UIV10Prompt } from "@cylayo/weaver-core";

export function promptOrUndefined(maxCharacters: number): string | undefined {
  const result = generateA2UIV10Prompt({ catalogs: [createBasicCatalogV10Registration()], maxCharacters });
  if (result.ok) return result.value.text;

  switch (result.error.code) {
    case "PROMPT_TOO_LARGE":
      console.error(`The prompt is ${result.error.characters} characters; the limit is ${result.error.maxCharacters}.`);
      return undefined;
    case "EXAMPLE_INVALID":
      console.error(`Example "${result.error.exampleTitle}" failed at the ${result.error.stage} stage.`);
      return undefined;
    default:
      console.error(result.error.code, result.error.message);
      return undefined;
  }
}
```

## Examples are checked

Each configured example is a list of A2UI messages. Before it appears in the prompt, the generator
applies its messages to a fresh scratch runtime built from the same catalogs and functions. It then
resolves the surface the example creates, and requires a complete surface: a root, no dangling
references, and no property or instance issues. An example that fails returns `EXAMPLE_INVALID`
with a `stage`:

- `runtime`: the scratch runtime could not be configured.
- `process`: the message at `messageIndex` was rejected. `cause` is the processor's error.
- `resolve`: the surface failed to resolve, or it is not complete. `cause` is the resolution error,
  or a `SURFACE_NOT_READY` cause that lists the issues.

## Errors

| Code | When | Fields |
|---|---|---|
| `CATALOG_INVALID` | A catalog is not valid for registration | `catalogId?`, `cause?` |
| `ACTION_NAME_INVALID` | An action name is empty or duplicated | `actionName`, `reason` |
| `PROMPT_TOO_LARGE` | The output is longer than `maxCharacters` | `characters`, `maxCharacters` |
| `EXAMPLE_INVALID` | An example failed the checked pipeline | `exampleIndex`, `exampleTitle`, `stage`, `cause` |

Handle the error by its code. Do not send a prompt that was not generated.

## Trust

The prompt is built only from host configuration: the catalogs, functions and actions the host
passes in, and the examples the host writes. Nothing in the prompt comes from a model or from the
wire. The generator describes actions. It does not authorize them. The runtime and the application
still decide what runs.

Catalog `instructions` are written by the catalog's author. They are trusted only as far as that
catalog is trusted, so review them together with the catalog.

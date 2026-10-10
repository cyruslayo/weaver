import assert from "node:assert/strict";
import { test } from "node:test";

import { createBasicCatalogV091Registration } from "../basic-catalog/index.js";
import type { CatalogRegistration } from "../catalog/index.js";
import { cloneJson } from "../data-model/clone.js";
import type { FunctionRegistration } from "../functions/index.js";
import type { JsonObject } from "../protocol/index.js";
import {
  generateA2UIV091Prompt,
  type A2UIV091PromptSectionId,
  type A2UIV091PromptConfig,
} from "./index.js";

const BASIC_CATALOG_ID =
  "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json";
const LABEL_CATALOG_ID = "https://example.test/catalogs/labels.json";
const OTHER_CATALOG_ID = "https://example.test/catalogs/other.json";

const BASIC_COMPONENT_NAMES = [
  "Text",
  "Image",
  "Icon",
  "Video",
  "AudioPlayer",
  "Row",
  "Column",
  "List",
  "Card",
  "Tabs",
  "Modal",
  "Divider",
  "Button",
  "TextField",
  "CheckBox",
  "ChoicePicker",
  "Slider",
  "DateTimeInput",
];

interface LabelOptions {
  componentDescription?: string;
  propertyDescription?: string;
}

/** A small custom catalog. The Label text property is a dynamic string. */
function labelSchema(options: LabelOptions = {}): JsonObject {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: LABEL_CATALOG_ID,
    title: "Labels",
    catalogId: LABEL_CATALOG_ID,
    components: {
      Label: {
        type: "object",
        description: options.componentDescription ?? "A short label.",
        properties: {
          id: { type: "string" },
          component: { const: "Label" },
          text: {
            $ref: "common_types.json#/$defs/DynamicString",
            description: options.propertyDescription ?? "Text to show.",
          },
        },
        required: ["id", "component", "text"],
        additionalProperties: false,
      },
    },
    functions: {
      shout: {
        type: "object",
        description: "Uppercases text.",
        properties: {
          call: { const: "shout" },
          args: {
            type: "object",
            properties: {
              value: { description: "Text to uppercase." },
            },
            required: ["value"],
            additionalProperties: false,
          },
          returnType: { const: "string" },
        },
        required: ["call", "args"],
        additionalProperties: false,
      },
      whisper: {
        type: "object",
        description: "Lowercases text.",
        properties: {
          call: { const: "whisper" },
          args: {
            type: "object",
            properties: {
              value: { description: "Text to lowercase." },
            },
            required: ["value"],
            additionalProperties: false,
          },
          returnType: { const: "string" },
        },
        required: ["call", "args"],
        additionalProperties: false,
      },
    },
    $defs: {
      theme: {
        type: "object",
        properties: { accent: { type: "string" } },
        additionalProperties: false,
      },
      commonTypes: {
        $id: "common_types.json",
        $defs: {
          DynamicString: {
            oneOf: [{ type: "string" }, { type: "object" }],
          },
        },
      },
    },
  };
}

function labelCatalog(options: LabelOptions = {}): CatalogRegistration {
  return { catalogId: LABEL_CATALOG_ID, schema: labelSchema(options) };
}

function basicCatalog(): CatalogRegistration {
  return createBasicCatalogV091Registration();
}

function fn(
  catalogId: string,
  name: string,
): FunctionRegistration {
  return {
    catalogId,
    name,
    effect: "pure",
    implementation: () => "",
  };
}

function textOf(config: A2UIV091PromptConfig): string {
  const result = generateA2UIV091Prompt(config);
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.error));
  if (!result.ok) throw new Error("unreachable");
  return result.value.text;
}

function sectionIds(config: A2UIV091PromptConfig): A2UIV091PromptSectionId[] {
  const result = generateA2UIV091Prompt(config);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  return result.value.sections.map((section) => section.id);
}

test("identical input produces byte-identical output across runs", () => {
  const config: A2UIV091PromptConfig = {
    catalogs: [basicCatalog()],
    functions: [fn(BASIC_CATALOG_ID, "required")],
    actions: [
      { name: "submit", description: "Submit the form.", context: { b: 1, a: { d: 2, c: 3 } } },
    ],
    examples: [
      {
        title: "Hello",
        messages: [
          { version: "v0.9.1", createSurface: { surfaceId: "main", catalogId: BASIC_CATALOG_ID } },
          { version: "v0.9.1", deleteSurface: { surfaceId: "main" } },
        ],
      },
    ],
  };
  const first = generateA2UIV091Prompt(config);
  const second = generateA2UIV091Prompt(config);
  assert.deepEqual(first, second);
  assert.equal(
    JSON.stringify(first),
    JSON.stringify(second),
    "serialized output is identical",
  );
});

test("object key order and catalog order in the input do not change the output", () => {
  const forward = textOf({
    catalogs: [labelCatalog(), basicCatalog()],
    actions: [
      { name: "submit", description: "Submit.", context: { a: 1, b: 2 } },
      { name: "cancel", description: "Cancel." },
    ],
  });
  const reversed = textOf({
    catalogs: [basicCatalog(), labelCatalog()],
    actions: [
      { name: "cancel", description: "Cancel." },
      { name: "submit", description: "Submit.", context: { b: 2, a: 1 } },
    ],
  });
  assert.equal(forward, reversed);
});

test("a component or function not in the catalog never appears", () => {
  const text = textOf({
    catalogs: [labelCatalog()],
    functions: [
      fn(LABEL_CATALOG_ID, "shout"),
      fn(LABEL_CATALOG_ID, "ghost"),
      fn(OTHER_CATALOG_ID, "shout"),
    ],
  });
  assert.ok(text.includes("### Label"), "declared component is listed");
  assert.ok(!text.includes("Video"), "a Basic component absent from this catalog is not listed");
  assert.ok(!text.includes("ghost"), "an undeclared function is not listed");
  assert.ok(text.includes("`shout` returns string."), "declared and registered function is listed");

  const withoutOther = textOf({
    catalogs: [labelCatalog()],
    functions: [fn(LABEL_CATALOG_ID, "shout")],
  });
  assert.equal(text, withoutOther, "a function registered under another catalog id adds nothing");
});

test("a catalog function that is declared but not registered is not listed", () => {
  const text = textOf({
    catalogs: [labelCatalog()],
    functions: [fn(LABEL_CATALOG_ID, "shout")],
  });
  assert.ok(text.includes("`shout`"), "registered function appears");
  assert.ok(!text.includes("whisper"), "declared-but-unregistered function is not listed");
  assert.ok(text.includes("No other function names are allowed."));
});

test("no functions are listed when none are registered", () => {
  const text = textOf({ catalogs: [labelCatalog()] });
  assert.ok(text.includes("No functions are available. Do not emit function calls."));
  assert.ok(!text.includes("shout"));
  assert.ok(!text.includes("whisper"));
});

test("registered Basic functions are listed with their schema description and arguments", () => {
  const text = textOf({
    catalogs: [basicCatalog()],
    functions: [fn(BASIC_CATALOG_ID, "required")],
  });
  assert.ok(
    text.includes(
      "- `required` returns boolean. Checks that the value is not null, undefined, or empty.",
    ),
    "function name, return type and description are listed",
  );
  assert.ok(
    text.includes("  - `value`: dynamicValue; required. The value to check."),
    "argument kind, requiredness and description are listed",
  );
  assert.ok(!text.includes("`regex`"), "an unregistered Basic function is not listed");
});

test("changing a component schema description changes the output", () => {
  const original = textOf({ catalogs: [labelCatalog()] });
  const changed = textOf({
    catalogs: [labelCatalog({ componentDescription: "A bold label." })],
  });
  assert.notEqual(original, changed);
  assert.ok(changed.includes("A bold label."));
  assert.ok(!changed.includes("A short label."));
});

test("changing a property schema description changes the output", () => {
  const original = textOf({ catalogs: [labelCatalog()] });
  const changed = textOf({
    catalogs: [labelCatalog({ propertyDescription: "The visible words." })],
  });
  assert.notEqual(original, changed);
  assert.ok(changed.includes("The visible words."));
});

test("output above maxCharacters returns PROMPT_TOO_LARGE and never truncates", () => {
  const full = textOf({ catalogs: [labelCatalog()] });
  const result = generateA2UIV091Prompt({
    catalogs: [labelCatalog()],
    maxCharacters: full.length - 1,
  });
  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "PROMPT_TOO_LARGE",
      message: result.ok ? "" : result.error.message,
      characters: full.length,
      maxCharacters: full.length - 1,
    },
  });
});

test("output exactly at maxCharacters is accepted and returned whole", () => {
  const full = textOf({ catalogs: [labelCatalog()] });
  const result = generateA2UIV091Prompt({
    catalogs: [labelCatalog()],
    maxCharacters: full.length,
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.value.text, full);
});

test("the default budget is 24000 characters and the Basic catalog fits within it", () => {
  const result = generateA2UIV091Prompt({ catalogs: [basicCatalog()] });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.ok(result.value.text.length <= 24_000);
  const tooSmall = generateA2UIV091Prompt({
    catalogs: [basicCatalog()],
    maxCharacters: result.value.text.length - 1,
  });
  assert.equal(tooSmall.ok, false, "a budget one character below the output fails");
});

test("an invalid catalog returns CATALOG_INVALID that wraps the registry error", () => {
  const mismatched: CatalogRegistration = {
    catalogId: "https://example.test/catalogs/wrong.json",
    schema: labelSchema(),
  };
  const result = generateA2UIV091Prompt({ catalogs: [mismatched] });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.error.code, "CATALOG_INVALID");
  assert.equal(result.error.catalogId, "https://example.test/catalogs/wrong.json");
  assert.equal(
    result.error.code === "CATALOG_INVALID" && result.error.cause?.code,
    "INVALID_CATALOG_SCHEMA",
  );
});

test("a catalog without a theme schema returns CATALOG_INVALID with the registry cause", () => {
  const schema = cloneJson(labelSchema());
  delete (schema.$defs as JsonObject).theme;
  const result = generateA2UIV091Prompt({
    catalogs: [{ catalogId: LABEL_CATALOG_ID, schema }],
  });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.error.code, "CATALOG_INVALID");
  assert.equal(result.error.code === "CATALOG_INVALID" && result.error.cause?.code, "THEME_SCHEMA_NOT_FOUND");
});

test("registering the same catalog twice returns CATALOG_INVALID", () => {
  const result = generateA2UIV091Prompt({
    catalogs: [labelCatalog(), labelCatalog()],
  });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.error.code, "CATALOG_INVALID");
  assert.equal(
    result.error.code === "CATALOG_INVALID" && result.error.cause?.code,
    "CATALOG_ALREADY_REGISTERED",
  );
});

test("an empty catalog list returns CATALOG_INVALID", () => {
  const result = generateA2UIV091Prompt({ catalogs: [] });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.error.code, "CATALOG_INVALID");
});

test("a duplicate action name returns ACTION_NAME_INVALID", () => {
  const result = generateA2UIV091Prompt({
    catalogs: [labelCatalog()],
    actions: [
      { name: "submit", description: "First." },
      { name: "submit", description: "Second." },
    ],
  });
  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "ACTION_NAME_INVALID",
      message: 'Action name "submit" is declared more than once.',
      actionName: "submit",
      reason: "duplicate",
    },
  });
});

test("an empty action name returns ACTION_NAME_INVALID", () => {
  const result = generateA2UIV091Prompt({
    catalogs: [labelCatalog()],
    actions: [{ name: "   ", description: "Blank." }],
  });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.error.code, "ACTION_NAME_INVALID");
  assert.equal(result.error.code === "ACTION_NAME_INVALID" && result.error.reason, "empty");
});

test("generating the prompt for the Basic catalog succeeds and lists all 18 components", () => {
  const result = generateA2UIV091Prompt({ catalogs: [basicCatalog()] });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  const headings = result.value.text.match(/^### .+$/gm) ?? [];
  assert.equal(headings.length, 18);
  for (const name of BASIC_COMPONENT_NAMES) {
    assert.ok(headings.includes(`### ${name}`), `${name} is listed`);
  }
});

test("component properties show type, requiredness, enum values, binding and description", () => {
  const text = textOf({ catalogs: [basicCatalog()] });
  assert.ok(
    text.includes("- `text`: string; required; binding allowed."),
    "a DynamicString property is typed as a string and marked as bindable",
  );
  assert.ok(
    text.includes('- `variant`: string; optional; enum "default", "primary", "borderless".'),
    "enum values are listed",
  );
  assert.ok(
    text.includes("- `url`: string; required; binding allowed. The URL of the audio to be played."),
    "the property description is included",
  );
});

test("the envelope names the catalog id, the root id, and the four message types", () => {
  const text = textOf({ catalogs: [basicCatalog()] });
  for (const message of ["createSurface", "updateComponents", "updateDataModel", "deleteSurface"]) {
    assert.ok(text.includes(`\`${message}\``), `${message} is documented`);
  }
  assert.ok(text.includes(`"${BASIC_CATALOG_ID}"`));
  assert.ok(text.includes('rooted at the component with id `"root"`'));
  assert.ok(text.includes('"version": "v0.9.1"'));
  assert.ok(text.includes("JSON Lines"));
  const envelope = generateA2UIV091Prompt({ catalogs: [basicCatalog()] });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) throw new Error("unreachable");
  const envelopeText = envelope.value.sections.find((s) => s.id === "envelope")!.text;
  assert.ok(!envelopeText.includes("<"), "the envelope contains no OpenUI-style markup");
});

test("the envelope lists every registered catalog id", () => {
  const text = textOf({ catalogs: [labelCatalog(), basicCatalog()] });
  assert.ok(text.includes(`"${LABEL_CATALOG_ID}"`));
  assert.ok(text.includes(`"${BASIC_CATALOG_ID}"`));
});

test("host actions are listed with descriptions and canonical context, and no other names are allowed", () => {
  const text = textOf({
    catalogs: [labelCatalog()],
    actions: [
      { name: "submit", description: "Submit the form.", context: { b: { path: "/x" }, a: 1 } },
      { name: "cancel", description: "Cancel the form." },
    ],
  });
  assert.ok(
    text.includes('- `submit`: Submit the form. Context: {"a":1,"b":{"path":"/x"}}.'),
    "context keys are sorted and bindings are kept",
  );
  assert.ok(text.includes("- `cancel`: Cancel the form. Context: none."));
  assert.ok(text.includes("No other action names are allowed."));
});

test("with no host actions the prompt states that no action names are allowed", () => {
  const text = textOf({ catalogs: [labelCatalog()] });
  assert.ok(
    text.includes("No host actions are declared. Do not emit any action event; no action names are allowed."),
  );
});

test("edit mode adds the incremental update rules and create mode does not", () => {
  const editSentence =
    "Emit only changed components with `updateComponents` (upsert by id) and data changes with `updateDataModel`. Do not re-send unchanged components or recreate the surface.";
  const create = textOf({ catalogs: [labelCatalog()] });
  const createExplicit = textOf({ catalogs: [labelCatalog()], mode: "create" });
  const edit = textOf({ catalogs: [labelCatalog()], mode: "edit" });
  assert.equal(create, createExplicit, "mode defaults to create");
  assert.ok(!create.includes(editSentence));
  assert.ok(edit.includes(editSentence));
});

test("sections appear in the fixed order, with edit mode before examples", () => {
  assert.deepEqual(sectionIds({ catalogs: [labelCatalog()], examples: [{ title: "x", messages: [] }] }), [
    "envelope",
    "components",
    "functions",
    "actions",
    "examples",
  ]);
  assert.deepEqual(
    sectionIds({ catalogs: [labelCatalog()], mode: "edit", examples: [{ title: "x", messages: [] }] }),
    ["envelope", "components", "functions", "actions", "edit", "examples"],
  );
});

test("each section's text is joined in order to form the full prompt", () => {
  const result = generateA2UIV091Prompt({ catalogs: [labelCatalog()] });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(
    result.value.text,
    result.value.sections.map((section) => section.text).join("\n\n"),
  );
});

test("examples are rendered as JSONL blocks with sorted keys", () => {
  const text = textOf({
    catalogs: [labelCatalog()],
    examples: [
      {
        title: "Greeting",
        messages: [
          { version: "v0.9.1", createSurface: { surfaceId: "main", catalogId: LABEL_CATALOG_ID } },
          { version: "v0.9.1", deleteSurface: { surfaceId: "main" } },
        ],
      },
    ],
  });
  assert.ok(text.includes("### Greeting\n```jsonl\n"));
  assert.ok(
    text.includes(
      `\`\`\`jsonl\n{"createSurface":{"catalogId":"${LABEL_CATALOG_ID}","surfaceId":"main"},"version":"v0.9.1"}\n{"deleteSurface":{"surfaceId":"main"},"version":"v0.9.1"}\n\`\`\``,
    ),
  );
});

test("the generator does not mutate its input", () => {
  const catalog = basicCatalog();
  const before = cloneJson(catalog.schema);
  const context: JsonObject = { b: 1, a: 2 };
  const contextBefore = cloneJson(context);
  generateA2UIV091Prompt({
    catalogs: [catalog],
    actions: [{ name: "submit", description: "Submit.", context }],
  });
  assert.deepEqual(catalog.schema, before);
  assert.deepEqual(context, contextBefore);
  assert.deepEqual(Object.keys(context), ["b", "a"]);
});

import assert from "node:assert/strict";
import { test } from "node:test";

import { A2UI_V091_BASIC_CATALOG_ID, createBasicCatalogV091Registration } from "../basic-catalog/index.js";
import type { CatalogRegistration } from "../catalog/index.js";
import { cloneJson } from "../data-model/clone.js";
import type { FunctionRegistration } from "../functions/index.js";
import type { JsonObject } from "../protocol/index.js";
import { createWeaverRuntime } from "../runtime/index.js";
import {
  A2UI_V091_BASIC_PROMPT_EXAMPLES,
  generateA2UIV091Prompt,
  type A2UIV091PromptExample,
  type A2UIV091PromptExampleInvalidError,
  type A2UIV091PromptConfig,
  type A2UIV091PromptResult,
} from "./index.js";

const BASIC = A2UI_V091_BASIC_CATALOG_ID;

function basicCatalog(): CatalogRegistration {
  return createBasicCatalogV091Registration();
}

function create(surfaceId: string, catalogId = BASIC): JsonObject {
  return { version: "v0.9.1", createSurface: { surfaceId, catalogId } };
}

function components(surfaceId: string, list: JsonObject[]): JsonObject {
  return { version: "v0.9.1", updateComponents: { surfaceId, components: list } };
}

/** A small valid example: one Text component at the root. */
function validExample(title = "Valid"): A2UIV091PromptExample {
  return {
    title,
    messages: [
      create("main"),
      components("main", [{ id: "root", component: "Text", text: "Hello" }]),
    ],
  };
}

function generate(config: A2UIV091PromptConfig): A2UIV091PromptResult {
  return generateA2UIV091Prompt(config);
}

/** Asserts the result is an EXAMPLE_INVALID error and returns it. */
function invalid(result: A2UIV091PromptResult): A2UIV091PromptExampleInvalidError {
  assert.equal(result.ok, false, "expected the example to be rejected");
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.error.code, "EXAMPLE_INVALID");
  if (result.error.code !== "EXAMPLE_INVALID") throw new Error("unreachable");
  return result.error;
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** The JSONL line the generator prints for a message: keys sorted at every level. */
function jsonlLine(message: unknown): string {
  return JSON.stringify(sortKeysDeep(message));
}

test("an unknown component returns EXAMPLE_INVALID with the example and message index", () => {
  const error = invalid(
    generate({
      catalogs: [basicCatalog()],
      examples: [
        validExample("Good"),
        {
          title: "Bad",
          messages: [create("main"), components("main", [{ id: "root", component: "Gizmo" }])],
        },
      ],
    }),
  );
  assert.equal(error.exampleIndex, 1);
  assert.equal(error.exampleTitle, "Bad");
  assert.equal(error.stage, "process");
  assert.ok(error.stage === "process");
  assert.equal(error.messageIndex, 1);
  assert.equal(error.cause.code, "CATALOG_REGISTRY_ERROR");
  assert.match(error.message, /^Example 1 \("Bad"\) message 1 is rejected: /);
});

test("a property of the wrong type returns EXAMPLE_INVALID with the example and message index", () => {
  const error = invalid(
    generate({
      catalogs: [basicCatalog()],
      examples: [
        {
          title: "Wrong type",
          messages: [
            create("main"),
            components("main", [{ id: "root", component: "Text", text: 42 }]),
          ],
        },
      ],
    }),
  );
  assert.equal(error.exampleIndex, 0);
  assert.ok(error.stage === "process");
  assert.equal(error.messageIndex, 1);
  assert.equal(error.cause.code, "CATALOG_REGISTRY_ERROR");
  assert.ok(error.cause.code === "CATALOG_REGISTRY_ERROR");
  assert.equal(error.cause.catalogError.code, "COMPONENT_VALIDATION_FAILED");
});

test("a value outside an enum returns EXAMPLE_INVALID at the message that set it", () => {
  const error = invalid(
    generate({
      catalogs: [basicCatalog()],
      examples: [
        {
          title: "Bad enum",
          messages: [
            create("main"),
            components("main", [{ id: "root", component: "Text", text: "a", variant: "huge" }]),
          ],
        },
      ],
    }),
  );
  assert.ok(error.stage === "process");
  assert.equal(error.messageIndex, 1);
});

test("a surface that never gets a root returns EXAMPLE_INVALID at the resolve stage", () => {
  const error = invalid(
    generate({
      catalogs: [basicCatalog()],
      examples: [
        {
          title: "No root",
          messages: [create("main"), components("main", [{ id: "x", component: "Text", text: "a" }])],
        },
      ],
    }),
  );
  assert.equal(error.exampleIndex, 0);
  assert.equal(error.stage, "resolve");
  assert.ok(error.stage === "resolve");
  assert.equal(error.surfaceId, "main");
  assert.ok(error.cause.code === "SURFACE_NOT_READY");
  assert.equal(error.cause.treeReady, false);
});

test("a dangling child id returns EXAMPLE_INVALID with the missing reference in its issues", () => {
  const error = invalid(
    generate({
      catalogs: [basicCatalog()],
      examples: [
        {
          title: "Dangling",
          messages: [
            create("main"),
            components("main", [{ id: "root", component: "Card", child: "missing" }]),
          ],
        },
      ],
    }),
  );
  assert.equal(error.stage, "resolve");
  assert.ok(error.stage === "resolve");
  assert.ok(error.cause.code === "SURFACE_NOT_READY");
  assert.deepEqual(
    error.cause.issues.tree.map((issue) => issue.code),
    ["MISSING_COMPONENT_REFERENCE"],
  );
});

test("a tree deeper than the resolution budget returns EXAMPLE_INVALID at the resolve stage", () => {
  const chain: JsonObject[] = [];
  for (let index = 0; index < 34; index += 1) {
    chain.push({
      id: index === 0 ? "root" : `c${index}`,
      component: "Column",
      children: index === 33 ? [] : [`c${index + 1}`],
    });
  }
  const error = invalid(
    generate({
      catalogs: [basicCatalog()],
      examples: [{ title: "Too deep", messages: [create("main"), components("main", chain)] }],
    }),
  );
  assert.equal(error.stage, "resolve");
  assert.ok(error.stage === "resolve");
  assert.ok(error.cause.code === "COMPONENT_TREE_RESOLUTION_FAILED");
  assert.equal(error.cause.cause.code, "RESOLUTION_BUDGET_EXCEEDED");
});

test("a message for a surface that was never created returns EXAMPLE_INVALID at message 0", () => {
  const error = invalid(
    generate({
      catalogs: [basicCatalog()],
      examples: [
        {
          title: "No create",
          messages: [components("main", [{ id: "root", component: "Text", text: "a" }])],
        },
      ],
    }),
  );
  assert.equal(error.exampleIndex, 0);
  assert.ok(error.stage === "process");
  assert.equal(error.messageIndex, 0);
  assert.equal(error.cause.code, "SURFACE_STORE_ERROR");
});

test("the first failing example is the one reported", () => {
  const error = invalid(
    generate({
      catalogs: [basicCatalog()],
      examples: [
        validExample("Good"),
        { title: "First bad", messages: [components("main", [])] },
        { title: "Second bad", messages: [components("other", [])] },
      ],
    }),
  );
  assert.equal(error.exampleIndex, 1);
  assert.equal(error.exampleTitle, "First bad");
});

test("when the scratch runtime cannot be created the example is rejected at the runtime stage", () => {
  const registration = basicCatalog();
  const functionRegistration = (): FunctionRegistration => ({
    catalogId: BASIC,
    name: "required",
    effect: "pure",
    implementation: () => true,
  });
  const error = invalid(
    generate({
      catalogs: [registration],
      functions: [functionRegistration(), functionRegistration()],
      examples: [validExample()],
    }),
  );
  assert.equal(error.exampleIndex, 0);
  assert.equal(error.stage, "runtime");
  assert.ok(error.stage === "runtime");
  assert.equal(error.cause.code, "FUNCTION_CONFIGURATION_FAILED");
});

test("without examples no scratch runtime is built, so the function check is not run", () => {
  const registration = basicCatalog();
  const functionRegistration = (): FunctionRegistration => ({
    catalogId: BASIC,
    name: "required",
    effect: "pure",
    implementation: () => true,
  });
  const result = generate({
    catalogs: [registration],
    functions: [functionRegistration(), functionRegistration()],
  });
  assert.equal(result.ok, true);
});

test("the shipped Basic examples pass the validator", () => {
  const result = generate({ catalogs: [basicCatalog()], examples: A2UI_V091_BASIC_PROMPT_EXAMPLES });
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.error));
});

test("there are two or three shipped Basic examples", () => {
  assert.ok(A2UI_V091_BASIC_PROMPT_EXAMPLES.length >= 2);
  assert.ok(A2UI_V091_BASIC_PROMPT_EXAMPLES.length <= 3);
});

test("every shipped Basic example appears in the output, in order, with its messages", () => {
  const result = generate({ catalogs: [basicCatalog()], examples: A2UI_V091_BASIC_PROMPT_EXAMPLES });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  const text = result.value.text;
  let cursor = text.indexOf("## Examples");
  assert.ok(cursor >= 0);
  for (const example of A2UI_V091_BASIC_PROMPT_EXAMPLES) {
    const heading = text.indexOf(`### ${example.title}\n\`\`\`jsonl\n`, cursor);
    assert.ok(heading > cursor, `example "${example.title}" is missing or out of order`);
    const block = example.messages.map(jsonlLine).join("\n");
    assert.ok(
      text.startsWith(`### ${example.title}\n\`\`\`jsonl\n${block}\n\`\`\``, heading),
      `example "${example.title}" does not print its messages`,
    );
    cursor = heading;
  }
});

test("each shipped Basic example passes in a runtime of its own", () => {
  for (const example of A2UI_V091_BASIC_PROMPT_EXAMPLES) {
    const created = createWeaverRuntime({ catalogs: [basicCatalog()] });
    assert.equal(created.ok, true);
    if (!created.ok) throw new Error("unreachable");
    const runtime = created.value;
    for (const [index, result] of runtime.processMany(example.messages).entries()) {
      assert.equal(result.ok, true, `"${example.title}" message ${index} was rejected`);
    }
    const surfaceIds = example.messages
      .filter((message): message is { createSurface: { surfaceId: string } } =>
        typeof message === "object" && message !== null && "createSurface" in message,
      )
      .map((message) => message.createSurface.surfaceId);
    for (const surfaceId of surfaceIds) {
      const resolved = runtime.resolveSurface(surfaceId);
      assert.equal(resolved.ok, true, `"${example.title}" surface ${surfaceId} does not resolve`);
      if (!resolved.ok) throw new Error("unreachable");
      assert.equal(resolved.value.tree.ready, true);
      assert.equal(resolved.value.checks.ready, true);
    }
  }
});

test("a failing example returns no prompt text and leaves the caller's input unchanged", () => {
  const catalog = basicCatalog();
  const catalogBefore = cloneJson(catalog.schema);
  const examples: A2UIV091PromptExample[] = [
    {
      title: "Bad",
      messages: [create("main"), components("main", [{ id: "root", component: "Gizmo" }])],
    },
  ];
  const examplesBefore: unknown = JSON.parse(JSON.stringify(examples));

  const result = generate({ catalogs: [catalog], examples });

  assert.equal(result.ok, false);
  assert.equal("value" in result, false);
  assert.deepEqual(catalog.schema, catalogBefore);
  assert.deepEqual(examples, examplesBefore);
});

test("a surface created by one example is not visible to a later example", () => {
  const error = invalid(
    generate({
      catalogs: [basicCatalog()],
      examples: [
        validExample("Creates main"),
        {
          title: "Relies on main",
          messages: [components("main", [{ id: "root", component: "Text", text: "a" }])],
        },
      ],
    }),
  );
  assert.equal(error.exampleIndex, 1);
  assert.ok(error.stage === "process");
  assert.equal(error.messageIndex, 0);
  assert.equal(error.cause.code, "SURFACE_STORE_ERROR");
});

test("validation keeps no state between generations", () => {
  const catalogs = [basicCatalog()];
  const relies: A2UIV091PromptExample = {
    title: "Relies on main",
    messages: [components("main", [{ id: "root", component: "Text", text: "a" }])],
  };

  const first = generate({ catalogs, examples: [validExample()] });
  assert.equal(first.ok, true);
  const second = generate({ catalogs, examples: [relies] });
  invalid(second);

  const repeat = generate({ catalogs, examples: [validExample()] });
  assert.deepEqual(repeat, first);
});

test("generating with the shipped examples twice gives identical output", () => {
  const config: A2UIV091PromptConfig = {
    catalogs: [basicCatalog()],
    examples: A2UI_V091_BASIC_PROMPT_EXAMPLES,
  };
  assert.deepEqual(generate(config), generate(config));
});

test("shipped Basic examples are frozen at every depth", () => {
  const unfrozen: string[] = [];
  let visited = 0;
  const visit = (value: unknown, path: string): void => {
    if (value === null || typeof value !== "object") return;
    visited += 1;
    if (!Object.isFrozen(value)) unfrozen.push(path);
    for (const [key, child] of Object.entries(value)) visit(child, `${path}/${key}`);
  };
  visit(A2UI_V091_BASIC_PROMPT_EXAMPLES, "");
  assert.deepEqual(unfrozen, []);
  assert.ok(visited > 3 * 10, `expected the examples and their messages, visited ${visited} objects`);
});

test("shipped Basic examples reject mutation and stay unchanged", () => {
  const example = A2UI_V091_BASIC_PROMPT_EXAMPLES[0]!;
  const before = JSON.stringify(A2UI_V091_BASIC_PROMPT_EXAMPLES);
  assert.throws(() => {
    (example as { title: string }).title = "changed";
  }, TypeError);
  assert.throws(() => {
    (example.messages as unknown[]).push({});
  }, TypeError);
  assert.throws(() => {
    (example.messages[0] as Record<string, unknown>).version = "v0.0";
  }, TypeError);
  assert.equal(JSON.stringify(A2UI_V091_BASIC_PROMPT_EXAMPLES), before);
});

test("the shipped Basic examples generate a prompt without changing their input", () => {
  const before = JSON.stringify(A2UI_V091_BASIC_PROMPT_EXAMPLES);
  const result = generateA2UIV091Prompt({
    catalogs: [basicCatalog()],
    examples: A2UI_V091_BASIC_PROMPT_EXAMPLES,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.value.sections.some((section) => section.id === "examples"));
  assert.equal(JSON.stringify(A2UI_V091_BASIC_PROMPT_EXAMPLES), before);
});

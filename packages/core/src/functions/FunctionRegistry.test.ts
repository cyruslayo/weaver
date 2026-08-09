import assert from "node:assert/strict";
import { test } from "node:test";
import { CatalogRegistry } from "../catalog/index.js";
import type { JsonObject } from "../protocol/index.js";
import { FunctionRegistry } from "./FunctionRegistry.js";

const dynamic = (type: string): JsonObject => ({
  oneOf: [
    { type },
    { $ref: "#/$defs/PathBinding" },
    { $ref: "#/$defs/FunctionCall" },
  ],
});

function functionSchema(name: string, returnType: string, args: JsonObject = {}): JsonObject {
  return {
    type: "object",
    properties: {
      call: { const: name },
      args: { type: "object", properties: args, required: Object.keys(args), additionalProperties: false },
      returnType: { const: returnType },
    },
    required: ["call", "args"],
    additionalProperties: false,
  };
}

function schema(catalogId: string, functions: JsonObject): JsonObject {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    catalogId,
    components: { Text: { type: "object" } },
    functions,
    $defs: {
      theme: { type: "object" },
      PathBinding: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
      FunctionCall: {
        type: "object",
        properties: { call: { type: "string" }, args: { type: "object" }, returnType: { enum: ["string", "number", "boolean", "array", "object", "any", "void"] } },
        required: ["call", "args"],
        additionalProperties: false,
      },
    },
  };
}

function registry(catalogId = "catalog-a", functions: JsonObject = {
  echo: functionSchema("echo", "string", { value: dynamic("string") }),
}) {
  const catalogs = new CatalogRegistry();
  assert.equal(catalogs.register({ catalogId, schema: schema(catalogId, functions) }).ok, true);
  return { catalogs, functions: new FunctionRegistry(catalogs) };
}

function code(result: { ok: true } | { ok: false; error: { code: string } }): string {
  assert.equal(result.ok, false);
  return result.ok ? "" : result.error.code;
}

test("finds only functions declared by the selected catalog", () => {
  const { catalogs } = registry();
  assert.equal(catalogs.hasFunction("catalog-a", "echo"), true);
  assert.equal(catalogs.hasFunction("catalog-a", "missing"), false);
  assert.equal(code(catalogs.validateFunctionCall("catalog-a", { call: "missing", args: {} })), "FUNCTION_NOT_ALLOWED");
});

test("registers declared implementations and exposes metadata only in list", () => {
  const { functions } = registry();
  const implementation = () => "ok";
  const result = functions.register({ catalogId: "catalog-a", name: "echo", implementation });
  assert.equal(result.ok, true);
  assert.deepEqual(functions.list("catalog-a"), [{ catalogId: "catalog-a", name: "echo", returnType: "string" }]);
  assert.equal(functions.list("catalog-a")[0] && "implementation" in functions.list("catalog-a")[0]!, false);
});

test("rejects undeclared and duplicate implementations", () => {
  const { functions } = registry();
  assert.equal(code(functions.register({ catalogId: "catalog-a", name: "mystery", implementation: () => null })), "FUNCTION_NOT_ALLOWED");
  assert.equal(functions.register({ catalogId: "catalog-a", name: "echo", implementation: () => "first" }).ok, true);
  assert.equal(code(functions.register({ catalogId: "catalog-a", name: "echo", implementation: () => "second" })), "FUNCTION_IMPLEMENTATION_ALREADY_REGISTERED");
});

test("keeps same-named implementations isolated by catalog", () => {
  const first = registry("catalog-a");
  const second = registry("catalog-b");
  assert.equal(first.functions.register({ catalogId: "catalog-a", name: "echo", implementation: () => "a" }).ok, true);
  assert.equal(second.functions.register({ catalogId: "catalog-b", name: "echo", implementation: () => "b" }).ok, true);
  assert.equal(first.functions.has("catalog-a", "echo"), true);
  assert.equal(first.functions.has("catalog-b", "echo"), false);
});

test("returns function metadata with any fallback when returnType.const is absent", () => {
  const { catalogs } = registry("catalog-a", { loose: { type: "object", properties: { call: { const: "loose" }, args: { type: "object" } } } });
  const definition = catalogs.getFunctionDefinition("catalog-a", "loose");
  assert.equal(definition.ok, true);
  if (definition.ok) assert.equal(definition.value.returnType, "any");
});

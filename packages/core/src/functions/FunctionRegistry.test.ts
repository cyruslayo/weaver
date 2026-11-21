import assert from "node:assert/strict";
import { test } from "node:test";
import { CatalogRegistry } from "../catalog/index.js";
import type { JsonObject } from "../protocol/index.js";
import { catalogDocument, componentSchema, functionSchema, ref } from "./catalogFixtures.test-helper.js";
import { FunctionRegistry } from "./FunctionRegistry.js";

function registry(catalogId = "catalog-a", functions: JsonObject = {
  echo: functionSchema("echo", { returnType: "string", args: { value: ref("DynamicString") } }),
  open: functionSchema("open", { returnType: "void", args: { url: ref("DynamicString") }, requiresUserActivation: true }),
  tool: functionSchema("tool", { returnType: "string", allowedCallers: "agentOnly" }),
}) {
  const catalogs = new CatalogRegistry();
  const schema = catalogDocument(catalogId, { Text: componentSchema("Text", {}) }, functions);
  assert.equal(catalogs.register({ catalogId, schema }).ok, true);
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
  assert.equal(code(catalogs.validateFunctionCall("catalog-a", { "@call": "missing", args: {} })), "FUNCTION_NOT_ALLOWED");
});

test("registers declared implementations and exposes metadata only in list", () => {
  const { functions } = registry();
  const implementation = () => "ok";
  const result = functions.register({ catalogId: "catalog-a", name: "echo", effect: "pure", implementation });
  assert.equal(result.ok, true);
  assert.deepEqual(functions.list("catalog-a"), [{ catalogId: "catalog-a", name: "echo", returnType: "string", effect: "pure" }]);
  assert.equal(functions.list("catalog-a")[0] && "implementation" in functions.list("catalog-a")[0]!, false);
});

test("rejects undeclared and duplicate implementations", () => {
  const { functions } = registry();
  assert.equal(code(functions.register({ catalogId: "catalog-a", name: "mystery", effect: "pure", implementation: () => null })), "FUNCTION_NOT_ALLOWED");
  assert.equal(functions.register({ catalogId: "catalog-a", name: "echo", effect: "pure", implementation: () => "first" }).ok, true);
  assert.equal(code(functions.register({ catalogId: "catalog-a", name: "echo", effect: "pure", implementation: () => "second" })), "FUNCTION_IMPLEMENTATION_ALREADY_REGISTERED");
});

test("keeps same-named implementations isolated by catalog", () => {
  const first = registry("catalog-a");
  const second = registry("catalog-b");
  assert.equal(first.functions.register({ catalogId: "catalog-a", name: "echo", effect: "pure", implementation: () => "a" }).ok, true);
  assert.equal(second.functions.register({ catalogId: "catalog-b", name: "echo", effect: "pure", implementation: () => "b" }).ok, true);
  assert.equal(first.functions.has("catalog-a", "echo"), true);
  assert.equal(first.functions.has("catalog-b", "echo"), false);
});

test("a catalog function definition must declare its returnType", () => {
  const catalogs = new CatalogRegistry();
  const schema = catalogDocument("catalog-a", { Text: componentSchema("Text", {}) }, {
    loose: { type: "object", properties: { "@call": { const: "loose" }, args: { type: "object" } }, required: ["@call"] },
  });
  assert.equal(catalogs.register({ catalogId: "catalog-a", schema }).ok, false);
});

test("definition metadata exposes allowedCallers and requiresUserActivation", () => {
  const { catalogs } = registry();
  const echo = catalogs.getFunctionDefinition("catalog-a", "echo");
  assert.equal(echo.ok && echo.value.allowedCallers, "rendererOnly");
  assert.equal(echo.ok && echo.value.requiresUserActivation, false);
  const open = catalogs.getFunctionDefinition("catalog-a", "open");
  assert.equal(open.ok && open.value.requiresUserActivation, true);
  const tool = catalogs.getFunctionDefinition("catalog-a", "tool");
  assert.equal(tool.ok && tool.value.allowedCallers, "agentOnly");
});

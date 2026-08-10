import assert from "node:assert/strict";
import { test } from "node:test";
import { CatalogRegistry } from "../catalog/index.js";
import { DataContext } from "../data-context/index.js";
import { FunctionEvaluator, FunctionRegistry } from "../functions/index.js";
import type { JsonObject } from "../protocol/index.js";
import { ActionContextResolver } from "./ActionContextResolver.js";

const fn = (name: string, returnType: string): JsonObject => ({ type: "object", properties: { call: { const: name }, args: { type: "object" }, returnType: { const: returnType } }, required: ["call", "args"], additionalProperties: false });
function setup() {
  const catalogs = new CatalogRegistry();
  assert.equal(catalogs.register({ catalogId: "test", schema: { $schema: "https://json-schema.org/draft/2020-12/schema", catalogId: "test", components: { X: { type: "object" } }, functions: { value: fn("value", "any"), voider: fn("voider", "void"), failing: fn("failing", "string") }, $defs: { theme: { type: "object" } } } }).ok, true);
  const functions = new FunctionRegistry(catalogs);
  let voidCount = 0;
  functions.register({ catalogId: "test", name: "value", effect: "pure", implementation: () => null });
  functions.register({ catalogId: "test", name: "voider", effect: "pure", implementation: () => { voidCount++; } });
  functions.register({ catalogId: "test", name: "failing", effect: "pure", implementation: () => { throw new Error(); } });
  return { resolver: new ActionContextResolver(catalogs, new FunctionEvaluator(catalogs, functions)), voidCount: () => voidCount };
}

test("resolves literals, bindings, and non-void functions while preserving null", () => {
  const { resolver } = setup();
  const root = DataContext.root({ items: [{ id: 1 }, { id: 2 }], company: "weaver" });
  const scoped = root.createCollectionItemContext("/items", 1); assert.equal(scoped.ok, true);
  if (!scoped.ok) return;
  const result = resolver.resolve("test", { string: "x", number: 2, boolean: true, array: [{ path: "literal" }], relative: { path: "id" }, absolute: { path: "/company" }, function: { call: "value", args: {} } }, scoped.value);
  assert.deepEqual(result, { ok: true, value: { string: "x", number: 2, boolean: true, array: [{ path: "literal" }], relative: 2, absolute: "weaver", function: null } });
});

test("rejects void before execution and preserves function failures", () => {
  const { resolver, voidCount } = setup();
  const voidResult = resolver.resolve("test", { effect: { call: "voider", args: {} } }, DataContext.root({}));
  assert.equal(!voidResult.ok && voidResult.error.code, "ACTION_CONTEXT_VOID_FUNCTION");
  assert.equal(voidCount(), 0);
  const failed = resolver.resolve("test", { value: { call: "failing", args: {} } }, DataContext.root({}));
  assert.equal(!failed.ok && failed.error.code, "ACTION_CONTEXT_RESOLUTION_FAILED");
  if (!failed.ok && failed.error.code === "ACTION_CONTEXT_RESOLUTION_FAILED") assert.equal(failed.error.cause?.code, "FUNCTION_EXECUTION_FAILED");
});

test("missing binding blocks atomically without returning partial context", () => {
  const { resolver } = setup();
  const result = resolver.resolve("test", { first: "resolved", missing: { path: "/none" }, last: true }, DataContext.root({}));
  assert.deepEqual(result, { ok: false, error: { code: "ACTION_CONTEXT_VALUE_UNAVAILABLE", message: "Event context value is unavailable", key: "missing" } });
});

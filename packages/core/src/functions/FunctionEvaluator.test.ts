import assert from "node:assert/strict";
import { test } from "node:test";
import { CatalogRegistry } from "../catalog/index.js";
import { DataContext } from "../data-context/index.js";
import type { JsonObject } from "../protocol/index.js";
import { FunctionEvaluator } from "./FunctionEvaluator.js";
import { FunctionRegistry } from "./FunctionRegistry.js";

const ref = (name: string): JsonObject => ({ $ref: `#/$defs/${name}` });

function fn(name: string, returnType: string, args: JsonObject = {}, required = Object.keys(args)): JsonObject {
  return {
    type: "object",
    properties: {
      call: { const: name },
      args: { type: "object", properties: args, required, additionalProperties: false },
      returnType: { const: returnType },
    },
    required: ["call", "args"],
    additionalProperties: false,
  };
}

const dynamic = (name: string): JsonObject => ref(name);

function catalogSchema(catalogId: string): JsonObject {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    catalogId,
    components: { Text: { type: "object" } },
    functions: {
      echo: fn("echo", "string", { value: dynamic("DynamicString") }),
      passthrough: fn("passthrough", "any", { value: dynamic("DynamicString") }),
      consumeMissing: fn("consumeMissing", "void", { value: dynamic("DynamicString") }),
      concat: fn("concat", "string", { left: dynamic("DynamicString"), right: dynamic("DynamicString") }),
      sum: fn("sum", "number", { values: { type: "array", items: dynamic("DynamicNumber") } }),
      all: fn("all", "array", { values: { type: "array", items: dynamic("DynamicBoolean") } }),
      outer: fn("outer", "string", { value: dynamic("DynamicValue") }),
      config: fn("config", "string", { config: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false } }),
      stringResult: fn("stringResult", "string"),
      numberResult: fn("numberResult", "number"),
      booleanResult: fn("booleanResult", "boolean"),
      arrayResult: fn("arrayResult", "array"),
      objectResult: fn("objectResult", "object"),
      anyResult: fn("anyResult", "any"),
      voidResult: fn("voidResult", "void"),
      wrong: fn("wrong", "boolean"),
      unsafe: fn("unsafe", "any"),
      unsafeNaN: fn("unsafeNaN", "any"),
      unsafeInfinity: fn("unsafeInfinity", "any"),
      unsafeFunction: fn("unsafeFunction", "any"),
      unsafeClass: fn("unsafeClass", "any"),
      throwing: fn("throwing", "string"),
      allowedButUnimplemented: fn("allowedButUnimplemented", "string"),
      actionEffect: fn("actionEffect", "void"),
      actionOuter: fn("actionOuter", "void", { value: dynamic("DynamicValue") }),
    },
    $defs: {
      theme: { type: "object" },
      DynamicString: { oneOf: [{ type: "string" }, ref("PathBinding"), ref("FunctionCall")] },
      DynamicNumber: { oneOf: [{ type: "number" }, ref("PathBinding"), ref("FunctionCall")] },
      DynamicBoolean: { oneOf: [{ type: "boolean" }, ref("PathBinding"), ref("FunctionCall")] },
      DynamicValue: { oneOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "array" }, ref("FunctionCall")] },
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

function setup(implementations: Record<string, (...args: any[]) => unknown> = {}) {
  const catalogs = new CatalogRegistry();
  assert.equal(catalogs.register({ catalogId: "test", schema: catalogSchema("test") }).ok, true);
  const functions = new FunctionRegistry(catalogs);
  for (const [name, implementation] of Object.entries(implementations)) {
    assert.equal(functions.register({ catalogId: "test", name, effect: "pure", implementation: implementation as any }).ok, true);
  }
  return { evaluator: new FunctionEvaluator(catalogs, functions), data: DataContext.root({ user: { name: "Ada" }, items: [{ name: "one" }, { name: "two" }], checks: [true, false] }) };
}

function errorCode(result: { ok: true } | { ok: false; error: { code: string } }): string {
  assert.equal(result.ok, false);
  return result.ok ? "" : result.error.code;
}

test("validates calls before lookup and execution", () => {
  let executed = false;
  const { evaluator, data } = setup({ echo: () => { executed = true; return "ok"; } });
  assert.equal(errorCode(evaluator.evaluate("test", { call: "echo", args: { value: 4 } }, data)), "FUNCTION_VALIDATION_FAILED");
  assert.equal(executed, false);
  assert.equal(errorCode(evaluator.evaluate("test", { call: "unknown", args: {} }, data)), "FUNCTION_NOT_ALLOWED");
});

test("passes literal arguments unchanged and resolves absolute and relative bindings", () => {
  const received: unknown[] = [];
  const { evaluator, data } = setup({ echo: (args) => { received.push(args.value); return String(args.value); } });
  assert.equal(evaluator.evaluate("test", { call: "echo", args: { value: "literal" } }, data).ok, true);
  assert.equal(evaluator.evaluate("test", { call: "echo", args: { value: { path: "/user/name" } } }, data).ok, true);
  const item = data.createCollectionItemContext("/items", 1);
  assert.equal(item.ok, true);
  if (item.ok) assert.equal(evaluator.evaluate("test", { call: "echo", args: { value: { path: "name" } } }, item.value).ok, true);
  assert.deepEqual(received, ["literal", "Ada", "two"]);
});

test("preserves missing binding as undefined when the function contract permits it", () => {
  let received: unknown = "not-set";
  const { evaluator, data } = setup({ consumeMissing: (args) => { received = args.value; return undefined; } });
  const result = evaluator.evaluate("test", { call: "consumeMissing", args: { value: { path: "/missing" } } }, data);
  assert.deepEqual(result, { ok: true, value: undefined });
  assert.equal(received, undefined);
});

test("evaluates nested calls and array calls in source order", () => {
  const order: string[] = [];
  const { evaluator, data } = setup({
    echo: (args) => { order.push(`echo:${String(args.value)}`); return String(args.value); },
    concat: (args) => `${String(args.left)}${String(args.right)}`,
    sum: (args) => (args.values as number[]).reduce((total, value) => total + value, 0),
    numberResult: () => { order.push("number"); return 2; },
  });
  const nested = evaluator.evaluate("test", { call: "concat", args: {
    left: { call: "echo", args: { value: "inner" } },
    right: "-outer",
  } }, data);
  assert.deepEqual(nested, { ok: true, value: "inner-outer" });
  const array = evaluator.evaluate("test", { call: "sum", args: { values: [1, { call: "numberResult", args: {} }, { call: "numberResult", args: {} }, 3] } }, data);
  assert.deepEqual(array, { ok: true, value: 8 });
  assert.deepEqual(order, ["echo:inner", "number", "number"]);
});

test("preserves literal configuration objects", () => {
  let received: unknown;
  const { evaluator, data } = setup({ config: (args) => { received = args.config; return (args.config as { path: string }).path; } });
  const result = evaluator.evaluate("test", { call: "config", args: { config: { path: "literal-value" } } }, data);
  assert.deepEqual(result, { ok: true, value: "literal-value" });
  assert.deepEqual(received, { path: "literal-value" });
});

test("distinguishes an unimplemented declared function", () => {
  const { evaluator, data } = setup();
  assert.equal(errorCode(evaluator.evaluate("test", { call: "allowedButUnimplemented", args: {} }, data)), "FUNCTION_IMPLEMENTATION_NOT_FOUND");
});

test("uses the catalog contract rather than a caller returnType", () => {
  const { evaluator, data } = setup({ echo: () => "ok" });
  assert.equal(errorCode(evaluator.evaluate("test", { call: "echo", args: { value: "x" }, returnType: "number" }, data)), "FUNCTION_VALIDATION_FAILED");
});

test("validates every supported return type and rejects wrong results", () => {
  const { evaluator, data } = setup({
    stringResult: () => "x", numberResult: () => 2, booleanResult: () => true,
    arrayResult: () => [1], objectResult: () => ({ ok: true }), anyResult: () => null, voidResult: () => undefined,
    wrong: () => "not boolean",
  });
  for (const [name, value] of [["stringResult", "x"], ["numberResult", 2], ["booleanResult", true], ["arrayResult", [1]], ["objectResult", { ok: true }], ["anyResult", null], ["voidResult", undefined]] as const) {
    assert.deepEqual(evaluator.evaluate("test", { call: name, args: {} }, data), { ok: true, value });
  }
  assert.equal(errorCode(evaluator.evaluate("test", { call: "wrong", args: {} }, data)), "FUNCTION_RETURN_TYPE_MISMATCH");
});

test("rejects unsafe results and implementation exceptions without leaking them", () => {
  const { evaluator, data } = setup({
    unsafe: () => new Date(), unsafeNaN: () => Number.NaN, unsafeInfinity: () => Number.POSITIVE_INFINITY,
    unsafeFunction: () => () => true, unsafeClass: () => new (class Unsafe {})(),
    throwing: () => { throw new Error("secret"); },
  });
  for (const name of ["unsafe", "unsafeNaN", "unsafeInfinity", "unsafeFunction", "unsafeClass"]) {
    assert.equal(errorCode(evaluator.evaluate("test", { call: name, args: {} }, data)), "FUNCTION_RETURN_TYPE_MISMATCH");
  }
  const failed = evaluator.evaluate("test", { call: "throwing", args: {} }, data);
  assert.equal(errorCode(failed), "FUNCTION_EXECUTION_FAILED");
  if (!failed.ok) assert.equal("stack" in failed.error, false);
});

test("propagates nested failures and enforces the depth limit", () => {
  const { evaluator, data } = setup({ outer: (args) => String(args.value) });
  const failure = evaluator.evaluate("test", { call: "outer", args: { value: { call: "missing", args: {} } } }, data);
  assert.equal(errorCode(failure), "FUNCTION_NOT_ALLOWED");
});

test("action permission applies only to the root and recursive context remains pure", () => {
  const catalogs = new CatalogRegistry();
  assert.equal(catalogs.register({ catalogId: "test", schema: catalogSchema("test") }).ok, true);
  const functions = new FunctionRegistry(catalogs);
  let effects = 0;
  assert.equal(functions.register({ catalogId: "test", name: "actionEffect", effect: "action", implementation: () => { effects++; } }).ok, true);
  assert.equal(functions.register({
    catalogId: "test", name: "actionOuter", effect: "action",
    implementation: (_args, context) => {
      const nested = context.evaluateFunctionCall({ call: "actionEffect", args: {} });
      if (!nested.ok) context.propagateFunctionFailure(nested.error);
    },
  }).ok, true);
  const evaluator = new FunctionEvaluator(catalogs, functions);
  const data = DataContext.root({});
  assert.equal(errorCode(evaluator.evaluate("test", { call: "actionEffect", args: {} }, data)), "FUNCTION_EFFECT_NOT_ALLOWED");
  assert.equal(effects, 0);
  assert.deepEqual(evaluator.evaluateAction("test", { call: "actionEffect", args: {} }, data), { ok: true, value: undefined });
  assert.equal(effects, 1);
  assert.equal(errorCode(evaluator.evaluateAction("test", {
    call: "actionOuter", args: { value: { call: "actionEffect", args: {} } },
  }, data)), "FUNCTION_EFFECT_NOT_ALLOWED");
  assert.equal(effects, 1);
  assert.equal(errorCode(evaluator.evaluateAction("test", { call: "actionOuter", args: { value: "x" } }, data)), "FUNCTION_EFFECT_NOT_ALLOWED");
  assert.equal(effects, 1);
});

test("supports a configurable depth limit", () => {
  const catalogs = new CatalogRegistry();
  assert.equal(catalogs.register({ catalogId: "test", schema: catalogSchema("test") }).ok, true);
  const functions = new FunctionRegistry(catalogs);
  assert.equal(functions.register({ catalogId: "test", name: "outer", effect: "pure", implementation: (args) => String(args.value) }).ok, true);
  const evaluator = new FunctionEvaluator(catalogs, functions, { maxDepth: 1 });
  const result = evaluator.evaluate("test", { call: "outer", args: { value: { call: "outer", args: { value: "x" } } } }, DataContext.root({}));
  assert.equal(errorCode(result), "FUNCTION_MAX_DEPTH_EXCEEDED");
});

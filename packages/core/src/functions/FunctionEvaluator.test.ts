import assert from "node:assert/strict";
import { test } from "node:test";
import { CatalogRegistry } from "../catalog/index.js";
import { DataContext } from "../data-context/index.js";
import type { JsonObject } from "../protocol/index.js";
import { catalogDocument, functionSchema, ref } from "./catalogFixtures.test-helper.js";
import { FunctionEvaluator } from "./FunctionEvaluator.js";
import { FunctionRegistry } from "./FunctionRegistry.js";

const dynamic = (name: string): JsonObject => ref(name);

const functions: JsonObject = {
  echo: functionSchema("echo", { returnType: "string", args: { value: dynamic("DynamicString") } }),
  passthrough: functionSchema("passthrough", { returnType: "any", args: { value: dynamic("DynamicString") } }),
  consumeMissing: functionSchema("consumeMissing", { returnType: "void", args: { value: dynamic("DynamicString") } }),
  concat: functionSchema("concat", {
    returnType: "string",
    args: { left: dynamic("DynamicString"), right: dynamic("DynamicString") },
  }),
  sum: functionSchema("sum", { returnType: "number", args: { values: { type: "array", items: dynamic("DynamicNumber") } } }),
  all: functionSchema("all", { returnType: "array", args: { values: { type: "array", items: dynamic("DynamicBoolean") } } }),
  outer: functionSchema("outer", { returnType: "string", args: { value: dynamic("DynamicValue") } }),
  config: functionSchema("config", {
    returnType: "string",
    args: { config: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false } },
  }),
  negate: functionSchema("negate", { returnType: "boolean", args: { value: dynamic("DynamicBoolean") } }),
  literalObject: functionSchema("literalObject", { returnType: "object", args: { value: dynamic("DynamicValue") } }),
  stringResult: functionSchema("stringResult", { returnType: "string" }),
  numberResult: functionSchema("numberResult", { returnType: "number" }),
  booleanResult: functionSchema("booleanResult", { returnType: "boolean" }),
  arrayResult: functionSchema("arrayResult", { returnType: "array" }),
  objectResult: functionSchema("objectResult", { returnType: "object" }),
  anyResult: functionSchema("anyResult", { returnType: "any" }),
  voidResult: functionSchema("voidResult", { returnType: "void" }),
  validation: functionSchema("validation", { returnType: "validationResult" }),
  wrong: functionSchema("wrong", { returnType: "boolean" }),
  unsafe: functionSchema("unsafe", { returnType: "any" }),
  throwing: functionSchema("throwing", { returnType: "string" }),
  allowedButUnimplemented: functionSchema("allowedButUnimplemented", { returnType: "string" }),
  actionEffect: functionSchema("actionEffect", { returnType: "void" }),
  actionOuter: functionSchema("actionOuter", { returnType: "void", args: { value: dynamic("DynamicValue") } }),
  agentTool: functionSchema("agentTool", { returnType: "string", allowedCallers: "agentOnly" }),
  openUrl: functionSchema("openUrl", {
    returnType: "void",
    args: { url: dynamic("DynamicString") },
    requiresUserActivation: true,
    allowedCallers: "rendererOnly",
  }),
};

function catalogSchema(catalogId: string): JsonObject {
  return catalogDocument(catalogId, { Text: { type: "object", properties: { component: { const: "Text" } }, required: ["component"] } }, functions);
}

function setup(
  implementations: Record<string, (...args: any[]) => unknown> = {},
  options: { maxDepth?: number } = {},
) {
  const catalogs = new CatalogRegistry();
  assert.equal(catalogs.register({ catalogId: "test", schema: catalogSchema("test") }).ok, true);
  const registry = new FunctionRegistry(catalogs);
  for (const [name, implementation] of Object.entries(implementations)) {
    const effect = name === "actionEffect" || name === "actionOuter" ? "action" : "pure";
    assert.equal(registry.register({ catalogId: "test", name, effect, implementation: implementation as any }).ok, true);
  }
  return {
    catalogs,
    registry,
    evaluator: new FunctionEvaluator(catalogs, registry, options),
    data: DataContext.root({ user: { name: "Ada" }, items: [{ name: "one" }, { name: "two" }], flags: { text: "TRUE" }, check: { valid: false } }),
  };
}

function errorCode(result: { ok: true } | { ok: false; error: { code: string } }): string {
  assert.equal(result.ok, false);
  return result.ok ? "" : result.error.code;
}

test("validates calls before lookup and execution", () => {
  let executed = false;
  const { evaluator, data } = setup({ echo: () => { executed = true; return "ok"; } });
  assert.equal(errorCode(evaluator.evaluate("test", { "@call": "echo", args: { value: 4 } }, data)), "FUNCTION_VALIDATION_FAILED");
  assert.equal(executed, false);
  assert.equal(errorCode(evaluator.evaluate("test", { "@call": "unknown", args: {} }, data)), "FUNCTION_NOT_ALLOWED");
});

test("passes literal arguments unchanged and resolves absolute and relative bindings", () => {
  const received: unknown[] = [];
  const { evaluator, data } = setup({ echo: (args) => { received.push(args.value); return String(args.value); } });
  assert.equal(evaluator.evaluate("test", { "@call": "echo", args: { value: "literal" } }, data).ok, true);
  assert.equal(evaluator.evaluate("test", { "@call": "echo", args: { value: { "@path": "/user/name" } } }, data).ok, true);
  const item = data.createCollectionItemContext("/items", 1);
  assert.equal(item.ok, true);
  if (item.ok) assert.equal(evaluator.evaluate("test", { "@call": "echo", args: { value: { "@path": "name" } } }, item.value).ok, true);
  assert.deepEqual(received, ["literal", "Ada", "two"]);
});

test("the legacy path and call keys are literal data, never bindings", () => {
  const received: unknown[] = [];
  const { evaluator, data } = setup({ literalObject: (args) => { received.push(args.value); return args.value; } });
  const literal = { path: "/user/name" };
  assert.equal(evaluator.evaluate("test", { "@call": "literalObject", args: { value: literal } }, data).ok, true);
  assert.deepEqual(received, [literal]);
});

test("preserves missing binding as undefined when the function contract permits it", () => {
  let received: unknown = "not-set";
  const { evaluator, data } = setup({ consumeMissing: (args) => { received = args.value; return undefined; } });
  const result = evaluator.evaluate("test", { "@call": "consumeMissing", args: { value: { "@path": "/missing" } } }, data);
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
  const nested = evaluator.evaluate("test", {
    "@call": "concat",
    args: { left: { "@call": "echo", args: { value: "inner" } }, right: "-outer" },
  }, data);
  assert.deepEqual(nested, { ok: true, value: "inner-outer" });
  const array = evaluator.evaluate("test", {
    "@call": "sum",
    args: { values: [1, { "@call": "numberResult", args: {} }, { "@call": "numberResult", args: {} }, 3] },
  }, data);
  assert.deepEqual(array, { ok: true, value: 8 });
  assert.deepEqual(order, ["echo:inner", "number", "number"]);
});

test("preserves literal configuration objects", () => {
  let received: unknown;
  const { evaluator, data } = setup({ config: (args) => { received = args.config; return (args.config as { path: string }).path; } });
  const result = evaluator.evaluate("test", { "@call": "config", args: { config: { path: "literal-value" } } }, data);
  assert.deepEqual(result, { ok: true, value: "literal-value" });
  assert.deepEqual(received, { path: "literal-value" });
});

test("distinguishes an unimplemented declared function", () => {
  const { evaluator, data } = setup();
  assert.equal(errorCode(evaluator.evaluate("test", { "@call": "allowedButUnimplemented", args: {} }, data)), "FUNCTION_IMPLEMENTATION_NOT_FOUND");
});

test("uses the catalog contract rather than a caller returnType", () => {
  const { evaluator, data } = setup({ echo: () => "ok" });
  assert.equal(errorCode(evaluator.evaluate("test", { "@call": "echo", args: { value: "x" }, returnType: "number" }, data)), "FUNCTION_VALIDATION_FAILED");
});

test("validates every supported return type and rejects wrong results", () => {
  const { evaluator, data } = setup({
    stringResult: () => "x", numberResult: () => 2, booleanResult: () => true,
    arrayResult: () => [1], objectResult: () => ({ ok: true }), anyResult: () => null, voidResult: () => undefined,
    wrong: () => "not boolean",
  });
  for (const [name, value] of [["stringResult", "x"], ["numberResult", 2], ["booleanResult", true], ["arrayResult", [1]], ["objectResult", { ok: true }], ["anyResult", null], ["voidResult", undefined]] as const) {
    assert.deepEqual(evaluator.evaluate("test", { "@call": name, args: {} }, data), { ok: true, value });
  }
  assert.equal(errorCode(evaluator.evaluate("test", { "@call": "wrong", args: {} }, data)), "FUNCTION_RETURN_TYPE_MISMATCH");
});

test("a validationResult return must carry a boolean valid and well-typed optional fields", () => {
  const valid = { valid: true, code: "OK", message: "fine", severity: "warning" };
  const { evaluator, data } = setup({ validation: () => valid });
  assert.deepEqual(evaluator.evaluate("test", { "@call": "validation", args: {} }, data), { ok: true, value: valid });
  for (const bad of [{ valid: "yes" }, { valid: true, severity: "fatal" }, { valid: true, code: 4 }, { valid: true, message: false }]) {
    const broken = setup({ validation: () => bad });
    assert.equal(errorCode(broken.evaluator.evaluate("test", { "@call": "validation", args: {} }, broken.data)), "FUNCTION_RETURN_TYPE_MISMATCH");
  }
});

test("rejects unsafe results and implementation exceptions without leaking them", () => {
  const { evaluator, data } = setup({
    unsafe: () => new Date(),
    throwing: () => { throw new Error("secret"); },
  });
  assert.equal(errorCode(evaluator.evaluate("test", { "@call": "unsafe", args: {} }, data)), "FUNCTION_RETURN_TYPE_MISMATCH");
  const failed = evaluator.evaluate("test", { "@call": "throwing", args: {} }, data);
  assert.equal(errorCode(failed), "FUNCTION_EXECUTION_FAILED");
  if (!failed.ok) assert.equal("stack" in failed.error, false);
});

test("propagates nested failures from an unknown call", () => {
  const { evaluator, data } = setup({ outer: (args) => String(args.value) });
  const failure = evaluator.evaluate("test", { "@call": "outer", args: { value: { "@call": "missing", args: {} } } }, data);
  assert.equal(errorCode(failure), "FUNCTION_VALIDATION_FAILED");
});

test("action effects run only at the action root and nested calls stay pure", () => {
  let effects = 0;
  const { evaluator, data } = setup({
    actionEffect: () => { effects++; },
    actionOuter: (_args, context) => {
      const nested = context.evaluateFunctionCall({ "@call": "actionEffect", args: {} });
      if (!nested.ok) context.propagateFunctionFailure(nested.error);
    },
  });
  assert.equal(errorCode(evaluator.evaluate("test", { "@call": "actionEffect", args: {} }, data)), "FUNCTION_EFFECT_NOT_ALLOWED");
  assert.equal(effects, 0);
  assert.deepEqual(evaluator.evaluateAction("test", { "@call": "actionEffect", args: {} }, data, { userActivation: false }), { ok: true, value: undefined });
  assert.equal(effects, 1);
  assert.equal(errorCode(evaluator.evaluateAction("test", {
    "@call": "actionOuter", args: { value: { "@call": "actionEffect", args: {} } },
  }, data, { userActivation: false })), "FUNCTION_EFFECT_NOT_ALLOWED");
  assert.equal(effects, 1);
});

test("requiresUserActivation functions run only from a user-gesture action root", () => {
  let opened: unknown;
  const { evaluator, data } = setup({ openUrl: (args) => { opened = args.url; } });
  const call = { "@call": "openUrl", args: { url: "https://example.com" } };
  assert.equal(errorCode(evaluator.evaluate("test", call, data)), "EXPRESSION_ERROR");
  assert.equal(errorCode(evaluator.evaluateAction("test", call, data, { userActivation: false })), "EXPRESSION_ERROR");
  assert.equal(opened, undefined);
  assert.deepEqual(evaluator.evaluateAction("test", call, data, { userActivation: true }), { ok: true, value: undefined });
  assert.equal(opened, "https://example.com");
});

test("user activation is never inherited by a nested call", () => {
  const { evaluator, data } = setup({
    openUrl: () => undefined,
    actionOuter: (_args, context) => {
      const nested = context.evaluateFunctionCall({ "@call": "openUrl", args: { url: "https://example.com" } });
      if (!nested.ok) context.propagateFunctionFailure(nested.error);
    },
  });
  assert.equal(errorCode(evaluator.evaluateAction("test", {
    "@call": "actionOuter", args: { value: "x" },
  }, data, { userActivation: true })), "EXPRESSION_ERROR");
});

test("agentOnly functions cannot be bound to properties or run from renderer actions", () => {
  const { evaluator, data } = setup({ agentTool: () => "agent" });
  assert.equal(errorCode(evaluator.evaluate("test", { "@call": "agentTool", args: {} }, data)), "FUNCTION_CALLER_NOT_ALLOWED");
  assert.equal(errorCode(evaluator.evaluateAction("test", { "@call": "agentTool", args: {} }, data, { userActivation: true })), "FUNCTION_CALLER_NOT_ALLOWED");
});

test("a FunctionCall that declares allowedCallers or returnType is rejected on the wire", () => {
  const { evaluator, data } = setup({ echo: () => "ok" });
  assert.equal(errorCode(evaluator.evaluate("test", { "@call": "echo", args: { value: "x" }, allowedCallers: "agentOnly" }, data)), "FUNCTION_VALIDATION_FAILED");
});

test("a FunctionCall catalogId that differs from the surface catalog is unsupported", () => {
  const { evaluator, data } = setup({ echo: () => "ok" });
  assert.equal(errorCode(evaluator.evaluate("test", { "@call": "echo", args: { value: "x" }, catalogId: "other" }, data)), "UNSUPPORTED_FEATURE");
  assert.deepEqual(evaluator.evaluate("test", { "@call": "echo", args: { value: "x" }, catalogId: "test" }, data), { ok: true, value: "ok" });
});

test("supports a configurable depth limit", () => {
  const { evaluator, data } = setup({ outer: (args) => String(args.value) }, { maxDepth: 1 });
  const result = evaluator.evaluate("test", { "@call": "outer", args: { value: { "@call": "outer", args: { value: "x" } } } }, data);
  assert.equal(errorCode(result), "FUNCTION_MAX_DEPTH_EXCEEDED");
});

test("@index returns the innermost collection index plus the offset", () => {
  const { evaluator, data } = setup({});
  const first = data.createCollectionItemContext("/items", 1);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.deepEqual(evaluator.evaluate("test", { "@call": "@index", args: {} }, first.value), { ok: true, value: 1 });
  assert.deepEqual(evaluator.evaluate("test", { "@call": "@index" }, first.value), { ok: true, value: 1 });
  assert.deepEqual(evaluator.evaluate("test", { "@call": "@index", args: { offset: 1 } }, first.value), { ok: true, value: 2 });
  assert.deepEqual(evaluator.evaluate("test", { "@call": "@index", args: { offset: { "@path": "/offsetBy" } } }, first.value), { ok: false, error: {
    code: "FUNCTION_ARGUMENT_RESOLUTION_FAILED", message: "@index offset must resolve to a finite number", catalogId: "test", functionName: "@index",
  } });
});

test("@index outside a collection template is an execution error", () => {
  const { evaluator, data } = setup({});
  assert.equal(errorCode(evaluator.evaluate("test", { "@call": "@index", args: {} }, data)), "EXECUTION_ERROR");
});

test("@index rejects unknown arguments", () => {
  const { evaluator, data } = setup({});
  const item = data.createCollectionItemContext("/items", 0);
  assert.equal(item.ok, true);
  if (item.ok) assert.equal(errorCode(evaluator.evaluate("test", { "@call": "@index", args: { step: 2 } }, item.value)), "FUNCTION_ARGUMENT_RESOLUTION_FAILED");
});

test("a literal object in a DynamicValue argument unescapes @@ keys and rejects other reserved keys", () => {
  const { evaluator, data } = setup({ literalObject: (args) => args.value });
  assert.deepEqual(
    evaluator.evaluate("test", { "@call": "literalObject", args: { value: { "@@path": "/static/file", "@@type": "Resource", plain: 1 } } }, data),
    { ok: true, value: { "@path": "/static/file", "@type": "Resource", plain: 1 } },
  );
  // The catalog schema rejects these keys before evaluation; see dynamic.test.ts for the runtime error.
  for (const key of ["@if", "@", "@metadata"]) {
    const result = evaluator.evaluate("test", { "@call": "literalObject", args: { value: { [key]: true } } }, data);
    assert.equal(errorCode(result), "FUNCTION_VALIDATION_FAILED", key);
  }
});

test("function-call args are optional, but the function's required arguments still apply", () => {
  const { evaluator, data } = setup({ stringResult: () => "bare" });
  assert.deepEqual(evaluator.evaluate("test", { "@call": "stringResult" }, data), { ok: true, value: "bare" });
  assert.equal(errorCode(evaluator.evaluate("test", { "@call": "echo" }, data)), "FUNCTION_VALIDATION_FAILED");
  assert.equal(errorCode(evaluator.evaluate("test", { "@call": "stringResult", args: "x" }, data)), "FUNCTION_VALIDATION_FAILED");
});

test("a DynamicBoolean argument coerces resolved values with the shared table", () => {
  const seen: unknown[] = [];
  const { evaluator, data } = setup({ negate: (args) => { seen.push(args.value); return !args.value; } });
  assert.deepEqual(evaluator.evaluate("test", { "@call": "negate", args: { value: { "@path": "/flags/text" } } }, data), { ok: true, value: false });
  assert.deepEqual(evaluator.evaluate("test", { "@call": "negate", args: { value: { "@path": "/check" } } }, data), { ok: true, value: true });
  assert.deepEqual(evaluator.evaluate("test", { "@call": "negate", args: { value: { "@path": "/missing" } } }, data), { ok: true, value: true });
  assert.deepEqual(seen, [true, false, false]);
});

test("array DynamicBoolean items coerce in the generic evaluator before the implementation runs", () => {
  const seen: unknown[] = [];
  const { evaluator, data } = setup({ all: (args) => { seen.push(args.values); return args.values; } });
  assert.equal(evaluator.evaluate("test", { "@call": "all", args: { values: [{ "@path": "/check" }, true] } }, data).ok, true);
  assert.deepEqual(seen, [[false, true]]);
});

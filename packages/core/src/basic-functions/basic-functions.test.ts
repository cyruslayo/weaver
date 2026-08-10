import assert from "node:assert/strict";
import { test } from "node:test";
import { CatalogRegistry } from "../catalog/index.js";
import { DataContext } from "../data-context/index.js";
import { FunctionEvaluator, FunctionRegistry, type FunctionCall } from "../functions/index.js";
import type { JsonObject } from "../protocol/index.js";
import { createBasicCatalogFunctionImplementations } from "./index.js";

const names = ["required", "length", "numeric", "email", "formatString", "formatNumber", "formatCurrency", "formatDate", "pluralize", "and", "or", "not"];
const ref = (name: string): JsonObject => ({ $ref: `#/$defs/${name}` });
const dynamic = ref("DynamicValue");
const fn = (name: string, returnType: string, properties: JsonObject, required: string[]): JsonObject => ({
  type: "object",
  properties: {
    call: { const: name },
    args: { type: "object", properties, required, additionalProperties: false },
    returnType: { const: returnType },
  },
  required: ["call", "args"],
  additionalProperties: false,
});

function schema(catalogId = "basic", included = names): JsonObject {
  const functions: JsonObject = {};
  const optionalBounds = { value: dynamic, min: { type: "number" }, max: { type: "number" } };
  const definitions: Record<string, JsonObject> = {
    required: fn("required", "boolean", { value: {} }, ["value"]),
    length: fn("length", "boolean", optionalBounds, ["value"]),
    numeric: fn("numeric", "boolean", optionalBounds, ["value"]),
    email: fn("email", "boolean", { value: dynamic }, ["value"]),
    regex: fn("regex", "boolean", { value: ref("DynamicString"), pattern: { type: "string" } }, ["value", "pattern"]),
    formatString: fn("formatString", "string", { template: { type: "string" } }, ["template"]),
    formatNumber: fn("formatNumber", "string", { value: ref("DynamicNumber"), decimals: { type: "number" }, grouping: { type: "boolean" } }, ["value"]),
    formatCurrency: fn("formatCurrency", "string", { value: ref("DynamicNumber"), currency: { type: "string" }, decimals: { type: "number" }, grouping: { type: "boolean" } }, ["value", "currency"]),
    formatDate: fn("formatDate", "string", { value: dynamic, format: { type: "string" } }, ["value", "format"]),
    pluralize: fn("pluralize", "string", { value: ref("DynamicNumber"), zero: { type: "string" }, one: { type: "string" }, two: { type: "string" }, few: { type: "string" }, many: { type: "string" }, other: { type: "string" } }, ["value", "other"]),
    and: fn("and", "boolean", { values: { type: "array", items: ref("DynamicBoolean") } }, ["values"]),
    or: fn("or", "boolean", { values: { type: "array", items: ref("DynamicBoolean") } }, ["values"]),
    not: fn("not", "boolean", { value: ref("DynamicBoolean") }, ["value"]),
  };
  for (const name of included) functions[name] = definitions[name]!;
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema", catalogId,
    components: { Text: { type: "object" } }, functions,
    $defs: {
      theme: { type: "object" },
      PathBinding: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
      FunctionCall: { type: "object", properties: { call: { type: "string" }, args: { type: "object" } }, required: ["call", "args"], additionalProperties: false },
      DynamicValue: { oneOf: [{ type: ["string", "number", "boolean", "array", "null"] }, ref("PathBinding"), ref("FunctionCall")] },
      DynamicString: { oneOf: [{ type: "string" }, ref("PathBinding"), ref("FunctionCall")] },
      DynamicNumber: { oneOf: [{ type: "number" }, ref("PathBinding"), ref("FunctionCall")] },
      DynamicBoolean: { oneOf: [{ type: "boolean" }, ref("PathBinding"), ref("FunctionCall")] },
    },
  };
}

function setup(options: { locale?: string; timeZone?: string; maxDepth?: number; regexMatcher?: (request: Readonly<{ value: string; pattern: string }>) => boolean } = {}, data: JsonObject = {}) {
  const catalogs = new CatalogRegistry();
  assert.equal(catalogs.register({ catalogId: "basic", schema: schema("basic", options.regexMatcher === undefined ? names : [...names, "regex"]) }).ok, true);
  const functions = new FunctionRegistry(catalogs);
  for (const registration of createBasicCatalogFunctionImplementations({ catalogId: "basic", ...options })) {
    assert.equal(functions.register(registration).ok, true);
  }
  return { catalogs, functions, evaluator: new FunctionEvaluator(catalogs, functions, { maxDepth: options.maxDepth }), data: DataContext.root(data) };
}

const call = (call: string, args: JsonObject): FunctionCall => ({ call, args });
const value = (runtime: ReturnType<typeof setup>, name: string, args: JsonObject, data = runtime.data) => {
  const result = runtime.evaluator.evaluate("basic", call(name, args), data);
  assert.equal(result.ok, true, result.ok ? undefined : result.error.code);
  return result.ok ? result.value : undefined;
};
const code = (result: ReturnType<FunctionEvaluator["evaluate"]>) => result.ok ? "" : result.error.code;

test("factory is catalog-scoped and excludes deferred functions", () => {
  const registrations = createBasicCatalogFunctionImplementations({ catalogId: "chosen" });
  assert.deepEqual(registrations.map(({ name }) => name), names);
  assert.ok(registrations.every(({ catalogId }) => catalogId === "chosen"));
  assert.ok(!registrations.some(({ name }) => name === "regex" || name === "openUrl"));
});

test("regex is conditionally registered as pure and delegates to the trusted matcher", () => {
  const absent = createBasicCatalogFunctionImplementations({ catalogId: "basic" });
  assert.equal(absent.some(({ name }) => name === "regex"), false);
  const requests: unknown[] = [];
  const runtime = setup({ regexMatcher: (request) => { requests.push(request); return request.value === "Ada" && request.pattern === "safe"; } }, { name: "Ada" });
  assert.equal(value(runtime, "regex", { value: { path: "/name" }, pattern: "safe" }), true);
  assert.equal(value(runtime, "regex", { value: "other", pattern: "safe" }), false);
  assert.deepEqual(requests, [{ value: "Ada", pattern: "safe" }, { value: "other", pattern: "safe" }]);
  assert.equal(runtime.functions.list("basic").find(({ name }) => name === "regex")?.effect, "pure");
});

test("regex matcher exceptions and invalid results are controlled execution failures", () => {
  const throwing = setup({ regexMatcher: () => { throw new Error("unsupported pattern"); } });
  assert.equal(code(throwing.evaluator.evaluate("basic", call("regex", { value: "x", pattern: "[" }), throwing.data)), "FUNCTION_EXECUTION_FAILED");
  const invalid = setup({ regexMatcher: (() => "yes") as unknown as () => boolean });
  assert.equal(code(invalid.evaluator.evaluate("basic", call("regex", { value: "x", pattern: "x" }), invalid.data)), "FUNCTION_EXECUTION_FAILED");
});

test("FunctionRegistry still enforces catalog permission", () => {
  const catalogs = new CatalogRegistry();
  assert.equal(catalogs.register({ catalogId: "basic", schema: schema("basic", ["required"]) }).ok, true);
  const functions = new FunctionRegistry(catalogs);
  const registrations = createBasicCatalogFunctionImplementations({ catalogId: "basic" });
  assert.equal(functions.register(registrations[0]!).ok, true);
  assert.equal(functions.register(registrations[1]!).ok, false);
});

test("required uses exact presence semantics and resolves broad bindings and calls", () => {
  const runtime = setup({}, { present: false });
  for (const [input, expected] of [[null, false], [undefined, false], ["", false], [[], false], [false, true], [0, true], ["x", true], [[1], true], [{}, true]] as const) {
    const args = { value: input } as unknown as JsonObject;
    if (input !== undefined) assert.equal(value(runtime, "required", args), expected);
  }
  assert.equal(value(runtime, "required", { value: { path: "/present" } }), true);
  assert.equal(value(runtime, "required", { value: { path: "/missing" } }), false);
  assert.equal(value(runtime, "required", { value: call("not", { value: false }) as unknown as JsonObject }), true);
});

test("length and numeric validate without coercive or partial parsing", () => {
  const runtime = setup();
  assert.equal(value(runtime, "length", { value: "abc", min: 3 }), true);
  assert.equal(value(runtime, "length", { value: "abc", max: 3 }), true);
  assert.equal(value(runtime, "length", { value: "abc", min: 2, max: 4 }), true);
  assert.equal(value(runtime, "length", { value: 42, min: 1 }), false);
  for (const input of [42, "42", "42.5", "-3"]) assert.equal(value(runtime, "numeric", { value: input }), true);
  for (const input of ["", "   ", "hello", "12px"]) assert.equal(value(runtime, "numeric", { value: input }), false);
  assert.equal(value(runtime, "numeric", { value: "3", min: 3, max: 3 }), true);
  assert.equal(value(runtime, "numeric", { value: "2", min: 3 }), false);
});

test("email uses fixed simple validation", () => {
  const runtime = setup();
  assert.equal(value(runtime, "email", { value: "a@example.com" }), true);
  for (const input of ["example.com", "a@", "a @example.com", 4]) assert.equal(value(runtime, "email", { value: input }), false);
});

test("strict logic resolves nested arguments and rejects coercion", () => {
  const runtime = setup();
  assert.equal(value(runtime, "and", { values: [true, call("not", { value: false }) as unknown as JsonObject] }), true);
  assert.equal(value(runtime, "or", { values: [false, true] }), true);
  assert.equal(value(runtime, "not", { value: true }), false);
  assert.equal(code(runtime.evaluator.evaluate("basic", call("and", { values: [true, 1] }), runtime.data)), "FUNCTION_VALIDATION_FAILED");
});

test("number and currency formatting are deterministic", () => {
  const runtime = setup({ locale: "en-US" });
  assert.equal(value(runtime, "formatNumber", { value: 1234.5 }), "1,234.5");
  assert.equal(value(runtime, "formatNumber", { value: -1234.5, grouping: false, decimals: 2 }), "-1234.50");
  assert.equal(value(runtime, "formatCurrency", { value: 1234.5, currency: "USD" }), "$1,234.50");
  assert.equal(value(runtime, "formatCurrency", { value: 1234.5, currency: "USD", grouping: false, decimals: 1 }), "$1234.5");
  assert.equal(code(runtime.evaluator.evaluate("basic", call("formatNumber", { value: 1, decimals: 2.7 }), runtime.data)), "FUNCTION_EXECUTION_FAILED");
});

test("pluralize selects locale categories with other fallback", () => {
  const english = setup({ locale: "en-US" });
  assert.equal(value(english, "pluralize", { value: 1, one: "one", other: "other" }), "one");
  assert.equal(value(english, "pluralize", { value: 2, one: "one", other: "other" }), "other");
  const polish = setup({ locale: "pl" });
  assert.equal(value(polish, "pluralize", { value: 2, few: "few", other: "other" }), "few");
  assert.equal(value(polish, "pluralize", { value: 5, other: "fallback" }), "fallback");
});

test("formatDate supports the documented token subset and rejects invalid input", () => {
  const runtime = setup({ locale: "en-US", timeZone: "UTC" });
  const date = "2024-01-02T15:04:05Z";
  assert.equal(value(runtime, "formatDate", { value: date, format: "yyyy-MM-dd" }), "2024-01-02");
  assert.equal(value(runtime, "formatDate", { value: date, format: "MMM dd, yyyy" }), "Jan 02, 2024");
  assert.equal(value(runtime, "formatDate", { value: date, format: "HH:mm" }), "15:04");
  assert.equal(value(runtime, "formatDate", { value: date, format: "h:mm a" }), "3:04 PM");
  assert.equal(value(runtime, "formatDate", { value: date, format: "EEEE, d MMMM" }), "Tuesday, 2 January");
  assert.equal(value(runtime, "formatDate", { value: date, format: "yyyy 'year'" }), "2024 year");
  assert.equal(code(runtime.evaluator.evaluate("basic", call("formatDate", { value: "bad", format: "yyyy" }), runtime.data)), "FUNCTION_EXECUTION_FAILED");
  assert.equal(code(runtime.evaluator.evaluate("basic", call("formatDate", { value: date, format: "QQ" }), runtime.data)), "FUNCTION_EXECUTION_FAILED");
});

test("formatString resolves literals, paths, relative paths, calls and escaping", () => {
  const runtime = setup({ locale: "en-US" }, { user: { name: "Ada" }, price: 1234, items: [{ name: "A" }, { name: "B" }] });
  assert.equal(value(runtime, "formatString", { template: "Hello world" }), "Hello world");
  assert.equal(value(runtime, "formatString", { template: "Hello ${/user/name}" }), "Hello Ada");
  assert.equal(value(runtime, "formatString", { template: "${'x'} ${2} ${true} ${false} ${null}" }), "x 2 true false null");
  assert.equal(value(runtime, "formatString", { template: "Price ${formatNumber(value:${/price}, decimals:2)}" }), "Price 1,234.00");
  assert.equal(value(runtime, "formatString", { template: "${not(value:not(value:false))}" }), "false");
  assert.equal(value(runtime, "formatString", { template: "\\${name}" }), "${name}");
  const item = runtime.data.createCollectionItemContext("/items", 1);
  assert.equal(item.ok, true);
  if (item.ok) assert.equal(value(runtime, "formatString", { template: "Hello ${name}" }, item.value), "Hello B");
});

test("formatString parser failures are controlled and recursive depth is preserved", () => {
  const runtime = setup({ maxDepth: 1 });
  assert.equal(code(runtime.evaluator.evaluate("basic", call("formatString", { template: "${" }), runtime.data)), "FUNCTION_EXECUTION_FAILED");
  assert.equal(code(runtime.evaluator.evaluate("basic", call("formatString", { template: "${formatString(template:'x')}" }), runtime.data)), "FUNCTION_MAX_DEPTH_EXCEEDED");
});

test("factory instances do not share locale state", () => {
  const us = setup({ locale: "en-US" });
  const de = setup({ locale: "de-DE" });
  assert.equal(value(us, "formatNumber", { value: 1234.5 }), "1,234.5");
  assert.equal(value(de, "formatNumber", { value: 1234.5 }), "1.234,5");
});

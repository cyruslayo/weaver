import assert from "node:assert/strict";
import { test } from "node:test";
import { CatalogRegistry } from "../catalog/index.js";
import { DataContext } from "../data-context/index.js";
import { FunctionEvaluator, FunctionRegistry, type FunctionCall } from "../functions/index.js";
import { catalogDocument, componentSchema, functionSchema, ref } from "../functions/catalogFixtures.test-helper.js";
import type { JsonObject } from "../protocol/index.js";
import { createBasicCatalogFunctionImplementations } from "./index.js";
import { checkA2UIRegexPattern } from "./regexDialect.js";

const names = ["required", "length", "numeric", "email", "formatString", "formatNumber", "formatCurrency", "formatDate", "pluralize", "and", "or", "not"];
const dynamic = ref("DynamicValue");

function definitions(): Record<string, JsonObject> {
  return {
    required: functionSchema("required", { returnType: "validationResult", args: { value: dynamic } }),
    length: functionSchema("length", {
      returnType: "validationResult",
      args: { value: ref("DynamicString"), min: { type: "number" }, max: { type: "number" } },
      required: ["value"],
    }),
    numeric: functionSchema("numeric", {
      returnType: "validationResult",
      args: { value: dynamic, min: { type: "number" }, max: { type: "number" } },
      required: ["value"],
    }),
    email: functionSchema("email", { returnType: "validationResult", args: { value: ref("DynamicString") } }),
    regex: functionSchema("regex", {
      returnType: "validationResult",
      args: { value: ref("DynamicString"), pattern: { type: "string" } },
    }),
    formatString: functionSchema("formatString", { returnType: "string", args: { value: ref("DynamicString") } }),
    formatNumber: functionSchema("formatNumber", {
      returnType: "string",
      args: { value: ref("DynamicNumber"), decimals: { type: "number" }, grouping: { type: "boolean" } },
      required: ["value"],
    }),
    formatCurrency: functionSchema("formatCurrency", {
      returnType: "string",
      args: { value: ref("DynamicNumber"), currency: { type: "string" }, decimals: { type: "number" }, grouping: { type: "boolean" } },
      required: ["value", "currency"],
    }),
    formatDate: functionSchema("formatDate", { returnType: "string", args: { value: dynamic, format: { type: "string" } } }),
    pluralize: functionSchema("pluralize", {
      returnType: "string",
      args: { value: ref("DynamicNumber"), zero: { type: "string" }, one: { type: "string" }, two: { type: "string" }, few: { type: "string" }, many: { type: "string" }, other: { type: "string" } },
      required: ["value", "other"],
    }),
    and: functionSchema("and", { returnType: "boolean", args: { values: { type: "array", items: ref("DynamicBoolean") } } }),
    or: functionSchema("or", { returnType: "boolean", args: { values: { type: "array", items: ref("DynamicBoolean") } } }),
    not: functionSchema("not", { returnType: "boolean", args: { value: ref("DynamicBoolean") } }),
  };
}

function schema(catalogId = "basic", included = names): JsonObject {
  const all = definitions();
  const functions: JsonObject = {};
  for (const name of included) functions[name] = all[name]!;
  return catalogDocument(catalogId, { Text: componentSchema("Text", {}) }, functions);
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

const call = (name: string, args: JsonObject): JsonObject => ({ "@call": name, args }) as JsonObject;
const value = (runtime: ReturnType<typeof setup>, name: string, args: JsonObject, data = runtime.data) => {
  const result = runtime.evaluator.evaluate("basic", call(name, args), data);
  assert.equal(result.ok, true, result.ok ? undefined : result.error.code);
  return result.ok ? result.value : undefined;
};
const code = (result: ReturnType<FunctionEvaluator["evaluate"]>) => (result.ok ? "" : result.error.code);

test("factory is catalog-scoped and excludes deferred functions", () => {
  const registrations = createBasicCatalogFunctionImplementations({ catalogId: "chosen" });
  assert.deepEqual(registrations.map(({ name }) => name), names);
  assert.ok(registrations.every(({ catalogId }) => catalogId === "chosen"));
  assert.ok(!registrations.some(({ name }) => name === "regex" || name === "openUrl"));
});

test("regex is conditionally registered as pure and delegates to the trusted matcher after dialect checks", () => {
  const absent = createBasicCatalogFunctionImplementations({ catalogId: "basic" });
  assert.equal(absent.some(({ name }) => name === "regex"), false);
  const requests: unknown[] = [];
  const runtime = setup({ regexMatcher: (request) => { requests.push(request); return request.value === "Ada" && request.pattern === "^A"; } }, { name: "Ada" });
  assert.deepEqual(value(runtime, "regex", { value: { "@path": "/name" }, pattern: "^A" }), { valid: true });
  assert.deepEqual(value(runtime, "regex", { value: "other", pattern: "^A" }), { valid: false });
  assert.deepEqual(requests, [{ value: "Ada", pattern: "^A" }, { value: "other", pattern: "^A" }]);
  assert.equal(runtime.functions.list("basic").find(({ name }) => name === "regex")?.effect, "pure");
});

test("regex rejects patterns outside the dialect or its safety rules before the matcher runs", () => {
  let matcherCalls = 0;
  const runtime = setup({ regexMatcher: () => { matcherCalls += 1; return true; } });
  for (const pattern of ["(a+)+$", "(a|ab)*c", "\\d+\\s*\\d+", "(\\w)\\1", "(?<=a)b", "\\p{L}", "(?<name>a)", "a{2,1}", "[z-a]", "*", "(?i)a", "a\\"]) {
    assert.equal(code(runtime.evaluator.evaluate("basic", call("regex", { value: "x", pattern }), runtime.data)), "EXPRESSION_ERROR", pattern);
  }
  assert.equal(matcherCalls, 0);
});

test("regex accepts the guide's example patterns and runs the matcher on them", () => {
  let matcherCalls = 0;
  const runtime = setup({ regexMatcher: () => { matcherCalls += 1; return true; } });
  for (const pattern of ["^[a-z]+@[a-z]+\\.com$", "^(?=.*\\d).{8,}$", "\\w+\\s+\\w+", "\\d{3}-\\d{4}", "(?:ab|cd)+e"]) {
    assert.deepEqual(value(runtime, "regex", { value: "x", pattern }), { valid: true }, pattern);
  }
  assert.equal(matcherCalls, 5);
});

test("regex caps the pattern at 256 code points and the value at 4096 without an error", () => {
  let matcherCalls = 0;
  const runtime = setup({ regexMatcher: () => { matcherCalls += 1; return true; } });
  assert.equal(code(runtime.evaluator.evaluate("basic", call("regex", { value: "x", pattern: "a".repeat(257) }), runtime.data)), "EXPRESSION_ERROR");
  assert.deepEqual(value(runtime, "regex", { value: "a".repeat(4097), pattern: "a" }), { valid: false });
  assert.deepEqual(value(runtime, "regex", { value: "a".repeat(4096), pattern: "a" }), { valid: true });
  // An oversized value short-circuits even when the pattern is invalid, without reporting an error.
  assert.deepEqual(value(runtime, "regex", { value: "a".repeat(4097), pattern: "(a+)+$" }), { valid: false });
  assert.equal(matcherCalls, 1);
});

test("regex matcher exceptions and invalid results are controlled execution failures", () => {
  const throwing = setup({ regexMatcher: () => { throw new Error("unsupported pattern"); } });
  assert.equal(code(throwing.evaluator.evaluate("basic", call("regex", { value: "x", pattern: "x" }), throwing.data)), "FUNCTION_EXECUTION_FAILED");
  const invalid = setup({ regexMatcher: (() => "yes") as unknown as () => boolean });
  assert.equal(code(invalid.evaluator.evaluate("basic", call("regex", { value: "x", pattern: "x" }), invalid.data)), "FUNCTION_EXECUTION_FAILED");
});

test("checkA2UIRegexPattern applies the dialect and each safety rule", () => {
  for (const pattern of ["^[a-z]+@[a-z]+\\.com$", "^(?=.*\\d).{8,}$", "\\w+\\s+\\w+", "a?b{0,1}", "(?:a|b)*c", "(a+)?", "x{2}"]) {
    assert.deepEqual(checkA2UIRegexPattern(pattern), { ok: true }, pattern);
  }
  const rejected: [string, RegExp][] = [
    ["(a+)+$", /unbounded quantifier/],
    ["(a|ab)*c", /same character/],
    ["\\d+\\s*\\d+", /adjacent/],
    ["(\\w)\\1", /backreferences/],
    ["(?<=a)b", /lookbehind/],
    ["\\cJ", /not allowed/],
    ["\\01", /octal|backreference|legacy/],
    ["a{3,1}", /out of order/],
    ["[b-a]", /out of order/],
    ["\\u{110000}", /out of range/],
    ["a\\", /trailing/],
    ["a(b", /unterminated/],
    ["a)b", /unbalanced/],
    ["x{2,}{3}", /unescaped syntax/],
    ["^*", /assertion/],
  ];
  for (const [pattern, message] of rejected) {
    const result = checkA2UIRegexPattern(pattern);
    assert.equal(result.ok, false, pattern);
    if (!result.ok) assert.match(result.message, message, pattern);
  }
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
  for (const [input, expected] of [["", false], [[], false], [false, true], [0, true], ["x", true], [[1], true], [{}, true]] as const) {
    assert.deepEqual(value(runtime, "required", { value: input } as JsonObject), { valid: expected }, JSON.stringify(input));
  }
  assert.deepEqual(value(runtime, "required", { value: { "@path": "/present" } }), { valid: true });
  assert.deepEqual(value(runtime, "required", { value: { "@path": "/missing" } }), { valid: false });
  assert.deepEqual(value(runtime, "required", { value: call("not", { value: false }) }), { valid: true });
});

test("length and numeric return a ValidationResult without coercive or partial parsing", () => {
  const runtime = setup();
  assert.deepEqual(value(runtime, "length", { value: "abc", min: 3 }), { valid: true });
  assert.deepEqual(value(runtime, "length", { value: "abc", max: 3 }), { valid: true });
  assert.deepEqual(value(runtime, "length", { value: "abc", min: 2, max: 4 }), { valid: true });
  assert.deepEqual(value(runtime, "length", { value: "a😀b", min: 3, max: 3 }), { valid: true }, "length counts code points");
  assert.equal(code(runtime.evaluator.evaluate("basic", call("length", { value: 42, min: 1 }), runtime.data)), "FUNCTION_VALIDATION_FAILED");
  for (const input of [42, "42", "42.5", "-3"]) assert.deepEqual(value(runtime, "numeric", { value: input, min: -10 }), { valid: true }, String(input));
  for (const input of ["", "   ", "hello", "12px"]) assert.deepEqual(value(runtime, "numeric", { value: input, min: 0 }), { valid: false }, input);
  assert.deepEqual(value(runtime, "numeric", { value: "3", min: 3, max: 3 }), { valid: true });
  assert.deepEqual(value(runtime, "numeric", { value: "2", min: 3 }), { valid: false });
});

test("length and numeric require at least one bound", () => {
  const runtime = setup();
  assert.equal(code(runtime.evaluator.evaluate("basic", call("length", { value: "abc" }), runtime.data)), "FUNCTION_EXECUTION_FAILED");
  assert.equal(code(runtime.evaluator.evaluate("basic", call("numeric", { value: 1 }), runtime.data)), "FUNCTION_EXECUTION_FAILED");
});

test("email uses fixed simple validation and returns a ValidationResult", () => {
  const runtime = setup();
  assert.deepEqual(value(runtime, "email", { value: "a@example.com" }), { valid: true });
  for (const input of ["example.com", "a@", "a @example.com"]) assert.deepEqual(value(runtime, "email", { value: input }), { valid: false }, input);
  assert.equal(code(runtime.evaluator.evaluate("basic", call("email", { value: 4 }), runtime.data)), "FUNCTION_VALIDATION_FAILED");
});

test("and and or coerce DynamicBoolean items per the shared table, and not coerces its value", () => {
  const runtime = setup({}, { text: "TRUE", check: { valid: false }, empty: "" });
  assert.equal(value(runtime, "and", { values: [true, call("not", { value: false })] }), true);
  assert.equal(value(runtime, "and", { values: [{ "@path": "/text" }, { "@path": "/check" }] }), false);
  assert.equal(value(runtime, "or", { values: [{ "@path": "/empty" }, true] }), true);
  assert.equal(value(runtime, "or", { values: [{ "@path": "/empty" }, false] }), false);
  assert.equal(value(runtime, "not", { value: { "@path": "/check" } }), true);
  assert.equal(value(runtime, "not", { value: true }), false);
  assert.equal(value(runtime, "and", { values: [] }), true);
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
  assert.equal(value(runtime, "formatString", { value: "Hello world" }), "Hello world");
  assert.equal(value(runtime, "formatString", { value: "Hello ${/user/name}" }), "Hello Ada");
  assert.equal(value(runtime, "formatString", { value: "${'x'} ${2} ${true} ${false} ${null}" }), "x 2 true false null");
  assert.equal(value(runtime, "formatString", { value: "Price ${formatNumber(value:${/price}, decimals:2)}" }), "Price 1,234.00");
  assert.equal(value(runtime, "formatString", { value: "${not(value:${not(value:${/user/name})})}" }), "false");
  assert.equal(value(runtime, "formatString", { value: "\\${name}" }), "${name}");
  const item = runtime.data.createCollectionItemContext("/items", 1);
  assert.equal(item.ok, true);
  if (item.ok) assert.equal(value(runtime, "formatString", { value: "Hello ${name}" }, item.value), "Hello B");
});

test("formatString interpolates @index with its offset inside a collection template", () => {
  const runtime = setup({}, { items: [{ name: "A" }, { name: "B" }] });
  const second = runtime.data.createCollectionItemContext("/items", 1);
  assert.equal(second.ok, true);
  if (second.ok) assert.equal(value(runtime, "formatString", { value: "#${@index(offset: 1)}" }, second.value), "#2");
  assert.equal(code(runtime.evaluator.evaluate("basic", call("formatString", { value: "#${@index(offset: 1)}" }), runtime.data)), "EXECUTION_ERROR");
});

test("formatString parser failures are controlled and recursive depth is preserved", () => {
  const runtime = setup({ maxDepth: 1 });
  assert.equal(code(runtime.evaluator.evaluate("basic", call("formatString", { value: "${" }), runtime.data)), "FUNCTION_EXECUTION_FAILED");
  assert.equal(code(runtime.evaluator.evaluate("basic", call("formatString", { value: "${formatString(value:'x')}" }), runtime.data)), "FUNCTION_MAX_DEPTH_EXCEEDED");
});

test("factory instances do not share locale state", () => {
  const us = setup({ locale: "en-US" });
  const de = setup({ locale: "de-DE" });
  assert.equal(value(us, "formatNumber", { value: 1234.5 }), "1,234.5");
  assert.equal(value(de, "formatNumber", { value: 1234.5 }), "1.234,5");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { CatalogRegistry, DataContext, FunctionEvaluator, FunctionRegistry, createBasicCatalogFunctionImplementations, type JsonObject } from "@weaver/core";
import { Window } from "happy-dom";
import { createBasicCatalogBrowserFunctionImplementations } from "./index.js";

const schema = (): JsonObject => ({
  $schema: "https://json-schema.org/draft/2020-12/schema", catalogId: "basic",
  components: { Button: { type: "object" } },
  functions: { openUrl: {
    type: "object",
    properties: { call: { const: "openUrl" }, args: { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false }, returnType: { const: "void" } },
    required: ["call", "args"], additionalProperties: false,
  } },
  $defs: { theme: { type: "object" } },
});

function setup(options: { baseUrl?: string; openUrlPolicy?: (request: Readonly<{ url: string }>) => string | undefined } = {}) {
  const catalogs = new CatalogRegistry();
  assert.equal(catalogs.register({ catalogId: "basic", schema: schema() }).ok, true);
  const functions = new FunctionRegistry(catalogs);
  const registrations = createBasicCatalogBrowserFunctionImplementations({ catalogId: "basic", ...options });
  assert.equal(functions.register(registrations[0]!).ok, true);
  return { evaluator: new FunctionEvaluator(catalogs, functions), registration: registrations[0]! };
}

function installWindow(open: (...args: unknown[]) => unknown) {
  const browser = new Window({ url: "https://browser.example/app/" });
  Object.defineProperty(browser, "open", { configurable: true, value: open });
  const prior = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
  return () => prior === undefined ? delete (globalThis as { window?: unknown }).window : Object.defineProperty(globalThis, "window", prior);
}

test("composed trusted Basic factories register all 14 functions with exact effects", () => {
  const registrations = [
    ...createBasicCatalogFunctionImplementations({ catalogId: "basic", regexMatcher: () => true }),
    ...createBasicCatalogBrowserFunctionImplementations({ catalogId: "basic", baseUrl: "https://example.test/" }),
  ];
  const expected = ["required", "regex", "length", "numeric", "email", "formatString", "formatNumber", "formatCurrency", "formatDate", "pluralize", "openUrl", "and", "or", "not"];
  assert.equal(registrations.length, 14);
  assert.deepEqual(new Set(registrations.map(({ name }) => name)), new Set(expected));
  assert.equal(registrations.find(({ name }) => name === "openUrl")?.effect, "action");
  assert.equal(registrations.filter(({ name }) => name !== "openUrl").every(({ effect }) => effect === "pure"), true);
});

test("factory registers catalog-scoped action-effect openUrl", () => {
  const { registration } = setup({ baseUrl: "https://example.com/app/page" });
  assert.deepEqual({ catalogId: registration.catalogId, name: registration.name, effect: registration.effect }, { catalogId: "basic", name: "openUrl", effect: "action" });
});

test("openUrl resolves HTTP(S), applies policy, and opens a secured new tab", () => {
  const calls: unknown[][] = [];
  const restore = installWindow((...args) => { calls.push(args); return null; });
  try {
    const { evaluator } = setup({ baseUrl: "https://example.com/app/page", openUrlPolicy: ({ url }) => url.replace("example.com/help", "approved.example/proxy/x") });
    const pure = evaluator.evaluate("basic", { call: "openUrl", args: { url: "../help" } }, DataContext.root({}));
    assert.equal(!pure.ok && pure.error.code, "FUNCTION_EFFECT_NOT_ALLOWED");
    const result = evaluator.evaluateAction("basic", { call: "openUrl", args: { url: "../help" } }, DataContext.root({}));
    assert.equal(result.ok, true);
    assert.deepEqual(calls, [["https://approved.example/proxy/x", "_blank", "noopener,noreferrer"]]);
  } finally { restore(); }
});

test("openUrl blocks unsafe schemes, policy denial, and unsafe rewrites before opening", () => {
  for (const [url, policy] of [
    ["javascript:alert(1)", undefined], ["data:text/plain,x", undefined], ["file:///x", undefined],
    ["blob:https://example.com/x", undefined], ["mailto:a@example.com", undefined],
    ["https://example.com", () => undefined], ["https://example.com", () => "javascript:alert(1)"],
  ] as const) {
    let opens = 0;
    const restore = installWindow(() => { opens++; return null; });
    try {
      const { evaluator } = setup({ baseUrl: "https://example.com/", ...(policy === undefined ? {} : { openUrlPolicy: policy }) });
      const result = evaluator.evaluateAction("basic", { call: "openUrl", args: { url } }, DataContext.root({}));
      assert.equal(!result.ok && result.error.code, "FUNCTION_EXECUTION_FAILED");
      assert.equal(opens, 0);
    } finally { restore(); }
  }
});

test("openUrl allows absolute HTTP and HTTPS and wraps browser exceptions", () => {
  const calls: unknown[][] = [];
  let restore = installWindow((...args) => { calls.push(args); return null; });
  try {
    const { evaluator } = setup();
    for (const url of ["http://example.com/x", "https://example.com/y"]) assert.equal(evaluator.evaluateAction("basic", { call: "openUrl", args: { url } }, DataContext.root({})).ok, true);
    assert.equal(calls.length, 2);
  } finally { restore(); }
  restore = installWindow(() => { throw new Error("browser failure"); });
  try {
    const { evaluator } = setup();
    const result = evaluator.evaluateAction("basic", { call: "openUrl", args: { url: "https://example.com" } }, DataContext.root({}));
    assert.equal(!result.ok && result.error.code, "FUNCTION_EXECUTION_FAILED");
  } finally { restore(); }
});

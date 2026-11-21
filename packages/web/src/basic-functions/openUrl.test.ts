import assert from "node:assert/strict";
import { test } from "node:test";
import {
  A2UI_V10_BASIC_CATALOG_ID,
  CatalogRegistry,
  DataContext,
  FunctionEvaluator,
  FunctionRegistry,
  createBasicCatalogFunctionImplementations,
  createBasicCatalogV10Registration,
} from "@cylayo/weaver-core";
import { Window } from "happy-dom";
import { createBasicCatalogBrowserFunctionImplementations } from "./index.js";

const catalogId = A2UI_V10_BASIC_CATALOG_ID;
const openCall = (url: string) => ({ "@call": "openUrl", args: { url } });

function setup(options: { baseUrl?: string; openUrlPolicy?: (request: Readonly<{ url: string }>) => string | undefined } = {}) {
  const catalogs = new CatalogRegistry();
  assert.equal(catalogs.register(createBasicCatalogV10Registration()).ok, true);
  const functions = new FunctionRegistry(catalogs);
  const registrations = createBasicCatalogBrowserFunctionImplementations({ catalogId, ...options });
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
    ...createBasicCatalogFunctionImplementations({ catalogId, regexMatcher: () => true }),
    ...createBasicCatalogBrowserFunctionImplementations({ catalogId, baseUrl: "https://example.test/" }),
  ];
  const expected = ["required", "regex", "length", "numeric", "email", "formatString", "formatNumber", "formatCurrency", "formatDate", "pluralize", "openUrl", "and", "or", "not"];
  assert.equal(registrations.length, 14);
  assert.deepEqual(new Set(registrations.map(({ name }) => name)), new Set(expected));
  assert.equal(registrations.find(({ name }) => name === "openUrl")?.effect, "action");
  assert.equal(registrations.filter(({ name }) => name !== "openUrl").every(({ effect }) => effect === "pure"), true);
});

test("factory registers catalog-scoped action-effect openUrl", () => {
  const { registration } = setup({ baseUrl: "https://example.com/app/page" });
  assert.deepEqual({ catalogId: registration.catalogId, name: registration.name, effect: registration.effect }, { catalogId, name: "openUrl", effect: "action" });
});

test("openUrl is never a passive binding and is rejected without a user gesture", () => {
  const calls: unknown[][] = [];
  const restore = installWindow((...args) => { calls.push(args); return null; });
  try {
    const { evaluator } = setup({ baseUrl: "https://example.com/app/page" });
    const pure = evaluator.evaluate(catalogId, openCall("https://example.com/x"), DataContext.root({}));
    assert.equal(!pure.ok && pure.error.code, "EXPRESSION_ERROR");
    const passive = evaluator.evaluateAction(catalogId, openCall("https://example.com/x"), DataContext.root({}), { userActivation: false });
    assert.equal(!passive.ok && passive.error.code, "EXPRESSION_ERROR");
    assert.equal(calls.length, 0);
  } finally { restore(); }
});

test("openUrl from a user gesture applies policy to an absolute HTTP(S) URL and opens a secured new tab", () => {
  const calls: unknown[][] = [];
  const restore = installWindow((...args) => { calls.push(args); return null; });
  try {
    const { evaluator } = setup({ baseUrl: "https://example.com/app/page", openUrlPolicy: ({ url }) => url.replace("example.com/help", "approved.example/proxy/x") });
    const result = evaluator.evaluateAction(catalogId, openCall("https://example.com/help"), DataContext.root({}), { userActivation: true });
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
      const result = evaluator.evaluateAction(catalogId, openCall(url), DataContext.root({}), { userActivation: true });
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
    for (const url of ["http://example.com/x", "https://example.com/y"]) {
      assert.equal(evaluator.evaluateAction(catalogId, openCall(url), DataContext.root({}), { userActivation: true }).ok, true);
    }
    assert.equal(calls.length, 2);
  } finally { restore(); }
  restore = installWindow(() => { throw new Error("browser failure"); });
  try {
    const { evaluator } = setup();
    const result = evaluator.evaluateAction(catalogId, openCall("https://example.com"), DataContext.root({}), { userActivation: true });
    assert.equal(!result.ok && result.error.code, "FUNCTION_EXECUTION_FAILED");
  } finally { restore(); }
});

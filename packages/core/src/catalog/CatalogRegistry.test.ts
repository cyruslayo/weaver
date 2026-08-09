import assert from "node:assert/strict";
import { test } from "node:test";

import type { A2UIComponent, JsonObject } from "../protocol/index.js";
import { CatalogRegistry } from "./CatalogRegistry.js";

function catalog(catalogId: string, extraComponents: JsonObject = {}): JsonObject {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `https://example.test/catalogs/${catalogId}.json`,
    catalogId,
    components: {
      Text: {
        type: "object",
        properties: {
          id: { type: "string" },
          component: { const: "Text" },
          text: { type: "string" },
          variant: { enum: ["h1", "body"] },
        },
        required: ["id", "component", "text"],
        additionalProperties: false,
      },
      Button: {
        type: "object",
        properties: { id: { type: "string" }, component: { const: "Button" }, child: { type: "string" } },
        required: ["id", "component", "child"],
        additionalProperties: false,
      },
      Column: {
        type: "object",
        properties: {
          id: { type: "string" },
          component: { const: "Column" },
          children: { type: "array", items: { type: "string" } },
        },
        required: ["id", "component", "children"],
        additionalProperties: false,
      },
      ...extraComponents,
    },
    functions: { isPresent: { returnType: "boolean" } },
    $defs: { theme: { type: "object", properties: { primaryColor: { type: "string" } } } },
  };
}

function registered(id = "test") {
  const registry = new CatalogRegistry();
  assert.equal(registry.register({ catalogId: id, schema: catalog(id) }).ok, true);
  return registry;
}

function expectCode(result: ReturnType<CatalogRegistry["validateComponent"]>, code: string) {
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, code);
}

test("registers, finds, and lists catalogs in insertion order with fresh ID arrays", () => {
  const registry = new CatalogRegistry();
  assert.equal(registry.register({ catalogId: "a", schema: catalog("a") }).ok, true);
  assert.equal(registry.register({ catalogId: "b", schema: catalog("b") }).ok, true);
  assert.equal(registry.has("a"), true);
  assert.deepEqual(registry.list().map(({ catalogId }) => catalogId), ["a", "b"]);
  const ids = registry.getSupportedCatalogIds();
  ids.push("injected");
  assert.deepEqual(registry.getSupportedCatalogIds(), ["a", "b"]);
});

test("rejects duplicate registration without replacing the original", () => {
  const registry = registered("same");
  const result = registry.register({ catalogId: "same", schema: catalog("same", { Chart: { type: "object" } }) });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "CATALOG_ALREADY_REGISTERED");
  expectCode(registry.validateComponent("same", { id: "c", component: "Chart" }), "COMPONENT_NOT_ALLOWED");
});

test("validates Text properties from its catalog schema", () => {
  const registry = registered();
  assert.equal(registry.validateComponent("test", { id: "title", component: "Text", text: "Hello", variant: "h1" }).ok, true);
  const invalid = registry.validateComponent("test", { id: "title", component: "Text", text: 123 });
  expectCode(invalid, "COMPONENT_VALIDATION_FAILED");
  if (!invalid.ok) {
    assert.equal(invalid.error.componentId, "title");
    assert.equal(invalid.error.component, "Text");
    assert.ok(invalid.error.issues?.some(({ path, keyword }) => path === "/text" && keyword === "type"));
  }
});

test("rejects component properties forbidden by the schema", () => {
  const result = registered().validateComponent("test", { id: "title", component: "Text", text: "Hello", script: "no" });
  expectCode(result, "COMPONENT_VALIDATION_FAILED");
});

test("rejects unknown component names at the trusted allowlist", () => {
  expectCode(registered().validateComponent("test", { id: "x", component: "ExecuteJavaScript" }), "COMPONENT_NOT_ALLOWED");
});

test("rejects unknown catalog IDs without fallback", () => {
  expectCode(registered().validateComponent("missing", { id: "title", component: "Text", text: "Hello" }), "CATALOG_NOT_FOUND");
});

test("isolates component allowlists between catalogs", () => {
  const chartSchema: JsonObject = {
    type: "object",
    properties: { id: { type: "string" }, component: { const: "Chart" }, series: { type: "array" } },
    required: ["id", "component", "series"],
    additionalProperties: false,
  };
  const registry = new CatalogRegistry();
  registry.register({ catalogId: "catalog-a", schema: catalog("catalog-a") });
  registry.register({ catalogId: "catalog-b", schema: catalog("catalog-b", { Chart: chartSchema }) });
  const chart: A2UIComponent = { id: "chart", component: "Chart", series: [] };
  expectCode(registry.validateComponent("catalog-a", chart), "COMPONENT_NOT_ALLOWED");
  assert.equal(registry.validateComponent("catalog-b", chart).ok, true);
});

test("owns registered schemas and returns defensive snapshots", () => {
  const source = catalog("owned");
  const registry = new CatalogRegistry();
  registry.register({ catalogId: "owned", schema: source });
  (source.components as JsonObject).Injected = { type: "object" };
  const fromGet = registry.get("owned");
  assert.ok(fromGet);
  (fromGet.schema.components as JsonObject).AlsoInjected = { type: "object" };
  const fromList = registry.list()[0];
  (fromList.schema.components as JsonObject).ThirdInjection = { type: "object" };
  for (const name of ["Injected", "AlsoInjected", "ThirdInjection"]) {
    expectCode(registry.validateComponent("owned", { id: "x", component: name }), "COMPONENT_NOT_ALLOWED");
  }
});

test("rejects malformed, mismatched, and uncompileable catalog schemas atomically", () => {
  const registry = new CatalogRegistry();
  const malformed = registry.register({ catalogId: "bad", schema: { catalogId: "bad", components: {} } });
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.error.code, "INVALID_CATALOG_SCHEMA");
  const mismatch = registry.register({ catalogId: "expected", schema: catalog("different") });
  assert.equal(mismatch.ok, false);
  const broken = catalog("broken", { Broken: { $ref: "#/$defs/does-not-exist" } });
  const uncompileable = registry.register({ catalogId: "broken", schema: broken });
  assert.equal(uncompileable.ok, false);
  assert.deepEqual(registry.getSupportedCatalogIds(), []);
});

test("compiles and applies $defs.theme validation", () => {
  const registry = registered("themed");
  assert.equal(registry.validateTheme("themed", { primaryColor: "blue" }).ok, true);
  const invalid = registry.validateTheme("themed", { primaryColor: 42 });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.equal(invalid.error.code, "THEME_VALIDATION_FAILED");
    assert.ok(invalid.error.issues?.some(({ path, keyword }) => path === "/primaryColor" && keyword === "type"));
  }
  const missing = registry.validateTheme("missing", {});
  assert.equal(!missing.ok && missing.error.code, "CATALOG_NOT_FOUND");
});

test("rejects registration when $defs.theme is absent", () => {
  const registry = new CatalogRegistry();
  const schema = catalog("no-theme");
  delete (schema.$defs as JsonObject).theme;
  const result = registry.register({ catalogId: "no-theme", schema });
  assert.equal(!result.ok && result.error.code, "THEME_SCHEMA_NOT_FOUND");
  assert.equal(registry.has("no-theme"), false);
});

test("preserves function and theme definitions without executing them", () => {
  const registry = registered("preserved");
  const snapshot = registry.get("preserved");
  assert.deepEqual(snapshot?.schema.functions, { isPresent: { returnType: "boolean" } });
  assert.deepEqual((snapshot?.schema.$defs as JsonObject).theme, {
    type: "object",
    properties: { primaryColor: { type: "string" } },
  });
});

test("does not resolve progressive component references or require a root ID", () => {
  const registry = registered();
  assert.equal(registry.validateComponent("test", { id: "not-root", component: "Button", child: "missing" }).ok, true);
});

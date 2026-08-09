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

test("discovers only direct Action property references defensively", () => {
  const source = catalog("actions", {
    CustomButton: {
      type: "object",
      properties: {
        id: { type: "string" }, component: { const: "CustomButton" },
        primaryAction: { $ref: "common_types.json#/$defs/Action" },
        config: { type: "object" },
        wrappedAction: { oneOf: [{ $ref: "common_types.json#/$defs/Action" }] },
      },
    },
  });
  (source.$defs as JsonObject).commonTypes = { $id: "common_types.json", $defs: { Action: { type: "object" } } };
  const registry = new CatalogRegistry();
  assert.equal(registry.register({ catalogId: "actions", schema: source }).ok, true);
  const result = registry.getActionProperties("actions", "CustomButton");
  assert.deepEqual(result, { ok: true, value: ["primaryAction"] });
  if (result.ok) result.value.push("config");
  assert.deepEqual(registry.getActionProperties("actions", "CustomButton"), { ok: true, value: ["primaryAction"] });
});

test("discovers wrapped and recursively nested dynamic value locations defensively", () => {
  const source = catalog("locations", {
    Complex: {
      type: "object",
      properties: {
        id: { type: "string" }, component: { const: "Complex" },
        min: { allOf: [
          { $ref: "common_types.json#/$defs/DynamicString" },
          { if: {}, then: {} },
        ] },
        config: { type: "object", properties: { title: { $ref: "common_types.json#/$defs/DynamicString" } } },
        options: { type: "array", items: { type: "object", properties: {
          label: { $ref: "common_types.json#/$defs/DynamicString" }, value: { type: "string" },
        } } },
        groups: { type: "array", items: { type: "object", properties: {
          items: { type: "array", items: { type: "object", properties: {
            label: { $ref: "common_types.json#/$defs/DynamicBoolean" },
          } } },
        } } },
        ignored: { oneOf: [{ $ref: "common_types.json#/$defs/DynamicString" }, { type: "number" }] },
      },
    },
  });
  (source.$defs as JsonObject).commonTypes = { $id: "common_types.json", $defs: {
    DynamicString: { oneOf: [{ type: "string" }, { type: "object" }] },
    DynamicBoolean: { oneOf: [{ type: "boolean" }, { type: "object" }] },
  } };
  const registry = new CatalogRegistry();
  assert.equal(registry.register({ catalogId: "locations", schema: source }).ok, true);
  const expected = [
    { path: [{ kind: "property", name: "min" }], valueKind: "dynamicString" },
    { path: [{ kind: "property", name: "config" }, { kind: "property", name: "title" }], valueKind: "dynamicString" },
    { path: [{ kind: "property", name: "options" }, { kind: "arrayItems" }, { kind: "property", name: "label" }], valueKind: "dynamicString" },
    { path: [{ kind: "property", name: "groups" }, { kind: "arrayItems" }, { kind: "property", name: "items" }, { kind: "arrayItems" }, { kind: "property", name: "label" }], valueKind: "dynamicBoolean" },
  ];
  const result = registry.getDynamicValueLocations("locations", "Complex");
  assert.deepEqual(result, { ok: true, value: expected });
  assert.deepEqual(registry.getDynamicProperties("locations", "Complex"), { ok: true, value: [] });
  if (result.ok) {
    result.value.push({ path: [], valueKind: "dynamicNumber" });
    (result.value[0]!.path[0] as { kind: "property"; name: string }).name = "changed";
  }
  assert.deepEqual(registry.getDynamicValueLocations("locations", "Complex"), { ok: true, value: expected });
});

test("discovers only direct supported dynamic property references defensively", () => {
  const source = catalog("dynamic", {
    Metric: {
      type: "object",
      properties: {
        id: { type: "string" }, component: { const: "Metric" },
        primaryValue: { $ref: "common_types.json#/$defs/DynamicNumber" },
        unusualLabel: { $ref: "common_types.json#/$defs/DynamicString" },
        wrapped: { oneOf: [{ $ref: "common_types.json#/$defs/DynamicBoolean" }] },
        metadata: { type: "object", properties: { path: { type: "string" } } },
      },
      required: ["id", "component"], additionalProperties: false,
    },
  });
  (source.$defs as JsonObject).commonTypes = {
    $id: "common_types.json",
    $defs: {
      DynamicNumber: { oneOf: [{ type: "number" }, { type: "object" }] },
      DynamicString: { oneOf: [{ type: "string" }, { type: "object" }] },
      DynamicBoolean: { oneOf: [{ type: "boolean" }, { type: "object" }] },
    },
  };
  const registry = new CatalogRegistry();
  assert.equal(registry.register({ catalogId: "dynamic", schema: source }).ok, true);
  const result = registry.getDynamicProperties("dynamic", "Metric");
  assert.deepEqual(result, { ok: true, value: [
    { property: "primaryValue", valueKind: "dynamicNumber" },
    { property: "unusualLabel", valueKind: "dynamicString" },
  ] });
  if (result.ok) result.value[0]!.property = "changed";
  const again = registry.getDynamicProperties("dynamic", "Metric");
  assert.equal(again.ok && again.value[0]?.property, "primaryValue");
});

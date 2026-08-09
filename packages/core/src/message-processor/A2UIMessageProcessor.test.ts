import assert from "node:assert/strict";
import { test } from "node:test";

import { CatalogRegistry } from "../catalog/index.js";
import type { JsonObject } from "../protocol/index.js";
import { SurfaceStore } from "../surfaces/index.js";
import { A2UIMessageProcessor } from "./A2UIMessageProcessor.js";

const envelope = (message: Record<string, unknown>) => ({ version: "v0.9.1", ...message });
const create = (surfaceId = "main", extra: Record<string, unknown> = {}) =>
  envelope({ createSurface: { surfaceId, catalogId: "catalog", ...extra } });
const components = (surfaceId: string, value: string, id = "root") =>
  envelope({
    updateComponents: {
      surfaceId,
      components: [{ id, component: "Text", text: value }],
    },
  });
const data = (surfaceId: string, update: Record<string, unknown> = {}) =>
  envelope({ updateDataModel: { surfaceId, ...update } });

function testCatalog(catalogId: string, components: JsonObject = {}): JsonObject {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    catalogId,
    components: {
      Text: {
        type: "object",
        properties: { id: { type: "string" }, component: { const: "Text" }, text: { type: "string" } },
        required: ["id", "component", "text"],
        additionalProperties: false,
      },
      Button: {
        type: "object",
        properties: { id: { type: "string" }, component: { const: "Button" }, label: { type: "string" } },
        required: ["id", "component", "label"],
        additionalProperties: false,
      },
      Column: {
        type: "object",
        properties: { id: { type: "string" }, component: { const: "Column" }, children: { type: "array", items: { type: "string" } } },
        required: ["id", "component", "children"],
        additionalProperties: false,
      },
      ...components,
    },
    $defs: {
      theme: {
        type: "object",
        properties: { primary: { type: "string" }, color: { type: "string" } },
        additionalProperties: false,
      },
    },
  };
}

function createTestCatalogRegistry(...catalogIds: string[]) {
  const catalogs = new CatalogRegistry();
  for (const catalogId of catalogIds.length === 0 ? ["catalog"] : catalogIds) {
    assert.equal(catalogs.register({ catalogId, schema: testCatalog(catalogId) }).ok, true);
  }
  return catalogs;
}

function setup(catalogs = createTestCatalogRegistry()) {
  const store = new SurfaceStore();
  return { store, catalogs, processor: new A2UIMessageProcessor(store, catalogs) };
}

test("creates a surface and preserves theme and sendDataModel", () => {
  const { store, processor } = setup();
  const result = processor.process(create("main", {
    theme: { primary: "blue" },
    sendDataModel: true,
  }));
  assert.equal(result.ok && result.value.operation, "surfaceCreated");
  assert.deepEqual(store.get("main"), {
    surfaceId: "main",
    catalogId: "catalog",
    theme: { primary: "blue" },
    sendDataModel: true,
    components: {},
    dataModel: {},
  });
});

test("preserves duplicate create as a store error", () => {
  const { processor } = setup();
  processor.process(create());
  assert.deepEqual(processor.process(create()), {
    ok: false,
    error: {
      code: "SURFACE_STORE_ERROR",
      storeError: { code: "SURFACE_ALREADY_EXISTS", surfaceId: "main" },
    },
  });
});

test("updates, replaces, and progressively delivers components without root", () => {
  const { store, processor } = setup();
  processor.process(create());
  assert.equal(processor.process(components("main", "child", "child")).ok, true);
  assert.equal(store.hasRoot("main"), false);
  processor.process(components("main", "old"));
  processor.process(components("main", "new"));
  assert.deepEqual(store.get("main")?.components.root, {
    id: "root", component: "Text", text: "new",
  });
});

test("component update before create preserves missing-surface error", () => {
  const { processor } = setup();
  assert.deepEqual(processor.process(components("main", "x")), {
    ok: false,
    error: {
      code: "SURFACE_STORE_ERROR",
      storeError: { code: "SURFACE_NOT_FOUND", surfaceId: "main" },
    },
  });
});

test("maps present data values to root replacement and nested set", () => {
  for (const update of [
    { value: { name: "Ada" } },
    { path: "/", value: { name: "Ada" } },
  ]) {
    const { store, processor } = setup();
    processor.process(create());
    processor.process(data("main", update));
    assert.deepEqual(store.get("main")?.dataModel, { name: "Ada" });
  }

  const { store, processor } = setup();
  processor.process(create());
  processor.process(data("main", { path: "/user/name", value: "Ada" }));
  assert.deepEqual(store.get("main")?.dataModel, { user: { name: "Ada" } });
});

test("distinguishes a present null value from an omitted value", () => {
  const { store, processor } = setup();
  processor.process(create());
  processor.process(data("main", { path: "/user/name", value: "Ada" }));
  processor.process(data("main", { path: "/user/name", value: null }));
  assert.deepEqual(store.get("main")?.dataModel, { user: { name: null } });
  processor.process(data("main", { path: "/user/name" }));
  assert.deepEqual(store.get("main")?.dataModel, { user: {} });
});

test("maps omitted values to nested deletion or root reset", () => {
  for (const update of [{}, { path: "/" }]) {
    const { store, processor } = setup();
    processor.process(create());
    processor.process(data("main", { value: { temporary: true } }));
    processor.process(data("main", update));
    assert.deepEqual(store.get("main")?.dataModel, {});
  }
});

test("protocol failures do not mutate the store", () => {
  const invalid = [
    { version: "v1", createSurface: { surfaceId: "main", catalogId: "x" } },
    { version: "v0.9.1", surfaceUpdate: { surfaceId: "main" } },
    { version: "v0.9.1", createSurface: {}, deleteSurface: {} },
    components("main", "x") as Record<string, unknown>,
  ];
  ((invalid[3].updateComponents as Record<string, unknown>).components as unknown[]) = [{ id: "x" }];

  const { store, processor } = setup();
  for (const input of invalid) {
    const result = processor.process(input);
    assert.equal(!result.ok && result.error.code, "PROTOCOL_VALIDATION_FAILED");
  }
  assert.deepEqual(store.list(), []);
});

test("data update and deletion before create preserve lifecycle errors", () => {
  const { processor } = setup();
  for (const input of [data("main", { value: 1 }), envelope({ deleteSurface: { surfaceId: "main" } })]) {
    const result = processor.process(input);
    assert.equal(!result.ok && result.error.code, "SURFACE_STORE_ERROR");
    assert.equal(!result.ok && result.error.code === "SURFACE_STORE_ERROR" && result.error.storeError.code, "SURFACE_NOT_FOUND");
  }
});

test("processes a complete sequence in received order", () => {
  const { store, processor } = setup();
  assert.equal(processor.process(create()).ok, true);
  assert.equal(processor.process(components("main", "one")).ok, true);
  assert.equal(processor.process(data("main", { path: "/name", value: "Ada" })).ok, true);
  assert.equal(processor.process(components("main", "two")).ok, true);
  assert.deepEqual(store.get("main")?.dataModel, { name: "Ada" });
  const deleted = processor.process(envelope({ deleteSurface: { surfaceId: "main" } }));
  assert.deepEqual(deleted, { ok: true, value: { operation: "surfaceDeleted", surfaceId: "main" } });
  assert.equal(store.has("main"), false);
});

test("isolates surfaces", () => {
  const { store, processor } = setup();
  processor.process(create("one"));
  processor.process(create("two"));
  processor.process(components("one", "changed"));
  processor.process(data("one", { path: "/changed", value: true }));
  assert.deepEqual(store.get("two")?.components, {});
  assert.deepEqual(store.get("two")?.dataModel, {});
});

test("failed DataModel mutation leaves all surface state intact", () => {
  const { store, processor } = setup();
  processor.process(create());
  processor.process(components("main", "stable"));
  processor.process(data("main", { value: { items: ["a", "b"] } }));
  const before = store.get("main");
  const result = processor.process(data("main", { path: "/items/0" }));
  assert.equal(!result.ok && result.error.code, "SURFACE_STORE_ERROR");
  if (!result.ok && result.error.code === "SURFACE_STORE_ERROR") {
    assert.equal(result.error.storeError.code, "DATA_MODEL_ERROR");
    if (result.error.storeError.code === "DATA_MODEL_ERROR") {
      assert.equal(result.error.storeError.dataModelError.code, "ARRAY_INDEX_DELETE_UNSUPPORTED");
    }
  }
  assert.deepEqual(store.get("main"), before);
});

test("does not retain caller input or expose mutable success state", () => {
  const { store, processor } = setup();
  const input = create("main", { theme: { color: "blue" } });
  const result = processor.process(input);
  ((input as Record<string, unknown>).createSurface as { theme: { color: string } }).theme.color = "red";
  assert.equal(store.get("main")?.theme?.color, "blue");
  if (result.ok && "surface" in result.value && result.value.surface.theme) {
    result.value.surface.theme.color = "green";
  }
  assert.equal(store.get("main")?.theme?.color, "blue");
});

test("requires a registered catalog before creating a surface", () => {
  const catalogs = new CatalogRegistry();
  const { store, processor } = setup(catalogs);
  const result = processor.process(create());
  assert.equal(!result.ok && result.error.code, "CATALOG_REGISTRY_ERROR");
  if (!result.ok && result.error.code === "CATALOG_REGISTRY_ERROR") {
    assert.equal(result.error.catalogError.code, "CATALOG_NOT_FOUND");
  }
  assert.equal(store.has("main"), false);
});

test("validates present themes, permits omission, and never stores invalid themes", () => {
  const { store, processor } = setup();
  assert.equal(processor.process(create("valid", { theme: { primary: "blue" } })).ok, true);
  assert.equal(processor.process(create("omitted")).ok, true);
  const invalid = processor.process(create("invalid", { theme: { primary: 123 } }));
  assert.equal(!invalid.ok && invalid.error.code, "CATALOG_REGISTRY_ERROR");
  if (!invalid.ok && invalid.error.code === "CATALOG_REGISTRY_ERROR") {
    assert.equal(invalid.error.catalogError.code, "THEME_VALIDATION_FAILED");
    assert.ok(invalid.error.catalogError.issues?.some(({ path }) => path === "/primary"));
  }
  assert.equal(store.has("invalid"), false);
});

test("stores a valid mixed component batch", () => {
  const { store, processor } = setup();
  processor.process(create());
  const result = processor.process(envelope({ updateComponents: { surfaceId: "main", components: [
    { id: "text", component: "Text", text: "Hello" },
    { id: "button", component: "Button", label: "Continue" },
    { id: "column", component: "Column", children: ["text", "button"] },
  ] } }));
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(store.get("main")?.components ?? {}), ["text", "button", "column"]);
});

test("rejects unknown and invalid components before storage", () => {
  const { store, processor } = setup();
  processor.process(create());
  for (const [component, code] of [
    [{ id: "danger", component: "ExecuteJavaScript" }, "COMPONENT_NOT_ALLOWED"],
    [{ id: "title", component: "Text", text: 123 }, "COMPONENT_VALIDATION_FAILED"],
  ] as const) {
    const result = processor.process(envelope({ updateComponents: { surfaceId: "main", components: [component] } }));
    assert.equal(!result.ok && result.error.code, "CATALOG_REGISTRY_ERROR");
    if (!result.ok && result.error.code === "CATALOG_REGISTRY_ERROR") {
      assert.equal(result.error.catalogError.code, code);
    }
    assert.deepEqual(store.get("main")?.components, {});
  }
});

test("prevalidates a complete component batch atomically", () => {
  const { store, processor } = setup();
  processor.process(create());
  const result = processor.process(envelope({ updateComponents: { surfaceId: "main", components: [
    { id: "text", component: "Text", text: "valid" },
    { id: "button", component: "Button", label: 42 },
    { id: "column", component: "Column", children: ["text", "button"] },
  ] } }));
  assert.equal(!result.ok && result.error.code, "CATALOG_REGISTRY_ERROR");
  assert.deepEqual(store.get("main")?.components, {});
});

test("preserves an existing component when its replacement is invalid", () => {
  const { store, processor } = setup();
  processor.process(create());
  processor.process(components("main", "stable"));
  processor.process(envelope({ updateComponents: { surfaceId: "main", components: [
    { id: "root", component: "Text", text: false },
  ] } }));
  assert.deepEqual(store.get("main")?.components.root, { id: "root", component: "Text", text: "stable" });
});

test("uses only the surface-selected catalog and supports delete/recreate selection", () => {
  const catalogs = new CatalogRegistry();
  assert.equal(catalogs.register({ catalogId: "catalog-a", schema: testCatalog("catalog-a") }).ok, true);
  assert.equal(catalogs.register({ catalogId: "catalog-b", schema: testCatalog("catalog-b", {
    Chart: {
      type: "object",
      properties: { id: { type: "string" }, component: { const: "Chart" } },
      required: ["id", "component"],
      additionalProperties: false,
    },
  }) }).ok, true);
  const { store, processor } = setup(catalogs);
  processor.process(envelope({ createSurface: { surfaceId: "main", catalogId: "catalog-a" } }));
  const chart = envelope({ updateComponents: { surfaceId: "main", components: [{ id: "chart", component: "Chart" }] } });
  assert.equal(processor.process(chart).ok, false);
  assert.deepEqual(store.get("main")?.components, {});
  assert.equal(processor.process(envelope({ deleteSurface: { surfaceId: "main" } })).ok, true);
  assert.equal(processor.process(envelope({ createSurface: { surfaceId: "main", catalogId: "catalog-b" } })).ok, true);
  assert.equal(processor.process(chart).ok, true);
  assert.equal(store.get("main")?.catalogId, "catalog-b");
});

import assert from "node:assert/strict";
import { test } from "node:test";

import { CatalogRegistry } from "../catalog/index.js";
import type { JsonObject } from "../protocol/index.js";
import { SurfaceStore } from "../surfaces/index.js";
import { A2UIMessageProcessor } from "./A2UIMessageProcessor.js";

const envelope = (message: Record<string, unknown>) => ({ version: "1.0", ...message });
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
    protocolVersion: "1.0",
    catalogId,
    components: {
      Text: {
        type: "object",
        properties: { component: { const: "Text" }, text: { type: "string" } },
        required: ["component", "text"],
        additionalProperties: false,
      },
      Button: {
        type: "object",
        properties: { component: { const: "Button" }, label: { type: "string" } },
        required: ["component", "label"],
        additionalProperties: false,
      },
      Column: {
        type: "object",
        properties: { component: { const: "Column" }, children: { type: "array", items: { type: "string" } } },
        required: ["component", "children"],
        additionalProperties: false,
      },
      ...components,
    },
    $defs: {
      anyComponent: { type: "object" },
      anyFunction: { type: "object" },
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

test("creates a surface with sendDataModel and reports the snapshot", () => {
  const { processor, store } = setup();
  const result = processor.process(create("main", { sendDataModel: true }));
  assert.equal(result.ok, true);
  if (result.ok && "surface" in result.value) {
    assert.equal(result.value.operation, "surfaceCreated");
    assert.equal(result.value.surface.sendDataModel, true);
    assert.deepEqual(result.value.surface.components, {});
  }
  assert.equal(store.get("main")?.catalogId, "catalog");
});

test("createSurface applies dataModel before components in one atomic step", () => {
  const { processor, store } = setup();
  const result = processor.process(envelope({
    createSurface: {
      surfaceId: "main",
      catalogId: "catalog",
      dataModel: { title: "Hello" },
      components: [{ id: "root", component: "Text", text: "Hello" }],
    },
  }));
  assert.equal(result.ok, true);
  assert.deepEqual(store.get("main")?.dataModel, { title: "Hello" });
  assert.deepEqual(Object.keys(store.get("main")?.components ?? {}), ["root"]);
});

test("createSurface without catalogId is accepted when it has no components, and stores no default catalog", () => {
  const { processor, store } = setup();
  const result = processor.process(envelope({ createSurface: { surfaceId: "main" } }));
  assert.equal(result.ok, true);
  assert.equal(store.get("main")?.catalogId, undefined);
});

test("a createSurface with an invalid component creates no surface and applies no data", () => {
  const { processor, store } = setup();
  const result = processor.process(envelope({
    createSurface: {
      surfaceId: "main",
      catalogId: "catalog",
      dataModel: { partial: true },
      components: [
        { id: "root", component: "Text", text: "ok" },
        { id: "bad", component: "Text", text: 42 },
      ],
    },
  }));
  assert.equal(result.ok, false);
  assert.equal(store.has("main"), false);
  assert.equal(store.list().length, 0);
});

test("a createSurface with duplicate component ids creates no surface", () => {
  const { processor, store } = setup();
  const result = processor.process(envelope({
    createSurface: {
      surfaceId: "main",
      catalogId: "catalog",
      components: [
        { id: "root", component: "Text", text: "a" },
        { id: "root", component: "Text", text: "b" },
      ],
    },
  }));
  assert.equal(result.ok, false);
  if (!result.ok && result.error.code === "SURFACE_STORE_ERROR") {
    assert.equal(result.error.storeError.code, "DUPLICATE_COMPONENT_ID");
  }
  assert.equal(store.has("main"), false);
});

test("a duplicate createSurface is an INTEGRITY_ERROR and leaves the live surface untouched", () => {
  const { processor, store } = setup();
  assert.equal(processor.process(create()).ok, true);
  const result = processor.process(create());
  assert.deepEqual(result, {
    ok: false,
    error: { code: "SURFACE_STORE_ERROR", storeError: { code: "INTEGRITY_ERROR", surfaceId: "main" } },
  });
  assert.equal(store.list().length, 1);
});

test("rejects theme on createSurface at the protocol level", () => {
  const { processor, store } = setup();
  const result = processor.process(create("main", { theme: { primary: "blue" } }));
  assert.equal(result.ok, false);
  if (!result.ok && result.error.code === "PROTOCOL_VALIDATION_FAILED") {
    assert.equal(result.error.issues[0]?.path, "/createSurface/theme");
  }
  assert.equal(store.has("main"), false);
});

test("rejects an unregistered catalog before any lifecycle work", () => {
  const { processor, store } = setup();
  const result = processor.process(envelope({ createSurface: { surfaceId: "main", catalogId: "missing" } }));
  assert.equal(result.ok, false);
  if (!result.ok && result.error.code === "CATALOG_REGISTRY_ERROR") {
    assert.equal(result.error.catalogError.code, "CATALOG_NOT_FOUND");
  }
  assert.equal(store.has("main"), false);
});

test("updates components on an existing surface and rejects an unknown surface", () => {
  const { processor, store } = setup();
  assert.equal(processor.process(create()).ok, true);
  const updated = processor.process(components("main", "Hello"));
  assert.equal(updated.ok, true);
  assert.equal(store.get("main")?.components.root?.component, "Text");

  const missing = processor.process(components("missing", "Hello"));
  assert.equal(missing.ok, false);
  if (!missing.ok && missing.error.code === "SURFACE_STORE_ERROR") {
    assert.equal(missing.error.storeError.code, "SURFACE_NOT_FOUND");
  }
});

test("rejects updateComponents that tries to target the implicit Surface", () => {
  const { processor } = setup();
  assert.equal(processor.process(create()).ok, true);
  const result = processor.process(envelope({
    updateComponents: { surfaceId: "main", components: [{ id: "root", component: "Surface" }] },
  }));
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error.code, "PROTOCOL_VALIDATION_FAILED");
});

test("rejects component ids that are not Unicode identifiers", () => {
  const { processor } = setup();
  assert.equal(processor.process(create()).ok, true);
  for (const id of ["user-card", "1st_item"]) {
    const result = processor.process(components("main", "x", id));
    assert.equal(result.ok, false, `${id} must be rejected`);
  }
});

test("updateDataModel with value null deletes the key at path and preserves siblings", () => {
  const { processor, store } = setup();
  assert.equal(processor.process(create("main", { dataModel: { user: { name: "Ada", bio: "x" } } })).ok, true);
  const result = processor.process(data("main", { path: "/user/bio", value: null }));
  assert.equal(result.ok, true);
  assert.deepEqual(store.get("main")?.dataModel, { user: { name: "Ada" } });
});

test("updateDataModel with value null at the root resets the model to an empty object", () => {
  const { processor, store } = setup();
  assert.equal(processor.process(create("main", { dataModel: { count: 42 } })).ok, true);
  assert.equal(processor.process(data("main", { path: "/", value: null })).ok, true);
  assert.deepEqual(store.get("main")?.dataModel, {});
});

test("updateDataModel with null on an array element keeps the index and stores null", () => {
  const { processor, store } = setup();
  assert.equal(processor.process(create("main", { dataModel: { items: ["a", "b", "c"] } })).ok, true);
  assert.equal(processor.process(data("main", { path: "/items/1", value: null })).ok, true);
  assert.deepEqual(store.get("main")?.dataModel, { items: ["a", null, "c"] });
});

test("updateDataModel replaces the whole model when path is omitted", () => {
  const { processor, store } = setup();
  assert.equal(processor.process(create("main", { dataModel: { old: true } })).ok, true);
  assert.equal(processor.process(data("main", { value: { fresh: 1 } })).ok, true);
  assert.deepEqual(store.get("main")?.dataModel, { fresh: 1 });
});

test("updateDataModel sets a non-null value at a nested path", () => {
  const { processor, store } = setup();
  assert.equal(processor.process(create()).ok, true);
  assert.equal(processor.process(data("main", { path: "/user/name", value: "Ada" })).ok, true);
  assert.deepEqual(store.get("main")?.dataModel, { user: { name: "Ada" } });
});

test("updateDataModel without value is a protocol validation failure", () => {
  const { processor, store } = setup();
  assert.equal(processor.process(create()).ok, true);
  const result = processor.process(data("main", { path: "/title" }));
  assert.equal(result.ok, false);
  if (!result.ok && result.error.code === "PROTOCOL_VALIDATION_FAILED") {
    assert.equal(result.error.issues[0]?.path, "/updateDataModel/value");
  }
  assert.deepEqual(store.get("main")?.dataModel, {});
});

test("agentFunctionResponse with no pending call is ignored; callRendererFunction is answered as a response", () => {
  const { processor } = setup();
  // Remote calls are executed by the evaluator. Remote-call behavior is covered in remoteFunctions.test.ts.
  const call = processor.process(envelope({
    callRendererFunction: {
      functionCallId: "call-1",
      callFunction: { "@call": "formatDate", catalogId: "catalog", args: {} },
    },
  }));
  assert.equal(call.ok, true);
  if (call.ok) assert.equal(call.value.operation, "rendererFunctionResponded");
  // call-1 names a renderer call, not a pending agent call, so the response matches nothing and is ignored.
  const response = processor.process(envelope({ agentFunctionResponse: { functionCallId: "call-1", value: 1 } }));
  assert.deepEqual(response, { ok: true, value: { operation: "agentFunctionIgnored", functionCallId: "call-1" } });
});

test("rejects v0.9 and v0.9.1 envelopes and legacy messages", () => {
  const { processor } = setup();
  for (const message of [
    { version: "v0.9.1", createSurface: { surfaceId: "main", catalogId: "catalog" } },
    { version: "v0.9", createSurface: { surfaceId: "main", catalogId: "catalog" } },
    { version: "1.0", surfaceUpdate: { surfaceId: "main" } },
    { version: "1.0", createSurface: {}, deleteSurface: {} },
  ]) {
    const result = processor.process(message);
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error.code, "PROTOCOL_VALIDATION_FAILED");
  }
});

test("deletes a surface, then allows the same surfaceId to be created again", () => {
  const { processor, store } = setup();
  assert.equal(processor.process(create()).ok, true);
  const deleted = processor.process(envelope({ deleteSurface: { surfaceId: "main" } }));
  assert.deepEqual(deleted, { ok: true, value: { operation: "surfaceDeleted", surfaceId: "main" } });
  assert.equal(store.has("main"), false);
  assert.equal(processor.process(create()).ok, true);
});

test("uses the catalog registered for each surface's own catalogId", () => {
  const catalogs = createTestCatalogRegistry("catalog-a", "catalog-b");
  const { processor, store } = setup(catalogs);
  assert.equal(processor.process(envelope({ createSurface: { surfaceId: "main", catalogId: "catalog-a" } })).ok, true);
  assert.equal(processor.process(envelope({ deleteSurface: { surfaceId: "main" } })).ok, true);
  assert.equal(processor.process(envelope({ createSurface: { surfaceId: "main", catalogId: "catalog-b" } })).ok, true);
  assert.equal(store.get("main")?.catalogId, "catalog-b");
});

test("updateDataModel with value null removes a top-level key and keeps its siblings", () => {
  const { processor, store } = setup();
  assert.equal(processor.process(create("main", { dataModel: { persistentData: "keep", transientData: "remove" } })).ok, true);
  assert.equal(processor.process(data("main", { path: "/transientData", value: null })).ok, true);
  assert.deepEqual(store.get("main")?.dataModel, { persistentData: "keep" });
});

test("updateDataModel with value null on an intermediate object removes every nested child", () => {
  const { processor, store } = setup();
  assert.equal(processor.process(create("main", {
    dataModel: { settings: { notifications: { email: true, push: false }, theme: "dark" } },
  })).ok, true);
  assert.equal(processor.process(data("main", { path: "/settings/notifications", value: null })).ok, true);
  assert.deepEqual(store.get("main")?.dataModel, { settings: { theme: "dark" } });
});

import assert from "node:assert/strict";
import { test } from "node:test";

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

function setup() {
  const store = new SurfaceStore();
  return { store, processor: new A2UIMessageProcessor(store) };
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

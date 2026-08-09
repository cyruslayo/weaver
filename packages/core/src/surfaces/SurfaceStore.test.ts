import assert from "node:assert/strict";
import { test } from "node:test";

import type { A2UIComponent } from "../protocol/index.js";
import { SurfaceStore } from "./SurfaceStore.js";
import type { SurfaceChange } from "./types.js";

const createMain = (store: SurfaceStore) =>
  store.create({ surfaceId: "main", catalogId: "catalog" });

const text = (id: string, value: string): A2UIComponent => ({
  id,
  component: "Text",
  text: value,
});

test("creates, finds, and defaults a surface", () => {
  const store = new SurfaceStore();
  const result = createMain(store);
  assert.equal(result.ok, true);
  assert.equal(store.has("main"), true);
  assert.deepEqual(store.get("main"), {
    surfaceId: "main",
    catalogId: "catalog",
    sendDataModel: false,
    components: {},
  });
  assert.equal(store.get("missing"), undefined);
});

test("rejects duplicate active surfaces without overwriting them", () => {
  const store = new SurfaceStore();
  createMain(store);
  const result = store.create({ surfaceId: "main", catalogId: "other", sendDataModel: true });
  assert.deepEqual(result, {
    ok: false,
    error: { code: "SURFACE_ALREADY_EXISTS", surfaceId: "main" },
  });
  assert.equal(store.get("main")?.catalogId, "catalog");
});

test("deletes, reports missing deletion, and permits recreation", () => {
  const store = new SurfaceStore();
  createMain(store);
  assert.deepEqual(store.delete("main"), { ok: true, value: undefined });
  assert.deepEqual(store.delete("main"), {
    ok: false,
    error: { code: "SURFACE_NOT_FOUND", surfaceId: "main" },
  });
  assert.equal(createMain(store).ok, true);
});

test("lists active surfaces in insertion order as snapshots", () => {
  const store = new SurfaceStore();
  store.create({ surfaceId: "a", catalogId: "one" });
  store.create({ surfaceId: "b", catalogId: "two" });
  assert.deepEqual(store.list().map(({ surfaceId }) => surfaceId), ["a", "b"]);
});

test("clones creation input and returned snapshots", () => {
  const store = new SurfaceStore();
  const theme = { primaryColor: "blue", nested: { shades: ["navy"] } };
  store.create({ surfaceId: "main", catalogId: "catalog", theme });
  theme.primaryColor = "red";
  theme.nested.shades[0] = "black";
  const snapshot = store.get("main");
  assert.ok(snapshot?.theme);
  snapshot.theme.primaryColor = "green";
  (snapshot.theme.nested as { shades: string[] }).shades[0] = "white";
  assert.deepEqual(store.get("main")?.theme, {
    primaryColor: "blue",
    nested: { shades: ["navy"] },
  });
});

test("adds components and clones inputs and snapshots", () => {
  const store = new SurfaceStore();
  createMain(store);
  const component = text("title", "Original");
  store.updateComponents("main", [component]);
  component.text = "input mutation";
  const snapshot = store.get("main");
  assert.ok(snapshot);
  snapshot.components.title.text = "snapshot mutation";
  assert.equal(store.get("main")?.components.title.text, "Original");
});

test("adds several components and replaces complete components by ID", () => {
  const store = new SurfaceStore();
  createMain(store);
  store.updateComponents("main", [
    { ...text("title", "Old"), variant: "h1" },
    text("button", "Go"),
  ]);
  store.updateComponents("main", [text("title", "New")]);
  assert.deepEqual(store.get("main")?.components, {
    title: text("title", "New"),
    button: text("button", "Go"),
  });
});

test("rejects duplicate batch IDs atomically", () => {
  const store = new SurfaceStore();
  createMain(store);
  store.updateComponents("main", [text("existing", "safe")]);
  const result = store.updateComponents("main", [text("new", "A"), text("new", "B")]);
  assert.deepEqual(result, {
    ok: false,
    error: { code: "DUPLICATE_COMPONENT_ID", surfaceId: "main", componentId: "new" },
  });
  assert.deepEqual(Object.keys(store.get("main")?.components ?? {}), ["existing"]);
});

test("supports progressive components, late root, and unresolved children", () => {
  const store = new SurfaceStore();
  createMain(store);
  assert.equal(store.updateComponents("main", [text("title", "Hello")]).ok, true);
  assert.equal(store.updateComponents("main", [{ id: "layout", component: "Column", children: ["missing"] }]).ok, true);
  assert.equal(store.hasRoot("main"), false);
  assert.equal(store.updateComponents("main", [{ id: "root", component: "Column", children: ["title"] }]).ok, true);
  assert.equal(store.hasRoot("main"), true);
});

test("returns SURFACE_NOT_FOUND for component updates", () => {
  const store = new SurfaceStore();
  assert.deepEqual(store.updateComponents("missing", [text("title", "Hi")]), {
    ok: false,
    error: { code: "SURFACE_NOT_FOUND", surfaceId: "missing" },
  });
});

test("isolates surfaces", () => {
  const store = new SurfaceStore();
  store.create({ surfaceId: "surface-a", catalogId: "catalog" });
  store.create({ surfaceId: "surface-b", catalogId: "catalog" });
  store.updateComponents("surface-a", [text("title", "A")]);
  assert.deepEqual(store.get("surface-b")?.components, {});
});

test("notifies once after each successful mutation and never after failures", () => {
  const store = new SurfaceStore();
  const changes: SurfaceChange[] = [];
  store.subscribe("main", (change) => changes.push(change));
  createMain(store);
  store.create({ surfaceId: "main", catalogId: "duplicate" });
  store.updateComponents("main", [text("a", "A"), text("b", "B")]);
  store.updateComponents("main", [text("duplicate", "A"), text("duplicate", "B")]);
  store.delete("main");
  store.delete("main");
  assert.deepEqual(changes.map(({ type }) => type), ["created", "componentsUpdated", "deleted"]);
  const update = changes[1];
  assert.equal(update?.type, "componentsUpdated");
  if (update?.type === "componentsUpdated") assert.deepEqual(update.componentIds, ["a", "b"]);
});

test("unsubscribe stops notifications", () => {
  const store = new SurfaceStore();
  let calls = 0;
  const unsubscribe = store.subscribe("main", () => calls++);
  createMain(store);
  unsubscribe();
  store.updateComponents("main", [text("title", "Hi")]);
  assert.equal(calls, 1);
});

test("subscriber mutation cannot alter state or another subscriber event", () => {
  const store = new SurfaceStore();
  createMain(store);
  let observed = "";
  store.subscribe("main", (change) => {
    if (change.type === "componentsUpdated") change.surface.components.title.text = "mutated";
  });
  store.subscribe("main", (change) => {
    if (change.type === "componentsUpdated") observed = String(change.surface.components.title.text);
  });
  store.updateComponents("main", [text("title", "safe")]);
  assert.equal(observed, "safe");
  assert.equal(store.get("main")?.components.title.text, "safe");
});

test("subscriber exceptions do not prevent other callbacks or roll back state", () => {
  const store = new SurfaceStore();
  createMain(store);
  let called = false;
  store.subscribe("main", () => { throw new Error("subscriber failed"); });
  store.subscribe("main", () => { called = true; });
  assert.equal(store.updateComponents("main", [text("title", "safe")]).ok, true);
  assert.equal(called, true);
  assert.equal(store.get("main")?.components.title.text, "safe");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { CatalogRegistry } from "../catalog/index.js";
import type { ResolvedComponentInstance } from "../component-instances/index.js";
import type { JsonObject, JsonValue } from "../protocol/index.js";
import { SurfaceStore } from "../surfaces/index.js";
import { InputBindingWriter } from "./InputBindingWriter.js";

const ref = (name: string): JsonObject => ({ $ref: `common_types.json#/$defs/${name}` });
const dynamic = (literal: JsonObject): JsonObject => ({ oneOf: [literal, ref("PathBinding"), ref("FunctionCall")] });
function setup(data: JsonValue = {}) {
  const catalogId = "inputs";
  const component = (name: string, properties: JsonObject): JsonObject => ({
    type: "object", properties: { id: { type: "string" }, component: { const: name }, ...properties },
    required: ["id", "component"], additionalProperties: false,
  });
  const schema: JsonObject = {
    $schema: "https://json-schema.org/draft/2020-12/schema", $id: "https://example.test/inputs.json", catalogId,
    components: { EditableRating: component("EditableRating", {
      label: { type: "string" }, text: ref("DynamicString"), rating: ref("DynamicNumber"),
      enabled: ref("DynamicBoolean"), tags: ref("DynamicStringList"),
    }) }, functions: {}, $defs: { theme: { type: "object" }, commonTypes: { $id: "common_types.json", $defs: {
      PathBinding: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
      FunctionCall: { type: "object", properties: { call: { type: "string" }, args: { type: "object" } }, required: ["call", "args"], additionalProperties: false },
      DynamicString: dynamic({ type: "string" }), DynamicNumber: dynamic({ type: "number" }),
      DynamicBoolean: dynamic({ type: "boolean" }), DynamicStringList: dynamic({ type: "array", items: { type: "string" } }),
    } } },
  };
  const catalogs = new CatalogRegistry();
  assert.equal(catalogs.register({ catalogId, schema }).ok, true);
  const store = new SurfaceStore();
  assert.equal(store.create({ surfaceId: "s", catalogId, sendDataModel: true }).ok, true);
  assert.equal(store.replaceData("s", data).ok, true);
  const writer = new InputBindingWriter(store, catalogs);
  return { store, writer };
}
function instance(definition: JsonObject, scopePath = "/", collectionIndex?: number): ResolvedComponentInstance {
  return { sourceComponentId: definition.id as string, component: definition.component as string, scopePath,
    ...(collectionIndex === undefined ? {} : { collectionIndex }), definition: definition as ResolvedComponentInstance["definition"], relationships: [] };
}
function install(store: SurfaceStore, definition: JsonObject) {
  assert.equal(store.updateComponents("s", [definition as ResolvedComponentInstance["definition"]]).ok, true);
  return instance(definition);
}
function code(result: ReturnType<InputBindingWriter["write"]>) { assert.equal(result.ok, false); return result.ok ? "" : result.error.code; }

test("writes absolute strings locally and emits one ordinary store notification", () => {
  const { store, writer } = setup({ form: { name: "Old" } });
  const current = install(store, { id: "field", component: "EditableRating", text: { path: "/form/name" } });
  const changes: string[] = []; store.subscribe("s", (change) => changes.push(change.type));
  const result = writer.write({ surfaceId: "s", instance: current, property: "text", value: "Ada" });
  assert.deepEqual(result, { ok: true, value: { surfaceId: "s", sourceComponentId: "field", property: "text", path: "/form/name", value: "Ada" } });
  assert.deepEqual(store.getData("s", "/form/name"), { ok: true, value: "Ada" });
  assert.deepEqual(changes, ["dataModelUpdated"]);
});

test("resolves relative, nested, escaped, and template-absolute paths", () => {
  const { store, writer } = setup({ items: [{ name: "A" }, { name: "B" }], groups: [{ members: [{ name: "C" }, { name: "D", "a/b": { "m~n": "old" } }] }], settings: { enabled: false } });
  install(store, { id: "field", component: "EditableRating", text: { path: "name" }, enabled: { path: "/settings/enabled" } });
  const staleDefinition = { id: "field", component: "EditableRating", text: "caller is not trusted" };
  assert.equal(writer.write({ surfaceId: "s", instance: instance(staleDefinition, "/items/1", 1), property: "text", value: "Grace" }).ok, true);
  assert.equal(writer.write({ surfaceId: "s", instance: instance(staleDefinition, "/items/1", 1), property: "enabled", value: true }).ok, true);
  assert.deepEqual(store.getData("s", "/items"), { ok: true, value: [{ name: "A" }, { name: "Grace" }] });
  assert.deepEqual(store.getData("s", "/settings/enabled"), { ok: true, value: true });
  install(store, { id: "field", component: "EditableRating", text: { path: "a~1b/m~0n" } });
  const nested = writer.write({ surfaceId: "s", instance: instance(staleDefinition, "/groups/0/members/1", 1), property: "text", value: "escaped" });
  assert.equal(nested.ok, true); if (nested.ok) assert.equal(nested.value.path, "/groups/0/members/1/a~1b/m~0n");
  assert.deepEqual(store.getData("s", "/groups/0/members/1/a~1b/m~0n"), { ok: true, value: "escaped" });
});

test("accepts only exact destination dynamic types", () => {
  const cases: [string, JsonValue, JsonValue[], JsonValue[]][] = [
    ["text", "ok", [1, true, [], {}, null], []],
    ["rating", 2, ["2", true, null], [Number.NaN, Infinity, -Infinity]],
    ["enabled", false, [0, "true", null], []],
    ["tags", ["a", "b"], [["a", 2], "a", null], []],
  ];
  for (const [property, accepted, rejected, runtimeRejected] of cases) {
    const { store, writer } = setup({ value: "old" });
    const current = install(store, { id: "field", component: "EditableRating", [property]: { path: "/value" } });
    assert.equal(writer.write({ surfaceId: "s", instance: current, property, value: accepted }).ok, true);
    for (const value of [...rejected, ...runtimeRejected]) assert.equal(code(writer.write({ surfaceId: "s", instance: current, property, value })), "INPUT_VALUE_TYPE_MISMATCH");
    assert.equal(code(writer.write({ surfaceId: "s", instance: current, property, value: undefined as unknown as JsonValue })), "INPUT_VALUE_TYPE_MISMATCH");
  }
});

test("rejects literal, function, static, and absent properties before mutation", () => {
  const { store, writer } = setup({ value: "old" });
  const literal = install(store, { id: "field", component: "EditableRating", text: "fixed", rating: { call: "someFunction", args: {} }, label: "Label" });
  let notifications = 0; store.subscribe("s", () => notifications++);
  assert.equal(code(writer.write({ surfaceId: "s", instance: literal, property: "text", value: "new" })), "INPUT_PROPERTY_NOT_BOUND");
  assert.equal(code(writer.write({ surfaceId: "s", instance: literal, property: "rating", value: 1 })), "INPUT_PROPERTY_NOT_BOUND");
  assert.equal(code(writer.write({ surfaceId: "s", instance: literal, property: "label", value: "new" })), "INPUT_PROPERTY_NOT_DYNAMIC");
  assert.equal(code(writer.write({ surfaceId: "s", instance: literal, property: "missing", value: "new" })), "INPUT_PROPERTY_NOT_FOUND");
  assert.deepEqual(store.getData("s", "/value"), { ok: true, value: "old" }); assert.equal(notifications, 0);
});

test("rejects missing lifecycle state and root-relative bindings", () => {
  const { store, writer } = setup({ name: "old" });
  const current = install(store, { id: "field", component: "EditableRating", text: { path: "name" } });
  assert.equal(code(writer.write({ surfaceId: "missing", instance: current, property: "text", value: "new" })), "SURFACE_NOT_FOUND");
  assert.equal(code(writer.write({ surfaceId: "s", instance: current, property: "text", value: "new" })), "BINDING_PATH_RESOLUTION_FAILED");
  assert.equal(store.updateComponents("s", [{ id: "replacement", component: "EditableRating" }]).ok, true);
  // Updates are progressive rather than deletions, so use a fresh store to prove source absence.
  const other = setup({ name: "old" });
  assert.equal(code(other.writer.write({ surfaceId: "s", instance: current, property: "text", value: "new" })), "SOURCE_COMPONENT_NOT_FOUND");
});

test("store owns accepted arrays and successful results", () => {
  const { store, writer } = setup({ tags: [] });
  const current = install(store, { id: "field", component: "EditableRating", tags: { path: "/tags" } });
  const input = ["a"];
  const result = writer.write({ surfaceId: "s", instance: current, property: "tags", value: input });
  assert.equal(result.ok, true); input.push("caller");
  if (result.ok) (result.value.value as string[]).push("result");
  assert.deepEqual(store.getData("s", "/tags"), { ok: true, value: ["a"] });
});

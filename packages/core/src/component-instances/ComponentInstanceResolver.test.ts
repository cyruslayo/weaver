import assert from "node:assert/strict";
import { test } from "node:test";
import { CatalogRegistry } from "../catalog/index.js";
import { ComponentTreeResolver } from "../component-tree/index.js";
import type { JsonObject, JsonValue } from "../protocol/index.js";
import { SurfaceStore } from "../surfaces/index.js";
import { ComponentInstanceResolver } from "./ComponentInstanceResolver.js";

const childListRef = "common_types.json#/$defs/ChildList";
const componentIdRef = "common_types.json#/$defs/ComponentId";
function schema(name: string, structural: JsonObject = {}): JsonObject {
  return { type: "object", properties: { id: { type: "string" }, component: { const: name }, ...structural }, required: ["id", "component"], additionalProperties: false };
}
function setup(dataModel: JsonValue = {}) {
  const catalogId = "instances";
  const registry = new CatalogRegistry();
  assert.equal(registry.register({ catalogId, schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema", $id: "https://example.test/instances.json", catalogId,
    components: {
      Container: schema("Container", { before: { $ref: componentIdRef }, children: { $ref: childListRef }, after: { $ref: componentIdRef } }),
      Item: schema("Item", { children: { $ref: childListRef }, label: { $ref: componentIdRef } }),
      Leaf: schema("Leaf"),
    },
    $defs: { theme: { type: "object" }, commonTypes: { $id: "common_types.json", $defs: {
      ComponentId: { type: "string" }, ChildList: { oneOf: [
        { type: "array", items: { $ref: "#/$defs/ComponentId" } },
        { type: "object", properties: { path: { type: "string" }, componentId: { $ref: "#/$defs/ComponentId" } }, required: ["path", "componentId"], additionalProperties: false },
      ] },
    } } },
  } }).ok, true);
  const store = new SurfaceStore();
  assert.equal(store.create({ surfaceId: "s", catalogId }).ok, true);
  assert.equal(store.replaceData("s", dataModel).ok, true);
  const resolver = new ComponentInstanceResolver(new ComponentTreeResolver(registry));
  const snapshot = () => { const value = store.get("s"); assert.ok(value); return value; };
  return { store, resolver, snapshot };
}
function value(result: ReturnType<ComponentInstanceResolver["resolve"]>) {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}
function templateChildren(root: NonNullable<ReturnType<typeof value>["root"]>, index = 0) {
  const relationship = root.relationships[index];
  assert.equal(relationship?.kind, "template");
  return relationship?.kind === "template" ? relationship.children : [];
}

test("expands a dynamic list in order with positional identity and inherited descendant scope", () => {
  const { store, resolver, snapshot } = setup({ products: [{ name: "A" }, { name: "B" }] });
  store.updateComponents("s", [
    { id: "root", component: "Container", children: { path: "/products", componentId: "product-card" } },
    { id: "product-card", component: "Item", label: "product-name" },
    { id: "product-name", component: "Leaf" },
  ]);
  const result = value(resolver.resolve(snapshot()));
  const children = templateChildren(result.root!, 0);
  assert.deepEqual(children.map(({ sourceComponentId, scopePath, collectionIndex }) => ({ sourceComponentId, scopePath, collectionIndex })), [
    { sourceComponentId: "product-card", scopePath: "/products/0", collectionIndex: 0 },
    { sourceComponentId: "product-card", scopePath: "/products/1", collectionIndex: 1 },
  ]);
  assert.deepEqual(children.map((child) => child.relationships[0]?.kind === "single" && child.relationships[0].child?.scopePath), ["/products/0", "/products/1"]);
  assert.equal(children[0]?.definition.id, "product-card");
});

test("supports nested relative templates and collection indices", () => {
  const { store, resolver, snapshot } = setup({ groups: [{ members: ["a", "b"] }, { members: ["c"] }] });
  store.updateComponents("s", [
    { id: "root", component: "Container", children: { path: "/groups", componentId: "group" } },
    { id: "group", component: "Item", children: { path: "members", componentId: "member" } },
    { id: "member", component: "Leaf" },
  ]);
  const groups = templateChildren(value(resolver.resolve(snapshot())).root!);
  assert.deepEqual(groups.flatMap((group) => templateChildren(group).map(({ scopePath, collectionIndex }) => [scopePath, collectionIndex])), [
    ["/groups/0/members/0", 0], ["/groups/0/members/1", 1], ["/groups/1/members/0", 0],
  ]);
});

test("absolute nested paths resolve from model root", () => {
  const { store, resolver, snapshot } = setup({ groups: [{}], allUsers: ["a", "b"] });
  store.updateComponents("s", [
    { id: "root", component: "Container", children: { path: "/groups", componentId: "group" } },
    { id: "group", component: "Item", children: { path: "/allUsers", componentId: "user" } },
    { id: "user", component: "Leaf" },
  ]);
  const users = templateChildren(templateChildren(value(resolver.resolve(snapshot())).root!)[0]!);
  assert.deepEqual(users.map(({ scopePath }) => scopePath), ["/allUsers/0", "/allUsers/1"]);
});

test("empty, missing, invalid, and wrong-type collections are non-fatal and recover", () => {
  const { store, resolver, snapshot } = setup({ empty: [], wrong: {} });
  store.updateComponents("s", [{ id: "root", component: "Container", children: { path: "/empty", componentId: "item" } }, { id: "item", component: "Leaf" }]);
  let result = value(resolver.resolve(snapshot()));
  assert.deepEqual(templateChildren(result.root!), []);
  assert.deepEqual(result.issues, []);
  store.updateComponents("s", [{ id: "root", component: "Container", children: { path: "/missing", componentId: "item" } }]);
  result = value(resolver.resolve(snapshot()));
  assert.equal(result.issues[0]?.code, "TEMPLATE_COLLECTION_NOT_FOUND");
  store.setData("s", "/missing", [1, 2]);
  result = value(resolver.resolve(snapshot()));
  assert.equal(templateChildren(result.root!).length, 2);
  assert.deepEqual(result.issues, []);
  store.updateComponents("s", [{ id: "root", component: "Container", children: { path: "/wrong", componentId: "item" } }]);
  assert.equal(value(resolver.resolve(snapshot())).issues[0]?.code, "TEMPLATE_COLLECTION_NOT_ARRAY");
  store.updateComponents("s", [{ id: "root", component: "Container", children: { path: "/bad~2", componentId: "item" } }]);
  assert.equal(value(resolver.resolve(snapshot())).issues[0]?.code, "INVALID_TEMPLATE_COLLECTION_PATH");
});

test("missing template component recovers on a new snapshot", () => {
  const { store, resolver, snapshot } = setup({ items: [1] });
  store.updateComponents("s", [{ id: "root", component: "Container", children: { path: "/items", componentId: "later" } }]);
  assert.equal(value(resolver.resolve(snapshot())).issues[0]?.code, "MISSING_TEMPLATE_COMPONENT");
  store.updateComponents("s", [{ id: "later", component: "Leaf" }]);
  const recovered = value(resolver.resolve(snapshot()));
  assert.deepEqual(recovered.issues, []);
  assert.equal(templateChildren(recovered.root!).length, 1);
});

test("guards same component and scope while allowing the same component across scopes", () => {
  const { store, resolver, snapshot } = setup({ items: [1, 2, 3] });
  store.updateComponents("s", [
    { id: "root", component: "Container", children: { path: "/items", componentId: "item" } },
    { id: "item", component: "Item", children: { path: "/items", componentId: "item" } },
  ]);
  const result = value(resolver.resolve(snapshot()));
  assert.equal(templateChildren(result.root!).length, 3);
  assert.equal(result.issues.some(({ code }) => code === "CIRCULAR_TEMPLATE_EXPANSION"), true);
});

test("allows recursive templates at distinct finite scopes", () => {
  const { store, resolver, snapshot } = setup({ nodes: [{ children: [{ children: [] }] }] });
  store.updateComponents("s", [
    { id: "root", component: "Container", children: { path: "/nodes", componentId: "node" } },
    { id: "node", component: "Item", children: { path: "children", componentId: "node" } },
  ]);
  const result = value(resolver.resolve(snapshot()));
  const first = templateChildren(result.root!)[0]!;
  assert.equal(templateChildren(first)[0]?.scopePath, "/nodes/0/children/0");
  assert.equal(result.issues.some(({ code }) => code === "CIRCULAR_TEMPLATE_EXPANSION"), false);
});

test("preserves static and dynamic relationship properties without flattening", () => {
  const { store, resolver, snapshot } = setup({ items: [1] });
  store.updateComponents("s", [
    { id: "root", component: "Container", before: "a", children: { path: "/items", componentId: "item" }, after: "b" },
    { id: "a", component: "Leaf" }, { id: "b", component: "Leaf" }, { id: "item", component: "Leaf" },
  ]);
  assert.deepEqual(value(resolver.resolve(snapshot())).root?.relationships.map(({ property }) => property), ["before", "after", "children"]);
});

test("rebuilds after additions and removals and accepts primitive items", () => {
  const { store, resolver, snapshot } = setup({ items: ["a", 2] });
  store.updateComponents("s", [{ id: "root", component: "Container", children: { path: "/items", componentId: "item" } }, { id: "item", component: "Leaf" }]);
  assert.equal(templateChildren(value(resolver.resolve(snapshot())).root!).length, 2);
  store.replaceData("s", { items: [true, null, "c"] });
  assert.deepEqual(templateChildren(value(resolver.resolve(snapshot())).root!).map(({ scopePath }) => scopePath), ["/items/0", "/items/1", "/items/2"]);
  store.replaceData("s", { items: ["only"] });
  assert.deepEqual(templateChildren(value(resolver.resolve(snapshot())).root!).map(({ scopePath }) => scopePath), ["/items/0"]);
});

test("returned definitions, relationships, children, and issues cannot mutate surface state", () => {
  const { store, resolver, snapshot } = setup({ items: [1] });
  store.updateComponents("s", [{ id: "root", component: "Container", children: { path: "/items", componentId: "missing" } }]);
  const first = value(resolver.resolve(snapshot()));
  first.root!.definition.id = "changed";
  first.root!.relationships.length = 0;
  first.issues.length = 0;
  const second = value(resolver.resolve(snapshot()));
  assert.equal(second.root?.definition.id, "root");
  assert.equal(second.root?.relationships.length, 1);
  assert.equal(second.issues[0]?.code, "MISSING_TEMPLATE_COMPONENT");
});

test("missing root remains successful not-ready state", () => {
  const { resolver, snapshot } = setup();
  assert.deepEqual(value(resolver.resolve(snapshot())), { ready: false, issues: [] });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { CatalogRegistry } from "../catalog/index.js";
import { ComponentInstanceResolver, type ResolvedComponentInstance } from "../component-instances/index.js";
import { ComponentTreeResolver } from "../component-tree/index.js";
import { DataContext } from "../data-context/index.js";
import type { JsonObject, JsonValue } from "../protocol/index.js";
import { SurfaceStore } from "../surfaces/index.js";
import { ComponentPropertyResolver } from "./ComponentPropertyResolver.js";

const ref = (name: string): JsonObject => ({ $ref: `common_types.json#/$defs/${name}` });
function dynamic(literal: JsonObject): JsonObject {
  return { oneOf: [literal, ref("PathBinding"), ref("FunctionCall")] };
}
function setup(data: JsonValue = {}) {
  const catalogId = "properties";
  const registry = new CatalogRegistry();
  const component = (name: string, properties: JsonObject): JsonObject => ({
    type: "object",
    properties: { id: { type: "string" }, component: { const: name }, ...properties },
    required: ["id", "component"], additionalProperties: false,
  });
  const schema: JsonObject = {
    $schema: "https://json-schema.org/draft/2020-12/schema", $id: "https://example.test/properties.json", catalogId,
    components: {
      Display: component("Display", {
        title: ref("DynamicString"), amount: ref("DynamicNumber"), enabled: ref("DynamicBoolean"), tags: ref("DynamicStringList"),
        variant: { type: "string" }, metadata: { type: "object" }, slot: ref("ComponentId"), sections: ref("ChildList"),
      }),
      Metric: component("Metric", { primaryValue: ref("DynamicNumber"), name: ref("DynamicString"), sections: ref("ChildList") }),
      Leaf: component("Leaf", { name: ref("DynamicString") }),
    },
    $defs: { theme: { type: "object" }, commonTypes: { $id: "common_types.json", $defs: {
      ComponentId: { type: "string" },
      ChildList: { oneOf: [
        { type: "array", items: ref("ComponentId") },
        { type: "object", properties: { path: { type: "string" }, componentId: ref("ComponentId") }, required: ["path", "componentId"], additionalProperties: false },
      ] },
      PathBinding: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
      FunctionCall: { type: "object", properties: { call: { type: "string" }, args: { type: "object" } }, required: ["call", "args"], additionalProperties: false },
      DynamicString: dynamic({ type: "string" }),
      DynamicNumber: dynamic({ type: "number" }),
      DynamicBoolean: dynamic({ type: "boolean" }),
      DynamicStringList: dynamic({ type: "array", items: { type: "string" } }),
    } } },
  };
  assert.equal(registry.register({ catalogId, schema }).ok, true);
  const store = new SurfaceStore();
  assert.equal(store.create({ surfaceId: "s", catalogId }).ok, true);
  assert.equal(store.replaceData("s", data).ok, true);
  const properties = new ComponentPropertyResolver(registry);
  const instances = new ComponentInstanceResolver(new ComponentTreeResolver(registry));
  const snapshot = () => { const result = store.get("s"); assert.ok(result); return result; };
  return { catalogId, registry, store, properties, instances, snapshot };
}
function instance(definition: JsonObject, scopePath = "/", collectionIndex?: number): ResolvedComponentInstance {
  return {
    sourceComponentId: definition.id as string,
    component: definition.component as string,
    scopePath,
    ...(collectionIndex === undefined ? {} : { collectionIndex }),
    definition: definition as ResolvedComponentInstance["definition"],
    relationships: [],
  };
}
function ok<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected success");
  return result.value;
}

test("preserves typed dynamic literals and defensively clones arrays", () => {
  const { properties, catalogId } = setup();
  const result = ok(properties.resolve(instance({ id: "root", component: "Display", title: "Welcome", amount: 42, enabled: true, tags: ["A", "B"] }), DataContext.root({}), catalogId));
  assert.deepEqual(result.properties, { title: "Welcome", amount: 42, enabled: true, tags: ["A", "B"] });
  (result.properties.tags as string[]).push("changed");
  const again = ok(properties.resolve(instance({ id: "root", component: "Display", tags: ["A", "B"] }), DataContext.root({}), catalogId));
  assert.deepEqual(again.properties.tags, ["A", "B"]);
});

test("resolves absolute, relative, and item-scope absolute bindings", () => {
  const data = { company: "Acme", user: { name: "Root" }, items: [{ name: "A" }, { name: "B" }] };
  const { properties, catalogId } = setup(data);
  assert.equal(ok(properties.resolve(instance({ id: "a", component: "Display", title: { path: "/user/name" } }), DataContext.root(data), catalogId)).properties.title, "Root");
  const itemContext = ok(DataContext.root(data).createCollectionItemContext("/items", 1));
  assert.equal(ok(properties.resolve(instance({ id: "b", component: "Display", title: { path: "name" } }, "/items/1", 1), itemContext, catalogId)).properties.title, "B");
  assert.equal(ok(properties.resolve(instance({ id: "c", component: "Display", title: { path: "/company" } }, "/items/1", 1), itemContext, catalogId)).properties.title, "Acme");
});

test("keeps missing undefined and explicit null distinct", () => {
  const data = { explicit: null };
  const { properties, catalogId } = setup(data);
  const result = ok(properties.resolve(instance({ id: "root", component: "Display", title: { path: "/missing" }, amount: { path: "/explicit" } }), DataContext.root(data), catalogId));
  assert.equal(Object.hasOwn(result.properties, "title"), true);
  assert.equal(result.properties.title, undefined);
  assert.equal(result.properties.amount, null);
  assert.equal(result.issues.length, 1);
});

test("reports all bound dynamic type mismatches without coercion", () => {
  const data = { string: 123, number: "42", boolean: {}, list: ["A", 2] };
  const { properties, catalogId } = setup(data);
  const result = ok(properties.resolve(instance({
    id: "root", component: "Display", title: { path: "/string" }, amount: { path: "/number" },
    enabled: { path: "/boolean" }, tags: { path: "/list" },
  }), DataContext.root(data), catalogId));
  assert.deepEqual(result.issues.map(({ property }) => property), ["title", "amount", "enabled", "tags"]);
  assert.deepEqual(result.properties, { title: undefined, amount: undefined, enabled: undefined, tags: undefined });
});

test("defers function calls explicitly and does not execute them", () => {
  const { properties, catalogId } = setup();
  const result = ok(properties.resolve(instance({ id: "root", component: "Display", title: { call: "formatString", args: { value: "Hello" } } }), DataContext.root({}), catalogId));
  assert.equal(result.properties.title, undefined);
  assert.deepEqual(result.unresolved, [{ property: "title", reason: "FUNCTION_CALL_NOT_EVALUATED", functionCall: { call: "formatString", args: { value: "Hello" } } }]);
});

test("catalog metadata controls semantics and supports unusual dynamic names", () => {
  const { properties, catalogId } = setup({ value: 7 });
  const staticResult = ok(properties.resolve(instance({ id: "root", component: "Display", metadata: { path: "literal-metadata" } }), DataContext.root({}), catalogId));
  assert.deepEqual(staticResult.properties.metadata, { path: "literal-metadata" });
  const metric = ok(properties.resolve(instance({ id: "metric", component: "Metric", primaryValue: { path: "/value" } }), DataContext.root({ value: 7 }), catalogId));
  assert.equal(metric.properties.primaryValue, 7);
});

test("removes unusual structural fields from hydrated properties", () => {
  const { store, instances, properties, snapshot } = setup({ items: [1] });
  store.updateComponents("s", [
    { id: "root", component: "Display", title: "x", slot: "leaf", sections: { path: "/items", componentId: "metric" } },
    { id: "leaf", component: "Leaf", name: "static" }, { id: "metric", component: "Metric", primaryValue: 1 },
  ]);
  const surface = snapshot();
  const tree = ok(instances.resolve(surface));
  const hydrated = ok(properties.resolveTree(surface, tree));
  assert.equal(Object.hasOwn(hydrated.root!.properties, "slot"), false);
  assert.equal(Object.hasOwn(hydrated.root!.properties, "sections"), false);
  assert.deepEqual(hydrated.root!.relationships.map(({ property }) => property), ["slot", "sections"]);
});

test("hydrates nested template instances with their own relative scopes", () => {
  const { store, instances, properties, snapshot } = setup({ groups: [{ members: [{ name: "Ada" }, { name: "Grace" }] }] });
  store.updateComponents("s", [
    { id: "root", component: "Metric", sections: { path: "/groups", componentId: "group" } },
    { id: "group", component: "Metric", sections: { path: "members", componentId: "member" } },
    { id: "member", component: "Leaf", name: { path: "name" } },
  ]);
  const surface = snapshot();
  const hydrated = ok(properties.resolveTree(surface, ok(instances.resolve(surface))));
  const groups = hydrated.root!.relationships[0];
  assert.equal(groups?.kind, "template");
  const members = groups?.kind === "template" ? groups.children[0]!.relationships[0] : undefined;
  assert.equal(members?.kind, "template");
  assert.deepEqual(members?.kind === "template" ? members.children.map((child) => [child.scopePath, child.properties.name]) : [], [
    ["/groups/0/members/0", "Ada"], ["/groups/0/members/1", "Grace"],
  ]);
});

test("rebuilds after data changes and owns hydrated output independently", () => {
  const { store, instances, properties, snapshot } = setup({ name: "Ada" });
  store.updateComponents("s", [{ id: "root", component: "Leaf", name: { path: "/name" } }]);
  let surface = snapshot();
  const instanceTree = ok(instances.resolve(surface));
  const first = ok(properties.resolveTree(surface, instanceTree));
  first.root!.properties.name = "mutated";
  first.root!.unresolved.push({ property: "x", reason: "FUNCTION_CALL_NOT_EVALUATED", functionCall: { call: "x", args: {} } });
  first.root!.relationships.length = 0;
  assert.equal(instanceTree.root?.definition.name && (instanceTree.root.definition.name as JsonObject).path, "/name");
  assert.equal(snapshot().dataModel && (snapshot().dataModel as JsonObject).name, "Ada");
  store.setData("s", "/name", "Grace");
  surface = snapshot();
  const second = ok(properties.resolveTree(surface, ok(instances.resolve(surface))));
  assert.equal(second.root?.properties.name, "Grace");
  assert.deepEqual(second.root?.unresolved, []);
});

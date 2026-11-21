import assert from "node:assert/strict";
import { test } from "node:test";
import { CatalogRegistry } from "../catalog/index.js";
import { ComponentInstanceResolver, type ResolvedComponentInstance } from "../component-instances/index.js";
import { ComponentTreeResolver } from "../component-tree/index.js";
import { DataContext } from "../data-context/index.js";
import { FunctionEvaluator, FunctionRegistry } from "../functions/index.js";
import { catalogDocument, componentSchema, functionSchema, ref } from "../functions/catalogFixtures.test-helper.js";
import type { JsonObject, JsonValue } from "../protocol/index.js";
import { SurfaceStore } from "../surfaces/index.js";
import { ComponentPropertyResolver } from "./ComponentPropertyResolver.js";

/** Shorthand for a catalog function with every declared argument required. */
function fn(name: string, returnType: string, args: JsonObject = {}, required = Object.keys(args)): JsonObject {
  return functionSchema(name, { returnType, args, required });
}
function setup(data: JsonValue = {}, implementations: Record<string, (...args: any[]) => unknown> = {}) {
  const catalogId = "properties";
  const registry = new CatalogRegistry();
  const component = (name: string, properties: JsonObject): JsonObject => componentSchema(name, properties);
  const schema: JsonObject = catalogDocument(catalogId, {
    Display: component("Display", {
      title: ref("DynamicString"), amount: ref("DynamicNumber"), enabled: ref("DynamicBoolean"), tags: ref("DynamicStringList"),
      variant: { type: "string" }, metadata: { type: "object" }, slot: ref("ComponentId"), sections: ref("ChildList"),
    }),
    Metric: component("Metric", { primaryValue: ref("DynamicNumber"), name: ref("DynamicString"), sections: ref("ChildList") }),
    Leaf: component("Leaf", { name: ref("DynamicString") }),
    Card: component("Card", { details: ref("DynamicValue") }),
    Icon: component("Icon", { name: { oneOf: [
      { enum: ["home", "search"] },
      { type: "object", properties: { svgPath: { type: "string" } }, required: ["svgPath"], additionalProperties: false },
      ref("DataBinding"),
    ] }, metadata: { type: "object" } }),
    Nested: component("Nested", {
      options: { type: "array", items: { type: "object", properties: {
        label: ref("DynamicString"), value: { type: "string" }, metadata: { type: "object" },
      } } },
      min: { allOf: [ref("DynamicString"), { if: {}, then: {} }] },
      max: { allOf: [ref("DynamicString"), { if: {}, then: {} }] },
      tabs: { type: "array", items: { type: "object", properties: {
        title: ref("DynamicString"), id: { type: "string" }, child: ref("ComponentId"), metadata: { type: "string" },
      } } },
    }),
  }, {
    echo: fn("echo", "string", { value: ref("DynamicString") }),
    echoValue: fn("echoValue", "any", { value: ref("DynamicValue") }),
    consumeValue: fn("consumeValue", "void", { value: ref("DynamicValue") }),
    formatName: fn("formatName", "string", { value: ref("DynamicString") }),
    displayName: fn("displayName", "string", { name: ref("DynamicString") }),
    label: fn("label", "string", { value: ref("DynamicValue"), company: ref("DynamicString") }),
    outer: fn("outer", "string", { value: ref("DynamicValue") }),
    concat: fn("concat", "string", { left: ref("DynamicString"), right: ref("DynamicString") }),
    numberResult: fn("numberResult", "number"),
    wrongResult: fn("wrongResult", "boolean"),
    thrower: fn("thrower", "string", { value: ref("DynamicString") }),
    declaredButUnimplemented: fn("declaredButUnimplemented", "string"),
    objectResult: fn("objectResult", "object"),
    arrayResult: fn("arrayResult", "array"),
    sum: fn("sum", "number", { values: { type: "array", items: ref("DynamicNumber") } }),
  });
  assert.equal(registry.register({ catalogId, schema }).ok, true);
  const store = new SurfaceStore();
  assert.equal(store.create({ surfaceId: "s", catalogId }).ok, true);
  assert.equal(store.replaceData("s", data).ok, true);
  const functions = new FunctionRegistry(registry);
  for (const [name, implementation] of Object.entries(implementations)) {
    assert.equal(functions.register({ catalogId, name, effect: "pure", implementation: implementation as any }).ok, true);
  }
  const properties = new ComponentPropertyResolver(registry, new FunctionEvaluator(registry, functions));
  const instances = new ComponentInstanceResolver(new ComponentTreeResolver(registry));
  const snapshot = () => { const result = store.get("s"); assert.ok(result); return result; };
  return { catalogId, registry, store, functions, properties, instances, snapshot };
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
function errorCode(result: { ok: true } | { ok: false; error: { code: string } }): string {
  assert.equal(result.ok, false);
  return result.ok ? "" : result.error.code;
}

test("preserves typed dynamic literals and defensively clones arrays", () => {
  const { properties, catalogId } = setup();
  const result = ok(properties.resolve(instance({ id: "root", component: "Display", title: "Welcome", amount: 42, enabled: true, tags: ["A", "B"] }), DataContext.root({}), catalogId));
  assert.deepEqual(result.properties, { title: "Welcome", amount: 42, enabled: true, tags: ["A", "B"] });
  (result.properties.tags as string[]).push("changed");
  const again = ok(properties.resolve(instance({ id: "root", component: "Display", tags: ["A", "B"] }), DataContext.root({}), catalogId));
  assert.deepEqual(again.properties.tags, ["A", "B"]);
});

test("hydrates bindable unions as literals, absolute/relative bindings, missing state, and isolated mismatches", () => {
  const data = { icon: "search", explicit: { svgPath: "M1 1" }, bad: 42, items: [{ icon: "home" }] };
  const { properties, catalogId } = setup(data);
  const literalObject = { svgPath: "M0 0" };
  const literal = ok(properties.resolve(instance({ id: "literal", component: "Icon", name: literalObject, metadata: { "@path": "literal" } }), DataContext.root(data), catalogId));
  assert.deepEqual(literal.properties, { name: literalObject, metadata: { "@path": "literal" } });
  assert.notEqual(literal.properties.name, literalObject);
  assert.equal(ok(properties.resolve(instance({ id: "absolute", component: "Icon", name: { "@path": "/icon" } }), DataContext.root(data), catalogId)).properties.name, "search");
  const boundObject = ok(properties.resolve(instance({ id: "object", component: "Icon", name: { "@path": "/explicit" } }), DataContext.root(data), catalogId));
  assert.deepEqual(boundObject.properties.name, { svgPath: "M1 1" });
  (boundObject.properties.name as { svgPath: string }).svgPath = "changed";
  assert.deepEqual(data.explicit, { svgPath: "M1 1" });
  const context = ok(DataContext.root(data).createCollectionItemContext("/items", 0));
  assert.equal(ok(properties.resolve(instance({ id: "relative", component: "Icon", name: { "@path": "icon" } }, "/items/0", 0), context, catalogId)).properties.name, "home");
  const missing = ok(properties.resolve(instance({ id: "missing", component: "Icon", name: { "@path": "/missing" } }), DataContext.root(data), catalogId));
  assert.equal(missing.properties.name, undefined); assert.deepEqual(missing.issues, []);
  const invalid = ok(properties.resolve(instance({ id: "bad", component: "Icon", name: { "@path": "/bad" }, metadata: { keep: true } }), DataContext.root(data), catalogId));
  assert.equal(invalid.properties.name, undefined); assert.deepEqual(invalid.properties.metadata, { keep: true });
  assert.equal(invalid.issues[0]?.code, "BINDABLE_VALUE_TYPE_MISMATCH"); assert.equal(invalid.issues[0]?.path, "/name");
});

test("reports bindable relative-scope resolution failure with its typed cause", () => {
  const { properties, catalogId } = setup();
  const result = ok(properties.resolve(instance({ id: "root", component: "Icon", name: { "@path": "icon" } }), DataContext.root({}), catalogId));
  assert.equal(result.properties.name, undefined);
  const issue = result.issues[0]; assert.equal(issue?.code, "BINDABLE_VALUE_RESOLUTION_FAILED");
  if (issue?.code === "BINDABLE_VALUE_RESOLUTION_FAILED") assert.equal(issue.error.code, "RELATIVE_PATH_OUTSIDE_COLLECTION");
});

test("resolves absolute, relative, and item-scope absolute bindings", () => {
  const data = { company: "Acme", user: { name: "Root" }, items: [{ name: "A" }, { name: "B" }] };
  const { properties, catalogId } = setup(data);
  assert.equal(ok(properties.resolve(instance({ id: "a", component: "Display", title: { "@path": "/user/name" } }), DataContext.root(data), catalogId)).properties.title, "Root");
  const itemContext = ok(DataContext.root(data).createCollectionItemContext("/items", 1));
  assert.equal(ok(properties.resolve(instance({ id: "b", component: "Display", title: { "@path": "name" } }, "/items/1", 1), itemContext, catalogId)).properties.title, "B");
  assert.equal(ok(properties.resolve(instance({ id: "c", component: "Display", title: { "@path": "/company" } }, "/items/1", 1), itemContext, catalogId)).properties.title, "Acme");
});

test("keeps missing undefined and explicit null distinct", () => {
  const data = { explicit: null };
  const { properties, catalogId } = setup(data);
  const result = ok(properties.resolve(instance({ id: "root", component: "Display", title: { "@path": "/missing" }, amount: { "@path": "/explicit" } }), DataContext.root(data), catalogId));
  assert.equal(Object.hasOwn(result.properties, "title"), true);
  assert.equal(result.properties.title, undefined);
  assert.equal(result.properties.amount, null);
  assert.equal(result.issues.length, 1);
});

test("reports dynamic type mismatches, and coerces DynamicBoolean per the spec table", () => {
  const data = { string: 123, number: "42", boolean: {}, list: ["A", 2] };
  const { properties, catalogId } = setup(data);
  const result = ok(properties.resolve(instance({
    id: "root", component: "Display", title: { "@path": "/string" }, amount: { "@path": "/number" },
    enabled: { "@path": "/boolean" }, tags: { "@path": "/list" },
  }), DataContext.root(data), catalogId));
  // An object is not a boolean, so the DynamicBoolean table coerces it to false without a mismatch.
  assert.deepEqual(result.issues.map(({ property }) => property), ["title", "amount", "tags"]);
  assert.deepEqual(result.properties, { title: undefined, amount: undefined, enabled: false, tags: undefined });
});

test("evaluates a simple function call and uses its result as the property value", () => {
  const { properties, catalogId } = setup({}, {
    echo: (args: { value: string }) => args.value,
  });
  const result = ok(properties.resolve(instance({ id: "root", component: "Display", title: { "@call": "echo", args: { value: "Hello" } } }), DataContext.root({}), catalogId));
  assert.equal(result.properties.title, "Hello");
  assert.deepEqual(result.unresolved, []);
  assert.deepEqual(result.issues, []);
});

test("evaluates functions with absolute and relative bindings", () => {
  const data = { user: { name: "Root" }, items: [{ name: "A" }, { name: "B" }] };
  const { properties, catalogId } = setup(data, {
    echo: (args: { value: string }) => args.value,
  });
  assert.equal(ok(properties.resolve(instance({ id: "a", component: "Display", title: { "@call": "echo", args: { value: { "@path": "/user/name" } } } }), DataContext.root(data), catalogId)).properties.title, "Root");
  const itemContext = ok(DataContext.root(data).createCollectionItemContext("/items", 1));
  assert.equal(ok(properties.resolve(instance({ id: "b", component: "Display", title: { "@call": "echo", args: { value: { "@path": "name" } } } }, "/items/1", 1), itemContext, catalogId)).properties.title, "B");
});

test("evaluates nested functions through a single top-level evaluator call", () => {
  class CountingEvaluator extends FunctionEvaluator {
    calls = 0;
    override evaluate(catalogId: string, functionCall: unknown, dataContext: DataContext) {
      this.calls += 1;
      return super.evaluate(catalogId, functionCall, dataContext);
    }
  }
  const implementations = {
    echo: (args: { value: string }) => args.value,
    concat: (args: { left: string; right: string }) => `${args.left}${args.right}`,
    outer: (args: { value: string }) => String(args.value),
  };
  const { registry, catalogId } = setup();
  const functions = new FunctionRegistry(registry);
  for (const [name, implementation] of Object.entries(implementations)) {
    assert.equal(functions.register({ catalogId, name, effect: "pure", implementation: implementation as any }).ok, true);
  }
  const counting = new CountingEvaluator(registry, functions);
  const properties = new ComponentPropertyResolver(registry, counting);
  const result = ok(properties.resolve(instance({
    id: "root", component: "Display", title: {
      "@call": "concat",
      args: { left: { "@call": "echo", args: { value: "He" } }, right: { "@call": "outer", args: { value: { "@call": "echo", args: { value: "llo" } } } } },
    },
  }), DataContext.root({}), catalogId));
  assert.equal(result.properties.title, "Hello");
  assert.equal(counting.calls, 1);
});

test("applies destination dynamic type rules after evaluation", () => {
  const { properties, catalogId } = setup({}, {
    numberResult: () => 42,
  });
  const result = ok(properties.resolve(instance({ id: "root", component: "Display", title: { "@call": "numberResult", args: {} } }), DataContext.root({}), catalogId));
  assert.equal(result.properties.title, undefined);
  assert.deepEqual(result.issues, [{ code: "DYNAMIC_VALUE_TYPE_MISMATCH", sourceComponentId: "root", property: "title", expected: "dynamicString" }]);
});

test("withholds missing implementations as unresolved with an issue while other properties hydrate", () => {
  const { properties, catalogId } = setup();
  const result = ok(properties.resolve(instance({
    id: "root", component: "Display",
    title: { "@call": "declaredButUnimplemented", args: {} }, amount: 7,
  }), DataContext.root({}), catalogId));
  assert.equal(result.properties.title, undefined);
  assert.equal(result.properties.amount, 7);
  assert.deepEqual(result.unresolved, [{ property: "title", reason: "FUNCTION_EVALUATION_FAILED", functionCall: { "@call": "declaredButUnimplemented", args: {} } }]);
  assert.deepEqual(result.issues.map(({ code }) => code), ["FUNCTION_EVALUATION_FAILED"]);
  const failed = result.issues[0];
  if (failed && failed.code === "FUNCTION_EVALUATION_FAILED") {
    assert.equal(failed.error.code, "EXPRESSION_ERROR");
  }
});

test("records implementation exceptions as issues without leaking them", () => {
  const { properties, catalogId } = setup({}, {
    thrower: () => { throw new Error("secret"); },
  });
  const result = ok(properties.resolve(instance({ id: "root", component: "Display", title: { "@call": "thrower", args: { value: "x" } } }), DataContext.root({}), catalogId));
  assert.equal(result.properties.title, undefined);
  assert.equal(result.issues.length, 1);
  const issue = result.issues[0];
  assert.equal(issue?.code, "FUNCTION_EVALUATION_FAILED");
  if (issue && issue.code === "FUNCTION_EVALUATION_FAILED") {
    assert.equal(issue.error.code, "FUNCTION_EXECUTION_FAILED");
    assert.equal("stack" in issue.error, false);
  }
});

test("preserves function return contract violations without reaching hydrated properties", () => {
  const { properties, catalogId } = setup({}, {
    wrongResult: () => "not boolean",
  });
  const result = ok(properties.resolve(instance({ id: "root", component: "Display", enabled: { "@call": "wrongResult", args: {} } }), DataContext.root({}), catalogId));
  assert.equal(result.properties.enabled, undefined);
  assert.equal(result.issues.length, 1);
  const issue = result.issues[0];
  assert.equal(issue?.code, "FUNCTION_EVALUATION_FAILED");
  if (issue && issue.code === "FUNCTION_EVALUATION_FAILED") {
    assert.equal(issue.error.code, "FUNCTION_RETURN_TYPE_MISMATCH");
  }
});

test("controls runaway nesting with a bounded evaluator and keeps hydration non-fatal", () => {
  const { registry, catalogId } = setup();
  const functions = new FunctionRegistry(registry);
  assert.equal(functions.register({ catalogId, name: "outer", effect: "pure", implementation: (args) => String(args.value) }).ok, true);
  const bounded = new ComponentPropertyResolver(registry, new FunctionEvaluator(registry, functions, { maxDepth: 1 }));
  const call: JsonObject = { "@call": "outer", args: { value: { "@call": "outer", args: { value: "x" } } } };
  const result = ok(bounded.resolve(instance({ id: "root", component: "Display", title: call }), DataContext.root({}), catalogId));
  assert.equal(result.properties.title, undefined);
  assert.equal(result.issues.length, 1);
  const issue = result.issues[0];
  assert.equal(issue?.code, "FUNCTION_EVALUATION_FAILED");
  if (issue && issue.code === "FUNCTION_EVALUATION_FAILED") {
    assert.equal(issue.error.code, "FUNCTION_MAX_DEPTH_EXCEEDED");
  }
});

test("catalog metadata controls semantics and supports unusual dynamic names", () => {
  const { properties, catalogId } = setup({ value: 7 });
  const staticResult = ok(properties.resolve(instance({ id: "root", component: "Display", metadata: { "@path": "literal-metadata" } }), DataContext.root({}), catalogId));
  assert.deepEqual(staticResult.properties.metadata, { "@path": "literal-metadata" });
  const metric = ok(properties.resolve(instance({ id: "metric", component: "Metric", primaryValue: { "@path": "/value" } }), DataContext.root({ value: 7 }), catalogId));
  assert.equal(metric.properties.primaryValue, 7);
});

test("keeps function-looking static properties literal and does not execute them", () => {
  const { properties, catalogId } = setup();
  const result = ok(properties.resolve(instance({ id: "root", component: "Display", metadata: { "@call": "echo", args: {} } }), DataContext.root({}), catalogId));
  assert.deepEqual(result.properties.metadata, { "@call": "echo", args: {} });
  assert.deepEqual(result.unresolved, []);
  assert.deepEqual(result.issues, []);
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
    { id: "member", component: "Leaf", name: { "@path": "name" } },
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

test("evaluates functions per template instance with its own scope", () => {
  const data = { items: [{ name: "Ada" }, { name: "Grace" }] };
  const { store, instances, properties, snapshot } = setup(data, {
    displayName: (args: { name: string }) => `Hello ${args.name}`,
  });
  store.updateComponents("s", [
    { id: "root", component: "Display", sections: { path: "/items", componentId: "item" } },
    { id: "item", component: "Leaf", name: { "@call": "displayName", args: { name: { "@path": "name" } } } },
  ]);
  const surface = snapshot();
  const hydrated = ok(properties.resolveTree(surface, ok(instances.resolve(surface))));
  const items = hydrated.root!.relationships[0];
  assert.equal(items?.kind, "template");
  assert.deepEqual(items?.kind === "template" ? items.children.map((child) => [child.scopePath, child.properties.name]) : [], [
    ["/items/0", "Hello Ada"], ["/items/1", "Hello Grace"],
  ]);
  assert.deepEqual(hydrated.issues, []);
});

test("evaluates functions in nested template scopes with absolute root bindings", () => {
  const data = { company: { name: "Acme" }, groups: [{ members: [{ name: "Ada" }, { name: "Grace" }] }] };
  const { store, instances, properties, snapshot } = setup(data, {
    label: (args: { value: string; company: string }) => `${args.value} @ ${args.company}`,
    formatName: (args: { value: string }) => args.value,
  });
  store.updateComponents("s", [
    { id: "root", component: "Display", sections: { path: "/groups", componentId: "group" } },
    { id: "group", component: "Metric", sections: { path: "members", componentId: "member" } },
    { id: "member", component: "Leaf", name: { "@call": "label", args: { value: { "@call": "formatName", args: { value: { "@path": "name" } } }, company: { "@path": "/company/name" } } } },
  ]);
  const surface = snapshot();
  const hydrated = ok(properties.resolveTree(surface, ok(instances.resolve(surface))));
  const groups = hydrated.root!.relationships[0];
  assert.equal(groups?.kind, "template");
  const members = groups?.kind === "template" ? groups.children[0]!.relationships[0] : undefined;
  assert.equal(members?.kind, "template");
  assert.deepEqual(members?.kind === "template" ? members.children.map((child) => [child.scopePath, child.properties.name]) : [], [
    ["/groups/0/members/0", "Ada @ Acme"], ["/groups/0/members/1", "Grace @ Acme"],
  ]);
  assert.deepEqual(hydrated.issues, []);
});

test("a failed function in one template instance does not affect sibling instances", () => {
  const data = { items: [{ name: "Ada" }, { name: "Grace" }] };
  const { store, instances, properties, snapshot } = setup(data, {
    displayName: (args: { name: string }) => args.name.toUpperCase(),
  });
  store.updateComponents("s", [
    { id: "root", component: "Display", sections: { path: "/items", componentId: "item" } },
    { id: "item", component: "Leaf", name: { "@call": "displayName", args: { name: { "@path": "name" } } } },
  ]);
  const surface = snapshot();
  const hydrated = ok(properties.resolveTree(surface, ok(instances.resolve(surface))));
  const items = hydrated.root!.relationships[0];
  assert.equal(items?.kind, "template");
  assert.deepEqual(items?.kind === "template" ? items.children.map((child) => [child.scopePath, child.properties.name]) : [], [
    ["/items/0", "ADA"], ["/items/1", "GRACE"],
  ]);
  assert.deepEqual(hydrated.issues, []);
});

test("rebuilds after data changes and owns hydrated output independently", () => {
  const { store, instances, properties, snapshot } = setup({ name: "Ada" }, {
    echo: (args: { value: string }) => args.value,
  });
  store.updateComponents("s", [{ id: "root", component: "Leaf", name: { "@call": "echo", args: { value: { "@path": "/name" } } } }]);
  let surface = snapshot();
  const instanceTree = ok(instances.resolve(surface));
  const first = ok(properties.resolveTree(surface, instanceTree));
  assert.equal(first.root?.properties.name, "Ada");
  first.root!.properties.name = "mutated";
  first.root!.unresolved.push({ property: "x", reason: "FUNCTION_EVALUATION_FAILED", functionCall: { "@call": "x", args: {} } });
  first.root!.relationships.length = 0;
  assert.equal(((((instanceTree.root!.definition.name as JsonObject).args as JsonObject).value) as JsonObject)["@path"], "/name");
  assert.equal(snapshot().dataModel && (snapshot().dataModel as JsonObject).name, "Ada");
  store.setData("s", "/name", "Grace");
  surface = snapshot();
  const second = ok(properties.resolveTree(surface, ok(instances.resolve(surface))));
  assert.equal(second.root?.properties.name, "Grace");
  assert.deepEqual(second.root?.unresolved, []);
});

test("rebuilds after function registration without caching failure state", () => {
  const { store, instances, properties, snapshot, functions, catalogId } = setup({ name: "Ada" });
  store.updateComponents("s", [{ id: "root", component: "Leaf", name: { "@call": "echo", args: { value: { "@path": "/name" } } } }]);
  let surface = snapshot();
  let first = ok(properties.resolveTree(surface, ok(instances.resolve(surface))));
  assert.equal(first.root?.properties.name, undefined);
  assert.deepEqual(first.root?.unresolved, [{ property: "name", reason: "FUNCTION_EVALUATION_FAILED", functionCall: { "@call": "echo", args: { value: { "@path": "/name" } } } }]);
  assert.equal(functions.register({ catalogId, name: "echo", effect: "pure", implementation: (args) => String(args.value) }).ok, true);
  surface = snapshot();
  const second = ok(properties.resolveTree(surface, ok(instances.resolve(surface))));
  assert.equal(second.root?.properties.name, "Ada");
  assert.deepEqual(second.root?.unresolved, []);
  assert.deepEqual(second.issues, []);
  first = ok(properties.resolveTree(surface, ok(instances.resolve(surface))));
  assert.equal(first.root?.properties.name, "Ada");
});

test("keeps hydrated function results independent from implementation-owned objects", () => {
  const ownedArray = ["a", "b"];
  const { properties, catalogId } = setup({}, {
    echo: (args: { value: string }) => args.value,
    arrayResult: () => ownedArray,
  });
  const result = ok(properties.resolve(instance({
    id: "root", component: "Display",
    title: { "@call": "echo", args: { value: "fixed" } }, tags: { "@call": "arrayResult", args: {} },
  }), DataContext.root({}), catalogId));
  assert.equal(result.properties.title, "fixed");
  const tags = result.properties.tags as string[];
  tags.push("changed");
  assert.deepEqual(ownedArray, ["a", "b"]);
  const again = ok(properties.resolve(instance({
    id: "root", component: "Display",
    tags: { "@call": "arrayResult", args: {} },
  }), DataContext.root({}), catalogId));
  assert.deepEqual(again.properties.tags, ["a", "b"]);
});

test("keeps allowed undefined results progressive and distinguishes null", () => {
  const { properties, catalogId } = setup({}, {
    consumeValue: () => undefined,
    echoValue: () => null,
  });
  const undefinedResult = ok(properties.resolve(instance({
    id: "root", component: "Display",
    title: { "@call": "consumeValue", args: { value: { "@path": "/missing" } } },
  }), DataContext.root({}), catalogId));
  assert.equal(Object.hasOwn(undefinedResult.properties, "title"), true);
  assert.equal(undefinedResult.properties.title, undefined);
  assert.deepEqual(undefinedResult.issues, []);
  assert.deepEqual(undefinedResult.unresolved, []);
  const nullResult = ok(properties.resolve(instance({
    id: "root", component: "Display",
    title: { "@call": "echoValue", args: { value: "unused" } },
  }), DataContext.root({}), catalogId));
  assert.equal(nullResult.properties.title, null);
  assert.deepEqual(nullResult.issues, [{ code: "DYNAMIC_VALUE_TYPE_MISMATCH", sourceComponentId: "root", property: "title", expected: "dynamicString" }]);
});

test("keeps null function results explicit with the destination mismatch recorded", () => {
  const { properties, catalogId } = setup({}, {
    echoValue: () => null,
  });
  const result = ok(properties.resolve(instance({
    id: "root", component: "Display",
    title: { "@call": "echoValue", args: { value: "unused" } },
  }), DataContext.root({}), catalogId));
  assert.equal(result.properties.title, null);
  assert.deepEqual(result.issues, [{ code: "DYNAMIC_VALUE_TYPE_MISMATCH", sourceComponentId: "root", property: "title", expected: "dynamicString" }]);
});

test("hydrates nested titles while removing only structural child leaves", () => {
  const { properties, catalogId } = setup({ titles: { first: "First" } });
  const definition: JsonObject = { id: "root", component: "Nested", tabs: [
    { title: { "@path": "/titles/first" }, child: "panel-a", metadata: "keep" },
    { title: "Second", child: "panel-b" },
  ] };
  const result = ok(properties.resolve(instance(definition), DataContext.root({ titles: { first: "First" } }), catalogId));
  assert.deepEqual(result.properties.tabs, [
    { title: "First", metadata: "keep" }, { title: "Second" },
  ]);
  (result.properties.tabs as any[])[0]!.metadata = "changed";
  assert.equal(((definition.tabs as JsonObject[])[0] as JsonObject).metadata, "keep");
});

test("hydrates ChoicePicker-like labels, wrapped dates, and Tabs-like titles without touching static siblings", () => {
  const data = { labels: { a: "First" }, displayName: "Scoped", constraints: { minDate: "2026-08-01" } };
  const { properties, catalogId } = setup(data, {
    formatName: (args: { value: string }) => `Formatted ${args.value}`,
  });
  const definition: JsonObject = {
    id: "root", component: "Nested",
    options: [
      { label: "Literal", value: "stable-0", metadata: { "@path": "literal" } },
      { label: { "@path": "/labels/a" }, value: "stable-1", metadata: { "@call": "literal" } },
      { label: { "@path": "displayName" }, value: "stable-2" },
      { label: { "@call": "formatName", args: { value: "Name" } }, value: "stable-3" },
    ],
    min: { "@path": "/constraints/minDate" },
    max: { "@call": "formatName", args: { value: "2026-09-01" } },
    tabs: [{ id: "tab-a", title: { "@path": "/labels/a" } }],
  };
  const context = ok(DataContext.root({ ...data, items: [{ displayName: "Scoped" }] }).createCollectionItemContext("/items", 0));
  const result = ok(properties.resolve(instance(definition, "/items/0", 0), context, catalogId));
  assert.deepEqual(result.properties.options, [
    { label: "Literal", value: "stable-0", metadata: { "@path": "literal" } },
    { label: "First", value: "stable-1", metadata: { "@call": "literal" } },
    { label: "Scoped", value: "stable-2" },
    { label: "Formatted Name", value: "stable-3" },
  ]);
  assert.equal(result.properties.min, "2026-08-01");
  assert.equal(result.properties.max, "Formatted 2026-09-01");
  assert.deepEqual(result.properties.tabs, [{ id: "tab-a", title: "First" }]);
  assert.deepEqual(result.issues, []);
});

test("isolates nested missing, type mismatch, and function failures with precise runtime locations", () => {
  const { properties, catalogId } = setup({ wrong: 42 }, {
    thrower: () => { throw new Error("secret"); },
  });
  const definition: JsonObject = { id: "root", component: "Nested", options: [
    { label: { "@path": "/missing" }, value: "a" },
    { label: { "@path": "/wrong" }, value: "b" },
    { label: { "@call": "thrower", args: { value: "x" } }, value: "c" },
    { label: "Safe", value: "d" },
  ] };
  const result = ok(properties.resolve(instance(definition), DataContext.root({ wrong: 42 }), catalogId));
  assert.deepEqual(result.properties.options, [
    { label: undefined, value: "a" }, { label: undefined, value: "b" },
    { label: undefined, value: "c" }, { label: "Safe", value: "d" },
  ]);
  assert.deepEqual(result.issues.map((issue) => [issue.code, issue.path]), [
    ["DYNAMIC_VALUE_TYPE_MISMATCH", "/options/1/label"],
    ["FUNCTION_EVALUATION_FAILED", "/options/2/label"],
  ]);
  assert.deepEqual(result.unresolved.map(({ property, path }) => [property, path]), [["options", "/options/2/label"]]);
  (result.properties.options as Array<Record<string, unknown>>)[3]!.label = "mutated";
  result.issues[0]!.location![0] = { kind: "property", name: "changed" };
  assert.equal(((definition.options as JsonObject[])[3]!.label), "Safe");
});

test("preserves catalog-declared argument binding failure as a controlled issue", () => {
  const { properties, catalogId } = setup({}, {
    echo: (args: { value: string }) => args.value,
  });
  // A relative binding at root scope is invalid for DataContext and cannot execute.
  const result = ok(properties.resolve(instance({
    id: "root", component: "Display", title: { "@call": "echo", args: { value: { "@path": "name" } } },
  }), DataContext.root({}), catalogId));
  assert.equal(result.properties.title, undefined);
  assert.deepEqual(result.unresolved, [{ property: "title", reason: "FUNCTION_EVALUATION_FAILED", functionCall: { "@call": "echo", args: { value: { "@path": "name" } } } }]);
  const failed = result.issues[0];
  assert.equal(failed?.code, "FUNCTION_EVALUATION_FAILED");
  if (failed && failed.code === "FUNCTION_EVALUATION_FAILED") {
    assert.equal(failed.error.code, "FUNCTION_ARGUMENT_RESOLUTION_FAILED");
  }
});

test("resolves @accessibility dynamic values and strips every envelope key from properties", () => {
  const data = { who: "Ada", hide: 0 };
  const { properties, catalogId } = setup(data);
  const result = ok(properties.resolve(instance({
    id: "root", component: "Display", title: "x",
    "@accessibility": { label: { "@path": "/who" }, description: "Greeting", live: "polite", hidden: { "@path": "/hide" } },
    "@metadata": { extensions: {} }, "@catalogId": catalogId,
  }), DataContext.root(data), catalogId));
  assert.deepEqual(result.accessibility, { label: "Ada", description: "Greeting", live: "polite", hidden: false });
  assert.deepEqual(result.properties, { title: "x" });
});

test("an @accessibility value that cannot resolve stays absent rather than failing the component", () => {
  const { properties, catalogId } = setup({});
  const result = ok(properties.resolve(instance({
    id: "root", component: "Display", "@accessibility": { label: { "@path": "/missing" } },
  }), DataContext.root({}), catalogId));
  assert.deepEqual(result.accessibility, {});
});

test("a component carrying both the @-form and the bare envelope key is rejected", () => {
  const { properties, catalogId } = setup({});
  assert.equal(errorCode(properties.resolve(instance({
    id: "root", component: "Display", "@accessibility": {}, accessibility: {},
  }), DataContext.root({}), catalogId)), "INVALID_RESERVED_KEY");
  assert.equal(errorCode(properties.resolve(instance({
    id: "root", component: "Display", "@checks": [], checks: [],
  }), DataContext.root({}), catalogId)), "INVALID_RESERVED_KEY");
});

test("a component @catalogId equal to the surface catalog is accepted and a different one is unsupported", () => {
  const { properties, catalogId } = setup({});
  assert.equal(ok(properties.resolve(instance({ id: "root", component: "Display", "@catalogId": catalogId }), DataContext.root({}), catalogId)).accessibility, undefined);
  assert.equal(errorCode(properties.resolve(instance({ id: "root", component: "Display", "@catalogId": "other" }), DataContext.root({}), catalogId)), "UNSUPPORTED_FEATURE");
});

test("a DynamicValue property resolves bindings and calls, and unescapes literal objects", () => {
  const data = { user: { name: "Ada" } };
  const { properties, catalogId } = setup(data, { echo: (args: { value: string }) => args.value });
  const bound = ok(properties.resolve(instance({ id: "root", component: "Card", details: { "@path": "/user/name" } }), DataContext.root(data), catalogId));
  assert.equal(bound.properties.details, "Ada");
  const called = ok(properties.resolve(instance({ id: "root", component: "Card", details: { "@call": "echo", args: { value: { "@path": "/user/name" } } } }), DataContext.root(data), catalogId));
  assert.equal(called.properties.details, "Ada");
  const literal = ok(properties.resolve(instance({ id: "root", component: "Card", details: { "@@path": "/static/file", "@@type": "Resource", plain: 1 } }), DataContext.root(data), catalogId));
  assert.deepEqual(literal.properties.details, { "@path": "/static/file", "@type": "Resource", plain: 1 });
  const invalid = ok(properties.resolve(instance({ id: "root", component: "Card", details: { "@if": true } }), DataContext.root(data), catalogId));
  assert.deepEqual(invalid.issues.map((issue) => issue.code), ["INVALID_RESERVED_KEY"]);
  assert.equal(invalid.properties.details, undefined);
});

test("bare envelope names coexist with their @ form only when the catalog declares them", () => {
  const { properties, catalogId } = setup({});
  // Display declares metadata, so the bare form is an ordinary property beside @metadata.
  const declared = ok(properties.resolve(instance({ id: "root", component: "Display", "@metadata": { extensions: {} }, metadata: { owner: "x" } }), DataContext.root({}), catalogId));
  assert.deepEqual(declared.properties, { metadata: { owner: "x" } });
  // catalogId is not declared, so the bare form is rejected, alone or beside @catalogId.
  assert.equal(errorCode(properties.resolve(instance({ id: "root", component: "Display", catalogId: "x" }), DataContext.root({}), catalogId)), "INVALID_RESERVED_KEY");
  assert.equal(errorCode(properties.resolve(instance({ id: "root", component: "Display", "@catalogId": catalogId, catalogId: "x" }), DataContext.root({}), catalogId)), "INVALID_RESERVED_KEY");
  // accessibility is not declared by Display, so the bare form alone is rejected.
  assert.equal(errorCode(properties.resolve(instance({ id: "root", component: "Display", accessibility: {} }), DataContext.root({}), catalogId)), "INVALID_RESERVED_KEY");
});

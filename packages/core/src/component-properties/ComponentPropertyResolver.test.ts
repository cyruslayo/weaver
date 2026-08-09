import assert from "node:assert/strict";
import { test } from "node:test";
import { CatalogRegistry } from "../catalog/index.js";
import { ComponentInstanceResolver, type ResolvedComponentInstance } from "../component-instances/index.js";
import { ComponentTreeResolver } from "../component-tree/index.js";
import { DataContext } from "../data-context/index.js";
import { FunctionEvaluator, FunctionRegistry } from "../functions/index.js";
import type { JsonObject, JsonValue } from "../protocol/index.js";
import { SurfaceStore } from "../surfaces/index.js";
import { ComponentPropertyResolver } from "./ComponentPropertyResolver.js";

const ref = (name: string): JsonObject => ({ $ref: `common_types.json#/$defs/${name}` });
function dynamic(literal: JsonObject): JsonObject {
  return { oneOf: [literal, ref("PathBinding"), ref("FunctionCall")] };
}
function fn(name: string, returnType: string, args: JsonObject = {}, required = Object.keys(args)): JsonObject {
  return {
    type: "object",
    properties: {
      call: { const: name },
      args: { type: "object", properties: args, required, additionalProperties: false },
      returnType: { const: returnType },
    },
    required: ["call", "args"],
    additionalProperties: false,
  };
}
function setup(data: JsonValue = {}, implementations: Record<string, (...args: any[]) => unknown> = {}) {
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
    functions: {
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
      DynamicValue: { oneOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "array" }, { type: "object" }] },
    } } },
  };
  assert.equal(registry.register({ catalogId, schema }).ok, true);
  const store = new SurfaceStore();
  assert.equal(store.create({ surfaceId: "s", catalogId }).ok, true);
  assert.equal(store.replaceData("s", data).ok, true);
  const functions = new FunctionRegistry(registry);
  for (const [name, implementation] of Object.entries(implementations)) {
    assert.equal(functions.register({ catalogId, name, implementation: implementation as any }).ok, true);
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

test("evaluates a simple function call and uses its result as the property value", () => {
  const { properties, catalogId } = setup({}, {
    echo: (args: { value: string }) => args.value,
  });
  const result = ok(properties.resolve(instance({ id: "root", component: "Display", title: { call: "echo", args: { value: "Hello" } } }), DataContext.root({}), catalogId));
  assert.equal(result.properties.title, "Hello");
  assert.deepEqual(result.unresolved, []);
  assert.deepEqual(result.issues, []);
});

test("evaluates functions with absolute and relative bindings", () => {
  const data = { user: { name: "Root" }, items: [{ name: "A" }, { name: "B" }] };
  const { properties, catalogId } = setup(data, {
    echo: (args: { value: string }) => args.value,
  });
  assert.equal(ok(properties.resolve(instance({ id: "a", component: "Display", title: { call: "echo", args: { value: { path: "/user/name" } } } }), DataContext.root(data), catalogId)).properties.title, "Root");
  const itemContext = ok(DataContext.root(data).createCollectionItemContext("/items", 1));
  assert.equal(ok(properties.resolve(instance({ id: "b", component: "Display", title: { call: "echo", args: { value: { path: "name" } } } }, "/items/1", 1), itemContext, catalogId)).properties.title, "B");
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
    assert.equal(functions.register({ catalogId, name, implementation: implementation as any }).ok, true);
  }
  const counting = new CountingEvaluator(registry, functions);
  const properties = new ComponentPropertyResolver(registry, counting);
  const result = ok(properties.resolve(instance({
    id: "root", component: "Display", title: {
      call: "concat",
      args: { left: { call: "echo", args: { value: "He" } }, right: { call: "outer", args: { value: { call: "echo", args: { value: "llo" } } } } },
    },
  }), DataContext.root({}), catalogId));
  assert.equal(result.properties.title, "Hello");
  assert.equal(counting.calls, 1);
});

test("applies destination dynamic type rules after evaluation", () => {
  const { properties, catalogId } = setup({}, {
    numberResult: () => 42,
  });
  const result = ok(properties.resolve(instance({ id: "root", component: "Display", title: { call: "numberResult", args: {} } }), DataContext.root({}), catalogId));
  assert.equal(result.properties.title, undefined);
  assert.deepEqual(result.issues, [{ code: "DYNAMIC_VALUE_TYPE_MISMATCH", sourceComponentId: "root", property: "title", expected: "dynamicString" }]);
});

test("withholds missing implementations as unresolved with an issue while other properties hydrate", () => {
  const { properties, catalogId } = setup();
  const result = ok(properties.resolve(instance({
    id: "root", component: "Display",
    title: { call: "declaredButUnimplemented", args: {} }, amount: 7,
  }), DataContext.root({}), catalogId));
  assert.equal(result.properties.title, undefined);
  assert.equal(result.properties.amount, 7);
  assert.deepEqual(result.unresolved, [{ property: "title", reason: "FUNCTION_EVALUATION_FAILED", functionCall: { call: "declaredButUnimplemented", args: {} } }]);
  assert.deepEqual(result.issues.map(({ code }) => code), ["FUNCTION_EVALUATION_FAILED"]);
  const failed = result.issues[0];
  if (failed && failed.code === "FUNCTION_EVALUATION_FAILED") {
    assert.equal(failed.error.code, "FUNCTION_IMPLEMENTATION_NOT_FOUND");
  }
});

test("records implementation exceptions as issues without leaking them", () => {
  const { properties, catalogId } = setup({}, {
    thrower: () => { throw new Error("secret"); },
  });
  const result = ok(properties.resolve(instance({ id: "root", component: "Display", title: { call: "thrower", args: { value: "x" } } }), DataContext.root({}), catalogId));
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
  const result = ok(properties.resolve(instance({ id: "root", component: "Display", enabled: { call: "wrongResult", args: {} } }), DataContext.root({}), catalogId));
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
  assert.equal(functions.register({ catalogId, name: "outer", implementation: (args) => String(args.value) }).ok, true);
  const bounded = new ComponentPropertyResolver(registry, new FunctionEvaluator(registry, functions, { maxDepth: 1 }));
  const call: JsonObject = { call: "outer", args: { value: { call: "outer", args: { value: "x" } } } };
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
  const staticResult = ok(properties.resolve(instance({ id: "root", component: "Display", metadata: { path: "literal-metadata" } }), DataContext.root({}), catalogId));
  assert.deepEqual(staticResult.properties.metadata, { path: "literal-metadata" });
  const metric = ok(properties.resolve(instance({ id: "metric", component: "Metric", primaryValue: { path: "/value" } }), DataContext.root({ value: 7 }), catalogId));
  assert.equal(metric.properties.primaryValue, 7);
});

test("keeps function-looking static properties literal and does not execute them", () => {
  const { properties, catalogId } = setup();
  const result = ok(properties.resolve(instance({ id: "root", component: "Display", metadata: { call: "echo", args: {} } }), DataContext.root({}), catalogId));
  assert.deepEqual(result.properties.metadata, { call: "echo", args: {} });
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

test("evaluates functions per template instance with its own scope", () => {
  const data = { items: [{ name: "Ada" }, { name: "Grace" }] };
  const { store, instances, properties, snapshot } = setup(data, {
    displayName: (args: { name: string }) => `Hello ${args.name}`,
  });
  store.updateComponents("s", [
    { id: "root", component: "Display", sections: { path: "/items", componentId: "item" } },
    { id: "item", component: "Leaf", name: { call: "displayName", args: { name: { path: "name" } } } },
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
    { id: "member", component: "Leaf", name: { call: "label", args: { value: { call: "formatName", args: { value: { path: "name" } } }, company: { path: "/company/name" } } } },
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
    { id: "item", component: "Leaf", name: { call: "displayName", args: { name: { path: "name" } } } },
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
  store.updateComponents("s", [{ id: "root", component: "Leaf", name: { call: "echo", args: { value: { path: "/name" } } } }]);
  let surface = snapshot();
  const instanceTree = ok(instances.resolve(surface));
  const first = ok(properties.resolveTree(surface, instanceTree));
  assert.equal(first.root?.properties.name, "Ada");
  first.root!.properties.name = "mutated";
  first.root!.unresolved.push({ property: "x", reason: "FUNCTION_EVALUATION_FAILED", functionCall: { call: "x", args: {} } });
  first.root!.relationships.length = 0;
  assert.equal(instanceTree.root?.definition.name && (instanceTree.root.definition.name as JsonObject).args && ((instanceTree.root.definition.name as JsonObject).args as JsonObject).value && (((instanceTree.root.definition.name as JsonObject).args as JsonObject).value as JsonObject).path, "/name");
  assert.equal(snapshot().dataModel && (snapshot().dataModel as JsonObject).name, "Ada");
  store.setData("s", "/name", "Grace");
  surface = snapshot();
  const second = ok(properties.resolveTree(surface, ok(instances.resolve(surface))));
  assert.equal(second.root?.properties.name, "Grace");
  assert.deepEqual(second.root?.unresolved, []);
});

test("rebuilds after function registration without caching failure state", () => {
  const { store, instances, properties, snapshot, functions, catalogId } = setup({ name: "Ada" });
  store.updateComponents("s", [{ id: "root", component: "Leaf", name: { call: "echo", args: { value: { path: "/name" } } } }]);
  let surface = snapshot();
  let first = ok(properties.resolveTree(surface, ok(instances.resolve(surface))));
  assert.equal(first.root?.properties.name, undefined);
  assert.deepEqual(first.root?.unresolved, [{ property: "name", reason: "FUNCTION_EVALUATION_FAILED", functionCall: { call: "echo", args: { value: { path: "/name" } } } }]);
  assert.equal(functions.register({ catalogId, name: "echo", implementation: (args) => String(args.value) }).ok, true);
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
    title: { call: "echo", args: { value: "fixed" } }, tags: { call: "arrayResult", args: {} },
  }), DataContext.root({}), catalogId));
  assert.equal(result.properties.title, "fixed");
  const tags = result.properties.tags as string[];
  tags.push("changed");
  assert.deepEqual(ownedArray, ["a", "b"]);
  const again = ok(properties.resolve(instance({
    id: "root", component: "Display",
    tags: { call: "arrayResult", args: {} },
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
    title: { call: "consumeValue", args: { value: { path: "/missing" } } },
  }), DataContext.root({}), catalogId));
  assert.equal(Object.hasOwn(undefinedResult.properties, "title"), true);
  assert.equal(undefinedResult.properties.title, undefined);
  assert.deepEqual(undefinedResult.issues, []);
  assert.deepEqual(undefinedResult.unresolved, []);
  const nullResult = ok(properties.resolve(instance({
    id: "root", component: "Display",
    title: { call: "echoValue", args: { value: "unused" } },
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
    title: { call: "echoValue", args: { value: "unused" } },
  }), DataContext.root({}), catalogId));
  assert.equal(result.properties.title, null);
  assert.deepEqual(result.issues, [{ code: "DYNAMIC_VALUE_TYPE_MISMATCH", sourceComponentId: "root", property: "title", expected: "dynamicString" }]);
});

test("preserves catalog-declared argument binding failure as a controlled issue", () => {
  const { properties, catalogId } = setup({}, {
    echo: (args: { value: string }) => args.value,
  });
  // A relative binding at root scope is invalid for DataContext and cannot execute.
  const result = ok(properties.resolve(instance({
    id: "root", component: "Display", title: { call: "echo", args: { value: { path: "name" } } },
  }), DataContext.root({}), catalogId));
  assert.equal(result.properties.title, undefined);
  assert.deepEqual(result.unresolved, [{ property: "title", reason: "FUNCTION_EVALUATION_FAILED", functionCall: { call: "echo", args: { value: { path: "name" } } } }]);
  const failed = result.issues[0];
  assert.equal(failed?.code, "FUNCTION_EVALUATION_FAILED");
  if (failed && failed.code === "FUNCTION_EVALUATION_FAILED") {
    assert.equal(failed.error.code, "FUNCTION_ARGUMENT_RESOLUTION_FAILED");
  }
});

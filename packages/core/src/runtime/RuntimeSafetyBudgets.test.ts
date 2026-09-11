import assert from "node:assert/strict";
import { test } from "node:test";
import {
  A2UI_V091_BASIC_CATALOG_ID,
  createBasicCatalogV091Registration,
} from "../basic-catalog/index.js";
import { CatalogRegistry } from "../catalog/index.js";
import { ComponentTreeResolver } from "../component-tree/index.js";
import type { JsonObject, JsonValue } from "../protocol/index.js";
import type { SurfaceSnapshot } from "../surfaces/index.js";
import { createWeaverRuntime } from "./WeaverRuntime.js";
import { ResolutionBudget, type WeaverRuntimeSafetyConfig } from "./safety.js";

const ref = (name: string): JsonObject => ({
  $ref: `common_types.json#/$defs/${name}`,
});
const component = (name: string, properties: JsonObject = {}): JsonObject => ({
  type: "object",
  properties: {
    id: { type: "string" },
    component: { const: name },
    ...properties,
  },
  required: ["id", "component"],
  additionalProperties: false,
});

function catalog(): JsonObject {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://example.test/budget/catalog.json",
    catalogId: "budget",
    components: {
      Branch: component("Branch", {
        children: ref("ChildList"),
        slot: ref("ComponentId"),
      }),
      Leaf: component("Leaf"),
      Input: component("Input", {
        value: ref("DynamicString"),
        action: ref("Action"),
      }),
      Payload: component("Payload", { payload: { type: "object" } }),
    },
    functions: {},
    $defs: {
      theme: { type: "object" },
      commonTypes: {
        $id: "common_types.json",
        $defs: {
          ComponentId: { type: "string" },
          ChildList: {
            oneOf: [
              { type: "array", items: ref("ComponentId") },
              {
                type: "object",
                properties: {
                  path: { type: "string" },
                  componentId: ref("ComponentId"),
                },
                required: ["path", "componentId"],
                additionalProperties: false,
              },
            ],
          },
          PathBinding: {
            type: "object",
            properties: { path: { type: "string" } },
            required: ["path"],
            additionalProperties: false,
          },
          FunctionCall: {
            type: "object",
            properties: { call: { type: "string" }, args: { type: "object" } },
            required: ["call", "args"],
            additionalProperties: false,
          },
          DynamicString: {
            oneOf: [
              { type: "string" },
              ref("PathBinding"),
              ref("FunctionCall"),
            ],
          },
          Action: {
            type: "object",
            properties: { event: { type: "object" } },
            required: ["event"],
            additionalProperties: false,
          },
        },
      },
    },
  };
}

function makeRuntime(safety?: WeaverRuntimeSafetyConfig) {
  return createWeaverRuntime({
    catalogs: [{ catalogId: "budget", schema: catalog() }],
    ...(safety === undefined ? {} : { safety }),
  });
}

function readyRuntime(safety?: WeaverRuntimeSafetyConfig) {
  const made = makeRuntime(safety);
  assert.equal(made.ok, true, made.ok ? undefined : JSON.stringify(made.error));
  if (!made.ok) throw new Error("runtime creation failed");
  const runtime = made.value;
  assert.equal(
    runtime.process({
      version: "v0.9.1",
      createSurface: { surfaceId: "s", catalogId: "budget" },
    }).ok,
    true,
  );
  return runtime;
}

function update(
  runtime: ReturnType<typeof readyRuntime>,
  components: JsonObject[],
) {
  const result = runtime.process({
    version: "v0.9.1",
    updateComponents: { surfaceId: "s", components },
  });
  assert.equal(
    result.ok,
    true,
    result.ok ? undefined : JSON.stringify(result.error),
  );
}

function data(runtime: ReturnType<typeof readyRuntime>, value: unknown) {
  const result = runtime.process({
    version: "v0.9.1",
    updateDataModel: { surfaceId: "s", value },
  });
  assert.equal(
    result.ok,
    true,
    result.ok ? undefined : JSON.stringify(result.error),
  );
}

function chain(length: number): JsonObject[] {
  return Array.from({ length }, (_, index) => ({
    id: index === 0 ? "root" : `node-${index}`,
    component: "Branch",
    children: index === length - 1 ? [] : [`node-${index + 1}`],
  }));
}

function resolutionError(runtime: ReturnType<typeof readyRuntime>) {
  const result = runtime.resolveSurface("s");
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected resolution failure");
  return result.error;
}

function deeplyNestedObject(depth: number): JsonObject {
  let value: JsonObject = { leaf: "end" };
  for (let index = 0; index < depth; index += 1) value = { child: value };
  return value;
}

function nestedDepth(value: unknown): number {
  let depth = 0;
  let current = value;
  while (
    current !== null &&
    typeof current === "object" &&
    !Array.isArray(current) &&
    Object.hasOwn(current, "child")
  ) {
    depth += 1;
    current = (current as JsonObject).child;
  }
  return depth;
}

test("finite defaults resolve an ordinary canonical Basic Catalog surface", () => {
  const made = createWeaverRuntime({
    catalogs: [createBasicCatalogV091Registration()],
  });
  assert.equal(made.ok, true);
  if (!made.ok) return;
  assert.equal(
    made.value.process({
      version: "v0.9.1",
      createSurface: {
        surfaceId: "basic",
        catalogId: A2UI_V091_BASIC_CATALOG_ID,
      },
    }).ok,
    true,
  );
  assert.equal(
    made.value.process({
      version: "v0.9.1",
      updateComponents: {
        surfaceId: "basic",
        components: [{ id: "root", component: "Text", text: "ordinary" }],
      },
    }).ok,
    true,
  );
  assert.equal(made.value.resolveSurface("basic").ok, true);
});

test("stops arrayItems structural traversal at the first over-budget entry", () => {
  const registry = new CatalogRegistry();
  const schema = catalog();
  // SAFETY: the test schema is the JSON catalog shape constructed above.
  (schema.components as JsonObject).Nested = component("Nested", {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { child: ref("ComponentId") },
        required: ["child"],
        additionalProperties: false,
      },
    },
  });
  assert.equal(registry.register({ catalogId: "budget", schema }).ok, true);
  const inspected: number[] = [];
  const items = new Proxy(
    [{ child: "child" }, { child: "child" }, { child: "child" }],
    {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property))
          inspected.push(Number(property));
        return Reflect.get(target, property, receiver);
      },
    },
  );
  const surface: SurfaceSnapshot = {
    surfaceId: "s",
    catalogId: "budget",
    sendDataModel: false,
    dataModel: {},
    components: {
      // SAFETY: the proxy is a dense object array with the validated ChildId shape.
      root: {
        id: "root",
        component: "Nested",
        items: items as unknown as JsonValue[],
      },
      child: { id: "child", component: "Leaf" },
    },
  };
  const result = new ComponentTreeResolver(registry).resolve(
    surface,
    new ResolutionBudget({ maxResolutionDepth: 10, maxResolvedInstances: 2 }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "RESOLUTION_BUDGET_EXCEEDED");
  assert.deepEqual(inspected, [0, 1]);
});

test("enforces exact static depth and node-count boundaries without truncation", () => {
  const exactDepth = readyRuntime({
    maxResolutionDepth: 3,
    maxResolvedInstances: 20,
  });
  update(exactDepth, chain(3));
  assert.equal(exactDepth.resolveSurface("s").ok, true);

  const tooDeep = readyRuntime({
    maxResolutionDepth: 2,
    maxResolvedInstances: 20,
  });
  update(tooDeep, chain(3));
  const depthError = resolutionError(tooDeep);
  assert.equal(depthError.code, "COMPONENT_TREE_RESOLUTION_FAILED");
  if (depthError.code === "COMPONENT_TREE_RESOLUTION_FAILED") {
    assert.equal(depthError.cause.code, "RESOLUTION_BUDGET_EXCEEDED");
    assert.deepEqual(
      {
        budget: depthError.cause.budget,
        limit: depthError.cause.limit,
        observed: depthError.cause.observed,
      },
      { budget: "depth", limit: 2, observed: 3 },
    );
  }

  const exactCount = readyRuntime({
    maxResolutionDepth: 10,
    maxResolvedInstances: 3,
  });
  update(exactCount, [
    { id: "root", component: "Branch", children: ["a", "b"] },
    { id: "a", component: "Leaf" },
    { id: "b", component: "Leaf" },
  ]);
  assert.equal(exactCount.resolveSurface("s").ok, true);

  const tooWide = readyRuntime({
    maxResolutionDepth: 10,
    maxResolvedInstances: 3,
  });
  update(tooWide, [
    { id: "root", component: "Branch", children: ["a", "b", "c"] },
    { id: "a", component: "Leaf" },
    { id: "b", component: "Leaf" },
    { id: "c", component: "Leaf" },
  ]);
  const countError = resolutionError(tooWide);
  assert.equal(countError.code, "COMPONENT_TREE_RESOLUTION_FAILED");
  if (
    countError.code === "COMPONENT_TREE_RESOLUTION_FAILED" &&
    countError.cause.code === "RESOLUTION_BUDGET_EXCEEDED"
  )
    assert.deepEqual(
      {
        budget: countError.cause.budget,
        phase: countError.cause.phase,
        limit: countError.cause.limit,
        observed: countError.cause.observed,
      },
      { budget: "instances", phase: "component-tree", limit: 3, observed: 4 },
    );
});

test("bounds dynamic collection expansion, nested multiplication, and reused branches", () => {
  const exact = readyRuntime({
    maxResolutionDepth: 10,
    maxResolvedInstances: 3,
  });
  update(exact, [
    {
      id: "root",
      component: "Branch",
      children: { path: "/items", componentId: "item" },
    },
    { id: "item", component: "Leaf" },
  ]);
  data(exact, { items: [1, 2] });
  assert.equal(exact.resolveSurface("s").ok, true);

  const over = readyRuntime({
    maxResolutionDepth: 10,
    maxResolvedInstances: 3,
  });
  update(over, [
    {
      id: "root",
      component: "Branch",
      children: { path: "/items", componentId: "item" },
    },
    { id: "item", component: "Leaf" },
  ]);
  data(over, { items: [1, 2, 3] });
  const expansionError = resolutionError(over);
  assert.equal(expansionError.code, "COMPONENT_INSTANCE_RESOLUTION_FAILED");
  if (
    expansionError.code === "COMPONENT_INSTANCE_RESOLUTION_FAILED" &&
    expansionError.cause.code === "RESOLUTION_BUDGET_EXCEEDED"
  )
    assert.deepEqual(
      {
        budget: expansionError.cause.budget,
        phase: expansionError.cause.phase,
        limit: expansionError.cause.limit,
        observed: expansionError.cause.observed,
      },
      {
        budget: "instances",
        phase: "component-instances",
        limit: 3,
        observed: 4,
      },
    );

  const templateTree = readyRuntime({
    maxResolutionDepth: 10,
    maxResolvedInstances: 2,
  });
  update(templateTree, [
    {
      id: "root",
      component: "Branch",
      children: { path: "/items", componentId: "item" },
    },
    { id: "item", component: "Branch", children: ["leaf"] },
    { id: "leaf", component: "Leaf" },
  ]);
  data(templateTree, { items: [1] });
  const templateTreeError = resolutionError(templateTree);
  assert.equal(templateTreeError.code, "COMPONENT_INSTANCE_RESOLUTION_FAILED");
  if (templateTreeError.code === "COMPONENT_INSTANCE_RESOLUTION_FAILED") {
    assert.equal(
      templateTreeError.cause.code,
      "COMPONENT_TREE_RESOLUTION_FAILED",
    );
    if (templateTreeError.cause.code === "COMPONENT_TREE_RESOLUTION_FAILED")
      assert.equal(
        templateTreeError.cause.cause.code,
        "RESOLUTION_BUDGET_EXCEEDED",
      );
  }

  const nested = readyRuntime({
    maxResolutionDepth: 10,
    maxResolvedInstances: 4,
  });
  update(nested, [
    {
      id: "root",
      component: "Branch",
      children: { path: "/groups", componentId: "group" },
    },
    {
      id: "group",
      component: "Branch",
      children: { path: "members", componentId: "member" },
    },
    { id: "member", component: "Leaf" },
  ]);
  data(nested, { groups: [{ members: [1] }, { members: [2] }] });
  const nestedError = resolutionError(nested);
  assert.equal(nestedError.code, "COMPONENT_INSTANCE_RESOLUTION_FAILED");
  if (
    nestedError.code === "COMPONENT_INSTANCE_RESOLUTION_FAILED" &&
    nestedError.cause.code === "RESOLUTION_BUDGET_EXCEEDED"
  )
    assert.equal(nestedError.cause.observed, 5);

  const reused = readyRuntime({
    maxResolutionDepth: 10,
    maxResolvedInstances: 3,
  });
  update(reused, [
    { id: "root", component: "Branch", children: ["shared", "shared"] },
    { id: "shared", component: "Leaf" },
  ]);
  assert.equal(reused.resolveSurface("s").ok, true);
});

test("preserves circular and missing-reference issue behavior", () => {
  const circular = readyRuntime({
    maxResolutionDepth: 10,
    maxResolvedInstances: 20,
  });
  update(circular, [{ id: "root", component: "Branch", children: ["root"] }]);
  const cycle = circular.resolveSurface("s");
  assert.equal(
    cycle.ok && cycle.value.issues.tree[0]?.code,
    "CIRCULAR_COMPONENT_REFERENCE",
  );

  const missing = readyRuntime({
    maxResolutionDepth: 10,
    maxResolvedInstances: 20,
  });
  update(missing, [{ id: "root", component: "Branch", children: ["later"] }]);
  const unresolved = missing.resolveSurface("s");
  assert.equal(
    unresolved.ok && unresolved.value.issues.tree[0]?.code,
    "MISSING_COMPONENT_REFERENCE",
  );
});

test("rejects invalid safety configuration before creating a runtime", () => {
  const invalid = [
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ];
  for (const value of invalid) {
    const made = makeRuntime({ maxResolutionDepth: value });
    assert.equal(made.ok, false);
    if (!made.ok) assert.equal(made.error.code, "SAFETY_CONFIGURATION_FAILED");
  }
  const hostCap = makeRuntime({ maxResolutionDepth: 257 });
  assert.equal(hostCap.ok, false);
  const hostInstanceCap = makeRuntime({ maxResolvedInstances: 100_001 });
  assert.equal(hostInstanceCap.ok, false);
  const unsafeInstances = makeRuntime({
    maxResolvedInstances: Number.MAX_SAFE_INTEGER + 1,
  });
  assert.equal(unsafeInstances.ok, false);
});

test("snapshots safety policy, isolates runtimes, and resets budgets per resolution", () => {
  const config: WeaverRuntimeSafetyConfig = {
    maxResolutionDepth: 3,
    maxResolvedInstances: 3,
  };
  const first = readyRuntime(config);
  config.maxResolutionDepth = 1;
  config.maxResolvedInstances = 1;
  update(first, [
    { id: "root", component: "Branch", children: ["a", "b"] },
    { id: "a", component: "Leaf" },
    { id: "b", component: "Leaf" },
  ]);
  assert.equal(first.resolveSurface("s").ok, true);
  assert.equal(first.resolveSurface("s").ok, true);

  const second = readyRuntime({
    maxResolutionDepth: 10,
    maxResolvedInstances: 2,
  });
  update(second, [
    { id: "root", component: "Branch", children: ["a", "b"] },
    { id: "a", component: "Leaf" },
    { id: "b", component: "Leaf" },
  ]);
  assert.equal(second.resolveSurface("s").ok, false);
});

test("fails interactions before input mutation or action dispatch", () => {
  const runtime = readyRuntime({
    maxResolutionDepth: 10,
    maxResolvedInstances: 2,
  });
  update(runtime, [
    {
      id: "root",
      component: "Branch",
      children: { path: "/items", componentId: "item" },
    },
    {
      id: "item",
      component: "Input",
      value: { path: "value" },
      action: { event: { name: "submit", context: {} } },
    },
  ]);
  data(runtime, { items: [{ value: "a" }, { value: "b" }] });

  const before = runtime.getSurface("s")?.dataModel;
  const input = runtime.writeInput({
    surfaceId: "s",
    sourceComponentId: "item",
    scopePath: "/items/0",
    property: "value",
    value: "changed",
  });
  assert.equal(input.ok, false);
  if (!input.ok) {
    assert.equal(input.error.code, "INSTANCE_RESOLUTION_FAILED");
    if (input.error.code === "INSTANCE_RESOLUTION_FAILED")
      assert.equal(input.error.cause.code, "RESOLUTION_BUDGET_EXCEEDED");
  }
  assert.deepEqual(runtime.getSurface("s")?.dataModel, before);

  const action = runtime.dispatchAction({
    surfaceId: "s",
    sourceComponentId: "item",
    scopePath: "/items/0",
    actionProperty: "action",
  });
  assert.equal(action.ok, false);
  if (!action.ok) {
    assert.equal(action.error.code, "INSTANCE_RESOLUTION_FAILED");
    if (action.error.code === "INSTANCE_RESOLUTION_FAILED")
      assert.equal(action.error.cause.code, "RESOLUTION_BUDGET_EXCEEDED");
  }
});

test("keeps deeply nested non-structural component and data JSON stack-safe", () => {
  const runtime = readyRuntime({
    maxResolutionDepth: 1,
    maxResolvedInstances: 2,
  });
  const payload = deeplyNestedObject(5000);
  update(runtime, [{ id: "root", component: "Payload", payload }]);
  const componentResolution = runtime.resolveSurface("s");
  assert.equal(componentResolution.ok, true);
  if (componentResolution.ok)
    assert.equal(
      nestedDepth(componentResolution.value.tree.root?.properties.payload),
      5000,
    );
  data(runtime, payload);
  assert.equal(nestedDepth(runtime.getSurface("s")?.dataModel), 5000);
  assert.equal(runtime.resolveSurface("s").ok, true);
  const themed = makeRuntime({
    maxResolutionDepth: 1,
    maxResolvedInstances: 2,
  });
  assert.equal(themed.ok, true);
  if (!themed.ok) return;
  const theme = deeplyNestedObject(5000);
  assert.equal(
    themed.value.process({
      version: "v0.9.1",
      createSurface: { surfaceId: "themed", catalogId: "budget", theme },
    }).ok,
    true,
  );
  assert.equal(
    themed.value.process({
      version: "v0.9.1",
      updateComponents: {
        surfaceId: "themed",
        components: [{ id: "root", component: "Payload", payload: {} }],
      },
    }).ok,
    true,
  );
  const themedResolution = themed.value.resolveSurface("themed");
  assert.equal(themedResolution.ok, true);
  if (themedResolution.ok)
    assert.equal(nestedDepth(themedResolution.value.theme), 5000);
});

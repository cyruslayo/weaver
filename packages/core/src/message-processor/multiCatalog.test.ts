import assert from "node:assert/strict";
import { test } from "node:test";

import { A2UI_V10_BASIC_CATALOG_ID, createBasicCatalogV10Registration } from "../basic-catalog/index.js";
import type { CatalogRegistration } from "../catalog/index.js";
import { createBasicCatalogFunctionImplementations } from "../basic-functions/index.js";
import type { HydratedComponentInstance, HydratedInstanceRelationship } from "../component-properties/index.js";
import type { FunctionRegistration } from "../functions/index.js";
import type { JsonObject, JsonValue } from "../protocol/index.js";
import {
  createWeaverRuntime,
  type WeaverResolvedSurface,
  type WeaverRuntime,
  type WeaverRuntimeConfig,
} from "../runtime/index.js";

/*
 * Ports of conformance/core/multi_catalog.yaml (A2UI v1.0), by hand. The YAML is
 * not parsed. Case names are kept as test names. Each deviation is noted at its
 * case. Rules under test (spec: "Mixable catalogs and component resolution logic"):
 *
 * - A component resolves to its @catalogId, else to the surface default catalogId.
 * - A FunctionCall resolves to its catalogId, else to the surface default. It never
 *   takes the catalog of its enclosing component or call. Calls inside a formatString
 *   ${...} resolve to the catalog that the formatString resolved to.
 * - A component or call with no resolvable catalog is refused at ingress, and nothing is stored.
 */

const BASIC = A2UI_V10_BASIC_CATALOG_ID;
const APP = "app-cat";
const CHART = "chart_catalog";
const MAP = "map_catalog";
const MATH = "custom_math_catalog";
const FX = "fx_catalog";

type Message = Parameters<WeaverRuntime["process"]>[0];

function message(value: JsonObject): Message {
  return value as unknown as Message;
}

/** A copy of the canonical Basic catalog under its own catalogId, with optional extra components and functions. */
function basicCopy(
  catalogId: string,
  overrides: { components?: JsonObject; functions?: JsonObject } = {},
): CatalogRegistration {
  const schema = structuredClone(createBasicCatalogV10Registration().schema) as unknown as JsonObject;
  schema.catalogId = catalogId;
  schema.$id = `https://example.test/${catalogId}/catalog.json`;
  // Components and functions are added to the Basic set.
  if (overrides.components !== undefined) {
    schema.components = { ...(schema.components as JsonObject), ...overrides.components };
  }
  if (overrides.functions !== undefined) {
    schema.functions = { ...(schema.functions as JsonObject), ...overrides.functions };
  }
  return { catalogId, schema: schema as unknown as CatalogRegistration["schema"] };
}

/** A component schema with one dynamic string list property, for the chart and map catalogs. */
function simpleComponent(name: string): JsonObject {
  return {
    type: "object",
    properties: {
      component: { const: name },
      data: { $ref: "common_types.json#/$defs/DynamicStringList" },
    },
    required: ["component"],
    additionalProperties: false,
  };
}

/** A function declaration with a required string argument, returning a string. */
function stringFunction(name: string, argument: string): JsonObject {
  return {
    type: "object",
    description: `Test function ${name}.`,
    returnType: "string",
    allowedCallers: "rendererOrAgent",
    properties: {
      "@call": { const: name },
      args: {
        type: "object",
        properties: { [argument]: {} },
        required: [argument],
      },
    },
    required: ["@call"],
  };
}

function basicFunctions(catalogId: string): FunctionRegistration[] {
  return createBasicCatalogFunctionImplementations({ catalogId: BASIC }).map((registration) => ({
    ...registration,
    catalogId,
  }));
}

function createRuntime(options: Partial<WeaverRuntimeConfig> & { catalogs: CatalogRegistration[] }): WeaverRuntime {
  const created = createWeaverRuntime({ functions: [], ...options });
  if (!created.ok) throw new Error(`runtime configuration failed: ${JSON.stringify(created.error)}`);
  return created.value;
}

function process(runtime: WeaverRuntime, value: JsonObject) {
  return runtime.process(message(value));
}

function createSurface(
  runtime: WeaverRuntime,
  body: JsonObject,
): void {
  const result = process(runtime, { version: "1.0", createSurface: { surfaceId: "main", ...body } });
  assert.equal(result.ok, true, JSON.stringify(result));
}

function resolved(runtime: WeaverRuntime): WeaverResolvedSurface {
  const result = runtime.resolveSurface("main");
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error("unreachable");
  return result.value;
}

/** Every hydrated instance of the resolved tree, keyed by source component id. Template children are kept in order. */
function instancesById(surface: WeaverResolvedSurface): Map<string, HydratedComponentInstance[]> {
  const found = new Map<string, HydratedComponentInstance[]>();
  const visit = (instance: HydratedComponentInstance): void => {
    found.set(instance.sourceComponentId, [...(found.get(instance.sourceComponentId) ?? []), instance]);
    for (const relationship of instance.relationships as HydratedInstanceRelationship[]) {
      if (relationship.kind === "single" && relationship.child !== undefined) visit(relationship.child);
      if (relationship.kind === "list" || relationship.kind === "template") relationship.children.forEach(visit);
    }
  };
  if (surface.tree.root !== undefined) visit(surface.tree.root);
  return found;
}

function only(surface: WeaverResolvedSurface, id: string): HydratedComponentInstance {
  const found = instancesById(surface).get(id) ?? [];
  assert.equal(found.length, 1, `expected one instance of ${id}`);
  return found[0]!;
}

/** A Column root whose children are the given component ids. */
function columnRoot(children: string[]): JsonObject {
  return { id: "root", component: "Column", children };
}

// ---------------------------------------------------------------------------
// Ported conformance cases
// ---------------------------------------------------------------------------

test("test_multi_catalog_explicit_catalog_id_resolution: a component's own catalogId resolves it, not the surface default", () => {
  // Deviation: the chart catalog declares LineChart with a data list. The YAML's shape is adapted to the v1.0 component schema.
  const runtime = createRuntime({
    catalogs: [basicCopy(BASIC), basicCopy(CHART, { components: { LineChart: simpleComponent("LineChart") } })],
  });
  createSurface(runtime, {
    catalogId: BASIC,
    components: [
      columnRoot(["c1", "c2"]),
      { id: "c1", component: "Text", text: "Default Catalog Component" },
      { id: "c2", component: "LineChart", "@catalogId": CHART, data: ["a"] },
    ],
  });
  const surface = resolved(runtime);
  assert.equal(only(surface, "c2").catalogId, CHART);
  assert.equal(only(surface, "c1").catalogId, BASIC);
});

test("test_multi_catalog_surface_default_fallback: a component without @catalogId falls back to the surface default", () => {
  const runtime = createRuntime({ catalogs: [basicCopy(BASIC)] });
  createSurface(runtime, {
    catalogId: BASIC,
    components: [columnRoot(["button"]), { id: "button", component: "Text", text: "Click Me" }],
  });
  assert.equal(only(resolved(runtime), "button").catalogId, BASIC);
});

test("test_multi_catalog_unregistered_catalog_error: a component naming an unregistered catalogId is refused and stores nothing", () => {
  // Deviation: a catalog that is not registered is CATALOG_NOT_FOUND. The YAML's supportedCatalogIds list is not a Core concept.
  const runtime = createRuntime({ catalogs: [basicCopy(BASIC)] });
  const result = process(runtime, {
    version: "1.0",
    createSurface: {
      surfaceId: "main",
      catalogId: BASIC,
      components: [{ id: "root", component: "Text", "@catalogId": "unregistered_vendor_catalog", text: "x" }],
    },
  });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error.code, "CATALOG_REGISTRY_ERROR");
  assert.equal(!result.ok && result.error.code === "CATALOG_REGISTRY_ERROR" && result.error.catalogError.code, "CATALOG_NOT_FOUND");
  assert.equal(runtime.getSurface("main"), undefined);
});

test("test_multi_catalog_version_mismatch_error: a catalog declaring v0.9 cannot register beside a v1.0 surface", () => {
  // Deviation: the mixed-version error is a registration rejection. Every v1.0 catalog has protocolVersion "1.0" as a const,
  // so a v0.9 catalog never reaches a surface. The pinned message is replaced by INVALID_CATALOG_SCHEMA at registration.
  const legacy = basicCopy("v0_9_catalog");
  (legacy.schema as unknown as JsonObject).protocolVersion = "v0.9";
  const created = createWeaverRuntime({ catalogs: [basicCopy(BASIC), legacy] });
  assert.equal(created.ok, false);
  assert.equal(!created.ok && created.error.code, "CATALOG_CONFIGURATION_FAILED");
});

test("test_multi_catalog_function_resolution_precedence: a call with an explicit catalogId is evaluated by that catalog", () => {
  const math = basicCopy(MATH, { functions: { joinMath: stringFunction("joinMath", "value") } });
  const runtime = createRuntime({
    catalogs: [basicCopy(BASIC), math],
    functions: [
      ...basicFunctions(BASIC),
      {
        catalogId: MATH,
        name: "joinMath",
        effect: "pure",
        implementation: (args: Record<string, unknown>) => `math:${String(args.value)}`,
      } as unknown as FunctionRegistration,
    ],
  });
  createSurface(runtime, {
    catalogId: BASIC,
    components: [
      columnRoot(["sum"]),
      { id: "sum", component: "Text", text: { "@call": "joinMath", catalogId: MATH, args: { value: "15" } } },
    ],
  });
  assert.equal(only(resolved(runtime), "sum").properties.text, "math:15");
});

test("test_multi_catalog_cross_catalog_component_composition: one hierarchy mixes components from three catalogs", () => {
  const runtime = createRuntime({
    catalogs: [
      basicCopy(BASIC),
      basicCopy(CHART, { components: { BarChart: simpleComponent("BarChart") } }),
      basicCopy(MAP, { components: { GeoMap: simpleComponent("GeoMap") } }),
    ],
  });
  createSurface(runtime, {
    catalogId: BASIC,
    components: [
      columnRoot(["c1", "c2", "c3"]),
      { id: "c1", component: "Text", text: "Dashboard" },
      { id: "c2", component: "BarChart", "@catalogId": CHART },
      { id: "c3", component: "GeoMap", "@catalogId": MAP },
    ],
  });
  const surface = resolved(runtime);
  assert.equal(only(surface, "c1").catalogId, BASIC);
  assert.equal(only(surface, "c2").catalogId, CHART);
  assert.equal(only(surface, "c3").catalogId, MAP);
});

test("test_multi_catalog_function_call_catalog_id_override: a call naming basic is evaluated by basic, not the component's app catalog", () => {
  // Deviation: the YAML's app-cat declares only a Text component, and its defaultless surface is simplified. Basic is registered and
  // its functions are implemented, because the call names the Basic catalog.
  const runtime = createRuntime({
    catalogs: [basicCopy(BASIC), basicCopy(APP)],
    functions: basicFunctions(BASIC),
  });
  createSurface(runtime, {
    catalogId: APP,
    components: [
      {
        id: "root",
        component: "Text",
        text: { "@call": "formatDate", catalogId: BASIC, args: { value: "2026-09-04T12:00:00Z", format: "yyyy-MM-dd" } },
      },
    ],
  });
  assert.equal(only(resolved(runtime), "root").properties.text, "2026-09-04");
});

test("test_multi_catalog_format_string_index_and_catalog_call_without_default: ${} calls inherit formatString's catalog on a defaultless surface", () => {
  // Deviation: the YAML's unused app-cat (Badge only) is omitted. Each template row names its catalog, and the surface has no default.
  const runtime = createRuntime({
    catalogs: [basicCopy(BASIC)],
    functions: basicFunctions(BASIC),
  });
  createSurface(runtime, {
    dataModel: { items: [{ count: 1 }, { count: 2 }] },
    components: [
      { id: "root", component: "List", "@catalogId": BASIC, children: { path: "/items", componentId: "row" } },
      {
        id: "row",
        component: "Text",
        "@catalogId": BASIC,
        text: {
          "@call": "formatString",
          catalogId: BASIC,
          args: { value: "Row ${@index()}: ${pluralize(value: count, one: 'drop', other: 'drops')}" },
        },
      },
    ],
  });
  const rows = instancesById(resolved(runtime)).get("row") ?? [];
  assert.deepEqual(rows.map((row) => row.properties.text), ["Row 0: drop", "Row 1: drops"]);
});

// ---------------------------------------------------------------------------
// Additional rules: ingress, nesting, templates, checks, actions, inputs, routing
// ---------------------------------------------------------------------------

test("no default catalog and no @catalogId is refused atomically, and nothing is stored", () => {
  const runtime = createRuntime({ catalogs: [basicCopy(BASIC)] });
  const result = process(runtime, {
    version: "1.0",
    createSurface: { surfaceId: "main", components: [{ id: "root", component: "Text", text: "x" }] },
  });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error.code, "CATALOG_RESOLUTION_FAILED");
  if (!result.ok && result.error.code === "CATALOG_RESOLUTION_FAILED") {
    assert.equal(result.error.sourceComponentId, "root");
    assert.equal(result.error.path, "");
  }
  assert.equal(runtime.getSurface("main"), undefined);
});

test("a surface with no default catalog and no components is valid, and stores no default", () => {
  const runtime = createRuntime({ catalogs: [basicCopy(BASIC)] });
  createSurface(runtime, {});
  assert.equal(runtime.getSurface("main")?.catalogId, undefined);
});

test("a top-level call without catalogId on a component with @catalogId uses the surface default", () => {
  const runtime = createRuntime({ catalogs: [basicCopy(BASIC), basicCopy(APP)], functions: basicFunctions(BASIC) });
  createSurface(runtime, {
    catalogId: BASIC,
    components: [
      { id: "root", component: "Text", "@catalogId": APP, text: { "@call": "formatDate", args: { value: "2026-09-04T12:00:00Z", format: "yyyy-MM-dd" } } },
    ],
  });
  const root = only(resolved(runtime), "root");
  assert.equal(root.catalogId, APP);
  assert.equal(root.properties.text, "2026-09-04");
});

test("a top-level call without catalogId on a defaultless surface is refused at ingress with its JSON pointer", () => {
  const runtime = createRuntime({ catalogs: [basicCopy(BASIC), basicCopy(APP)], functions: basicFunctions(BASIC) });
  const result = process(runtime, {
    version: "1.0",
    createSurface: {
      surfaceId: "main",
      components: [
        { id: "root", component: "Text", "@catalogId": APP, text: { "@call": "formatDate", args: { value: "2026-09-04T12:00:00Z", format: "yyyy-MM-dd" } } },
      ],
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok && result.error.code === "CATALOG_RESOLUTION_FAILED") {
    assert.equal(result.error.sourceComponentId, "root");
    assert.equal(result.error.path, "/text");
  } else {
    assert.fail(JSON.stringify(result));
  }
  assert.equal(runtime.getSurface("main"), undefined);
});

test("a nested call does not inherit the catalog of the call that contains it", () => {
  // appOnly is declared by app-cat alone. The outer call names basic. The nested call names no catalog, so it resolves to the
  // surface default app-cat and is accepted. If it inherited basic, ingress would refuse it with FUNCTION_NOT_ALLOWED.
  const app = basicCopy(APP, { functions: { appOnly: stringFunction("appOnly", "value") } });
  const runtime = createRuntime({ catalogs: [basicCopy(BASIC), app], functions: basicFunctions(BASIC) });
  const nestedAccepted = process(runtime, {
    version: "1.0",
    createSurface: {
      surfaceId: "main",
      catalogId: APP,
      components: [
        {
          id: "root",
          component: "Text",
          text: {
            "@call": "formatDate",
            catalogId: BASIC,
            args: { value: { "@call": "appOnly", args: { value: "x" } }, format: "yyyy" },
          },
        },
      ],
    },
  });
  assert.equal(nestedAccepted.ok, true, JSON.stringify(nestedAccepted));
});

test("a template instance takes the resolved catalog of its template component", () => {
  const runtime = createRuntime({ catalogs: [basicCopy(BASIC), basicCopy(APP)], functions: basicFunctions(BASIC) });
  createSurface(runtime, {
    catalogId: BASIC,
    dataModel: { items: [{ name: "a" }, { name: "b" }] },
    components: [
      { id: "root", component: "List", children: { path: "/items", componentId: "row" } },
      { id: "row", component: "Text", "@catalogId": APP, text: { "@path": "name" } },
    ],
  });
  const rows = instancesById(resolved(runtime)).get("row") ?? [];
  assert.deepEqual(rows.map((row) => row.catalogId), [APP, APP]);
  assert.deepEqual(rows.map((row) => row.properties.text), ["a", "b"]);
});

test("checks and actions on a component from a non-default catalog", () => {
  const runtime = createRuntime({ catalogs: [basicCopy(BASIC), basicCopy(APP)] });
  createSurface(runtime, {
    catalogId: BASIC,
    dataModel: { ok: true },
    components: [
      columnRoot(["submit"]),
      {
        id: "submit",
        component: "Button",
        "@catalogId": APP,
        child: "label",
        action: { event: { name: "submit" } },
        "@checks": [{ condition: { "@path": "/ok" }, message: "Not ready" }],
      },
      { id: "label", component: "Text", text: "Go" },
    ],
  });
  const dispatched = runtime.dispatchAction({
    surfaceId: "main",
    sourceComponentId: "submit",
    scopePath: "/",
    actionProperty: "action",
  });
  assert.equal(dispatched.ok, true, JSON.stringify(dispatched));
  if (dispatched.ok && dispatched.value.kind === "serverEvent") {
    assert.equal(dispatched.value.message.action.name, "submit");
  }
  const checks = resolved(runtime).checks.components.find((component) => component.sourceComponentId === "submit");
  assert.equal(checks?.status, "valid");
});

test("input binding writes resolve the bindable metadata of a non-default-catalog component", () => {
  const runtime = createRuntime({ catalogs: [basicCopy(BASIC), basicCopy(APP)] });
  createSurface(runtime, {
    catalogId: BASIC,
    dataModel: { name: "" },
    components: [
      columnRoot(["name"]),
      { id: "name", component: "TextField", "@catalogId": APP, label: "Name", value: { "@path": "/name" } },
    ],
  });
  const written = runtime.writeInput({
    surfaceId: "main",
    sourceComponentId: "name",
    scopePath: "/",
    property: "value",
    value: "Ada",
  });
  assert.equal(written.ok, true, JSON.stringify(written));
  assert.deepEqual(runtime.getSurface("main")?.dataModel, { name: "Ada" });
});

test("an agent-routed call carries the resolved catalog: the surface default, not the component's catalog", () => {
  // fx_catalog declares fetchFxRate with no local implementation, so it routes. The component is in app-cat, which does not declare it.
  const fx = basicCopy(FX, { functions: { fetchFxRate: stringFunction("fetchFxRate", "base") } });
  const runtime = createRuntime({ catalogs: [basicCopy(BASIC), basicCopy(APP), fx], functions: basicFunctions(BASIC), agentFunctions: {} });
  createSurface(runtime, {
    catalogId: FX,
    components: [{ id: "root", component: "Text", "@catalogId": APP, text: { "@call": "fetchFxRate", args: { base: "EUR" } } }],
  });
  resolved(runtime);
  const calls = runtime.takeAgentFunctionCalls();
  assert.equal(calls.length, 1, JSON.stringify(calls));
  assert.equal(calls[0]!.callAgentFunction.callFunction.catalogId, FX);
});

test("supportedCatalogIds lists every registered catalog", () => {
  const runtime = createRuntime({ catalogs: [basicCopy(BASIC), basicCopy(APP), basicCopy(CHART)] });
  assert.deepEqual([...runtime.getRendererCapabilities()["1.0"].supportedCatalogIds].sort(), [APP, BASIC, CHART].sort());
});

test("resolved surfaces keep the catalogId of each component", () => {
  const runtime = createRuntime({ catalogs: [basicCopy(BASIC), basicCopy(APP)] });
  createSurface(runtime, {
    catalogId: BASIC,
    components: [columnRoot(["a"]), { id: "a", component: "Text", "@catalogId": APP, text: "x" as JsonValue }],
  });
  assert.equal(only(resolved(runtime), "a").catalogId, APP);
});

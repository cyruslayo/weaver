import assert from "node:assert/strict";
import { test } from "node:test";

import type { A2UIComponent, JsonObject } from "../protocol/index.js";
import { CatalogRegistry } from "./CatalogRegistry.js";

function catalog(catalogId: string, extraComponents: JsonObject = {}): JsonObject {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `https://example.test/catalogs/${catalogId}.json`,
    protocolVersion: "1.0",
    catalogId,
    components: {
      Text: {
        type: "object",
        properties: {
          component: { const: "Text" },
          text: { type: "string" },
          variant: { enum: ["h1", "body"] },
        },
        required: ["component", "text"],
        additionalProperties: false,
      },
      Button: {
        type: "object",
        properties: { component: { const: "Button" }, child: { type: "string" } },
        required: ["component", "child"],
        additionalProperties: false,
      },
      Column: {
        type: "object",
        properties: {
          component: { const: "Column" },
          children: { type: "array", items: { type: "string" } },
        },
        required: ["component", "children"],
        additionalProperties: false,
      },
      ...extraComponents,
    },
    functions: {
      isPresent: {
        type: "object",
        returnType: "boolean",
        properties: {
          "@call": { const: "isPresent" },
          args: { type: "object", properties: { value: {} }, required: ["value"] },
        },
        required: ["@call", "args"],
      },
    },
    $defs: {
      anyComponent: {},
      anyFunction: {},
    },
  };
}

function registered(id = "test") {
  const registry = new CatalogRegistry();
  assert.equal(registry.register({ catalogId: id, schema: catalog(id) }).ok, true);
  return registry;
}

function expectCode(result: ReturnType<CatalogRegistry["validateComponent"]>, code: string) {
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, code);
}

function registrationIssues(schema: JsonObject, catalogId = "rejected") {
  const result = new CatalogRegistry().register({ catalogId, schema });
  assert.equal(result.ok, false, "expected the catalog to be rejected");
  if (result.ok) return [];
  assert.equal(result.error.code, "INVALID_CATALOG_SCHEMA");
  return result.error.issues ?? [];
}

test("discovers nested structural locations narrowly and defensively", () => {
  const structural = {
    type: "object",
    properties: {
      component: { const: "Nested" },
      config: { type: "object", properties: { body: { type: "object", properties: {
        child: { $ref: "common_types.json#/$defs/ComponentId" }, metadata: { type: "string" },
      } } } },
      groups: { type: "array", items: { type: "object", properties: {
        sections: { type: "array", items: { type: "object", properties: {
          child: { $ref: "common_types.json#/$defs/ComponentId" },
          children: { $ref: "common_types.json#/$defs/ChildList" },
        } } },
      } } },
      ignored: { oneOf: [{ $ref: "common_types.json#/$defs/ComponentId" }] },
    },
  };
  const registry = new CatalogRegistry();
  assert.equal(registry.register({ catalogId: "nested", schema: catalog("nested", { Nested: structural }) }).ok, true);
  const result = registry.getComponentStructureLocations("nested", "Nested");
  assert.ok(result.ok);
  assert.deepEqual(result.value, [
    { kind: "single", path: [{ kind: "property", name: "config" }, { kind: "property", name: "body" }, { kind: "property", name: "child" }] },
    { kind: "single", path: [{ kind: "property", name: "groups" }, { kind: "arrayItems" }, { kind: "property", name: "sections" }, { kind: "arrayItems" }, { kind: "property", name: "child" }] },
    { kind: "list", path: [{ kind: "property", name: "groups" }, { kind: "arrayItems" }, { kind: "property", name: "sections" }, { kind: "arrayItems" }, { kind: "property", name: "children" }] },
  ]);
  (result.value[0]!.path as { kind: "property" | "arrayItems"; name?: string }[])[0] = { kind: "arrayItems" };
  const again = registry.getComponentStructureLocations("nested", "Nested");
  assert.ok(again.ok);
  assert.equal(again.value[0]!.path[0]!.kind, "property");
});

test("treats Child references as single structural fields and exposes allowed composition", () => {
  const source = catalog("composition", {
    Card: {
      type: "object",
      properties: {
        component: { const: "Card" },
        child: { $ref: "common_types.json#/$defs/Child" },
      },
      required: ["component", "child"],
      allowedParents: ["Surface", "Column"],
      allowedChildren: ["Text", "Button"],
    },
  });
  const registry = new CatalogRegistry();
  assert.equal(registry.register({ catalogId: "composition", schema: source }).ok, true);

  assert.deepEqual(registry.getComponentStructure("composition", "Card"), {
    ok: true,
    value: {
      singleChildFields: ["child"],
      childListFields: [],
      allowedParents: ["Surface", "Column"],
      allowedChildren: ["Text", "Button"],
    },
  });
  assert.deepEqual(registry.getComponentStructure("composition", "Text"), {
    ok: true,
    value: { singleChildFields: [], childListFields: [] },
  });
});

test("discovers only the narrow direct oneOf bindable union and owns its metadata", () => {
  const source = catalog("bindable", {
    Icon: { type: "object", properties: {
      component: { const: "Icon" },
      name: { oneOf: [{ enum: ["home", "search"] }, { type: "object", properties: { svgPath: { type: "string" } }, required: ["svgPath"], additionalProperties: false }, { $ref: "common_types.json#/$defs/DataBinding" }] },
      nested: { type: "array", items: { type: "object", properties: { value: { oneOf: [{ type: "string" }, { $ref: "common_types.json#/$defs/DataBinding" }] } } } },
      ordinary: { oneOf: [{ type: "string" }, { type: "number" }] },
      any: { anyOf: [{ type: "string" }, { $ref: "common_types.json#/$defs/DataBinding" }] },
      ambiguous: { oneOf: [{ type: "string" }, { $ref: "common_types.json#/$defs/DataBinding" }, { $ref: "common_types.json#/$defs/DataBinding" }] },
    } },
  });
  const registry = new CatalogRegistry();
  assert.equal(registry.register({ catalogId: "bindable", schema: source }).ok, true);
  const result = registry.getBindableValueLocations("bindable", "Icon");
  assert.ok(result.ok);
  assert.deepEqual(result.value, [
    { path: [{ kind: "property", name: "name" }] },
    { path: [{ kind: "property", name: "nested" }, { kind: "arrayItems" }, { kind: "property", name: "value" }] },
  ]);
  assert.equal(registry.validateBindableValue("bindable", "Icon", result.value[0]!, "home"), true);
  assert.equal(registry.validateBindableValue("bindable", "Icon", result.value[0]!, { svgPath: "M0 0" }), true);
  assert.equal(registry.validateBindableValue("bindable", "Icon", result.value[0]!, 42), false);
  (result.value[0]!.path as { kind: "arrayItems" }[])[0] = { kind: "arrayItems" };
  const again = registry.getBindableValueLocations("bindable", "Icon");
  assert.ok(again.ok); assert.equal(again.value[0]!.path[0]!.kind, "property");
});

test("registers, finds, and lists catalogs in insertion order with fresh ID arrays", () => {
  const registry = new CatalogRegistry();
  assert.equal(registry.register({ catalogId: "a", schema: catalog("a") }).ok, true);
  assert.equal(registry.register({ catalogId: "b", schema: catalog("b") }).ok, true);
  assert.equal(registry.has("a"), true);
  assert.deepEqual(registry.list().map(({ catalogId }) => catalogId), ["a", "b"]);
  const ids = registry.getSupportedCatalogIds();
  ids.push("injected");
  assert.deepEqual(registry.getSupportedCatalogIds(), ["a", "b"]);
});

test("rejects duplicate registration without replacing the original", () => {
  const registry = registered("same");
  const result = registry.register({ catalogId: "same", schema: catalog("same", { Chart: { type: "object" } }) });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "CATALOG_ALREADY_REGISTERED");
  expectCode(registry.validateComponent("same", { id: "c", component: "Chart" }), "COMPONENT_NOT_ALLOWED");
});

test("validates Text properties from its catalog schema", () => {
  const registry = registered();
  assert.equal(registry.validateComponent("test", { id: "title", component: "Text", text: "Hello", variant: "h1" }).ok, true);
  const invalid = registry.validateComponent("test", { id: "title", component: "Text", text: 123 });
  expectCode(invalid, "COMPONENT_VALIDATION_FAILED");
  if (!invalid.ok) {
    assert.equal(invalid.error.componentId, "title");
    assert.equal(invalid.error.component, "Text");
    assert.ok(invalid.error.issues?.some(({ path, keyword }) => path === "/text" && keyword === "type"));
  }
});

test("validates catalog-owned properties and not the ComponentCommon envelope", () => {
  const registry = registered();
  const withEnvelope = registry.validateComponent("test", {
    id: "title",
    component: "Text",
    text: "Hello",
    "@catalogId": "https://example.test/catalogs/test.json",
    "@accessibility": { label: "Title" },
    "@metadata": { extensions: { a2ui_example: true } },
  } as A2UIComponent);
  assert.equal(withEnvelope.ok, true);
});

test("rejects component properties forbidden by the schema", () => {
  const result = registered().validateComponent("test", { id: "title", component: "Text", text: "Hello", script: "no" });
  expectCode(result, "COMPONENT_VALIDATION_FAILED");
});

test("rejects unknown component names at the trusted allowlist", () => {
  expectCode(registered().validateComponent("test", { id: "x", component: "ExecuteJavaScript" }), "COMPONENT_NOT_ALLOWED");
});

test("rejects unknown catalog IDs without fallback", () => {
  expectCode(registered().validateComponent("missing", { id: "title", component: "Text", text: "Hello" }), "CATALOG_NOT_FOUND");
});

test("isolates component allowlists between catalogs", () => {
  const chartSchema: JsonObject = {
    type: "object",
    properties: { component: { const: "Chart" }, series: { type: "array" } },
    required: ["component", "series"],
    additionalProperties: false,
  };
  const registry = new CatalogRegistry();
  registry.register({ catalogId: "catalog-a", schema: catalog("catalog-a") });
  registry.register({ catalogId: "catalog-b", schema: catalog("catalog-b", { Chart: chartSchema }) });
  const chart: A2UIComponent = { id: "chart", component: "Chart", series: [] };
  expectCode(registry.validateComponent("catalog-a", chart), "COMPONENT_NOT_ALLOWED");
  assert.equal(registry.validateComponent("catalog-b", chart).ok, true);
});

test("owns registered schemas and returns defensive snapshots", () => {
  const source = catalog("owned");
  const registry = new CatalogRegistry();
  registry.register({ catalogId: "owned", schema: source });
  (source.components as JsonObject).Injected = { type: "object" };
  const fromGet = registry.get("owned");
  assert.ok(fromGet);
  (fromGet.schema.components as JsonObject).AlsoInjected = { type: "object" };
  const fromList = registry.list()[0];
  (fromList.schema.components as JsonObject).ThirdInjection = { type: "object" };
  for (const name of ["Injected", "AlsoInjected", "ThirdInjection"]) {
    expectCode(registry.validateComponent("owned", { id: "x", component: name }), "COMPONENT_NOT_ALLOWED");
  }
});

test("rejects malformed, mismatched, and uncompileable catalog schemas atomically", () => {
  const registry = new CatalogRegistry();
  const malformed = registry.register({ catalogId: "bad", schema: { catalogId: "bad", components: {} } });
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.error.code, "INVALID_CATALOG_SCHEMA");
  const mismatch = registry.register({ catalogId: "expected", schema: catalog("different") });
  assert.equal(mismatch.ok, false);
  const broken = catalog("broken", { Broken: { type: "object", properties: { value: { $ref: "#/$defs/does-not-exist" } } } });
  const uncompileable = registry.register({ catalogId: "broken", schema: broken });
  assert.equal(uncompileable.ok, false);
  assert.deepEqual(registry.getSupportedCatalogIds(), []);
});

test("accepts a catalog without $defs and rejects its own $defs with missing anyComponent or anyFunction", () => {
  const bare = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    protocolVersion: "1.0",
    catalogId: "bare",
    components: { Text: { type: "object", properties: { component: { const: "Text" } }, required: ["component"] } },
  };
  assert.equal(new CatalogRegistry().register({ catalogId: "bare", schema: bare }).ok, true);

  const partial = catalog("partial");
  delete (partial.$defs as JsonObject).anyFunction;
  const issues = registrationIssues(partial, "partial");
  assert.ok(issues.some(({ path }) => path === "/$defs/anyFunction"));
});

test("rejects a missing or unsupported protocolVersion, including the 0.9 default", () => {
  const { protocolVersion: _omitted, ...withoutVersion } = catalog("no-version");
  assert.ok(registrationIssues(withoutVersion as JsonObject, "no-version").some(({ path }) => path === "/protocolVersion"));
  const v09 = { ...catalog("v09"), protocolVersion: "0.9" };
  assert.ok(registrationIssues(v09, "v09").some(({ path }) => path === "/protocolVersion"));
  const v10 = { ...catalog("v10"), protocolVersion: "1.0" };
  assert.equal(new CatalogRegistry().register({ catalogId: "v10", schema: v10 }).ok, true);
});

test("rejects the reserved Surface component name", () => {
  const issues = registrationIssues(catalog("surface", { Surface: { type: "object" } }), "surface");
  assert.ok(issues.length > 0);
});

test("rejects identifiers outside UAX #31 for components, functions, and property names", () => {
  assert.ok(registrationIssues(catalog("hyphen", { "My-Component": { type: "object" } }), "hyphen")
    .some(({ path }) => path === "/components/My-Component"));
  assert.ok(registrationIssues(catalog("digit", { "123Bad": { type: "object" } }), "digit")
    .some(({ path }) => path === "/components/123Bad"));
  const badProperty = catalog("badprop", {
    Odd: { type: "object", properties: { component: { const: "Odd" }, "bad-prop": { type: "string" } } },
  });
  assert.ok(registrationIssues(badProperty, "badprop").some(({ path }) => path === "/components/Odd/properties/bad-prop"));

  const source = catalog("ids-ok", { MyComponent_1: { type: "object", properties: { component: { const: "MyComponent_1" } } } });
  (source.functions as JsonObject).format_text_1 = {
    type: "object",
    returnType: "string",
    properties: { "@call": { const: "format_text_1" }, args: { type: "object" } },
    required: ["@call", "args"],
  };
  assert.equal(new CatalogRegistry().register({ catalogId: "ids-ok", schema: source }).ok, true);

  const reservedFunction = catalog("reserved-fn");
  (reservedFunction.functions as JsonObject)["@index"] = {
    type: "object",
    returnType: "number",
    properties: { "@call": { const: "@index" }, args: { type: "object" } },
    required: ["@call", "args"],
  };
  assert.ok(registrationIssues(reservedFunction, "reserved-fn").some(({ path }) => path === "/functions/@index"));
});

test("requires the @call const to equal the function name", () => {
  const source = catalog("mismatch");
  (source.functions as JsonObject).isPresent = {
    ...((source.functions as JsonObject).isPresent as JsonObject),
    properties: { "@call": { const: "somethingElse" }, args: { type: "object" } },
  };
  assert.ok(registrationIssues(source, "mismatch").some(({ path }) => path === "/functions/isPresent/properties/@call/const"));
});

test("rejects theme, $defs.theme, and primaryColor declarations", () => {
  const rootTheme = { ...catalog("root-theme"), theme: { type: "object" } };
  assert.ok(registrationIssues(rootTheme, "root-theme").length > 0);

  const defsTheme = catalog("defs-theme");
  (defsTheme.$defs as JsonObject).theme = { type: "object", properties: { primaryColor: { type: "string" } } };
  assert.ok(registrationIssues(defsTheme, "defs-theme").some(({ path }) => path === "/$defs"));

  const defsPrimary = catalog("defs-primary");
  (defsPrimary.$defs as JsonObject).primaryColor = { type: "string" };
  assert.ok(registrationIssues(defsPrimary, "defs-primary").some(({ path }) => path === "/$defs"));
});

test("rejects external $ref targets other than the standard common_types.json names", () => {
  const cases: Array<[string, string]> = [
    ["sibling catalog", "basic_catalog.json#/components/Text"],
    ["absolute catalog URI", "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json#/components/Button/properties/action"],
    ["v0.9 common types URI", "https://a2ui.org/specification/v0_9/common_types.json#/$defs/DynamicString"],
    ["non-standard common type", "common_types.json#/$defs/Extensions"],
  ];
  for (const [name, reference] of cases) {
    const source = catalog(`external-${name.replaceAll(" ", "-")}`, {
      Linked: { type: "object", properties: { component: { const: "Linked" }, value: { $ref: reference } } },
    });
    const issues = registrationIssues(source, `external-${name.replaceAll(" ", "-")}`);
    assert.ok(issues.some(({ message }) => message.includes("Unsupported external $ref")), name);
  }
});

test("accepts local references and the standard common_types.json names, including the absolute v1.0 alias", () => {
  const source = catalog("allowed-refs", {
    Label: {
      type: "object",
      allOf: [{ $ref: "common_types.json#/$defs/Checkable" }],
      properties: {
        component: { const: "Label" },
        text: { $ref: "common_types.json#/$defs/DynamicString" },
        caption: { $ref: "https://a2ui.org/specification/v1_0/common_types.json#/$defs/DynamicString" },
      },
      required: ["component", "text"],
    },
  });
  const registry = new CatalogRegistry();
  const result = registry.register({ catalogId: "allowed-refs", schema: source });
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.error));
  assert.equal(registry.isComponentCheckable("allowed-refs", "Label"), true);
  const snapshot = registry.get("allowed-refs");
  const caption = ((snapshot?.schema.components as JsonObject).Label as JsonObject).properties as JsonObject;
  assert.deepEqual(caption.caption, { $ref: "common_types.json#/$defs/DynamicString" });
});

test("requires rendererOnly for requiresUserActivation and exposes function descriptor metadata", () => {
  const withFunctions = (functions: JsonObject) => ({ ...catalog("functions"), functions });
  const fn = (fields: JsonObject, name = "run") => ({
    type: "object",
    properties: { "@call": { const: name }, args: { type: "object" } },
    required: ["@call", "args"],
    ...fields,
  });

  for (const [name, fields] of [
    ["agentOnlyActivation", { returnType: "void", allowedCallers: "agentOnly", requiresUserActivation: true }],
    ["rendererOrAgentActivation", { returnType: "void", allowedCallers: "rendererOrAgent", requiresUserActivation: true }],
  ] as const) {
    const issues = registrationIssues(withFunctions({ [name]: fn(fields, name) }), "functions");
    assert.ok(issues.some(({ path }) => path.startsWith(`/functions/${name}`)), `${name} must be rejected`);
  }

  const registry = new CatalogRegistry();
  assert.equal(registry.register({ catalogId: "functions", schema: withFunctions({
    openUrl: fn({ returnType: "void", requiresUserActivation: true }, "openUrl"),
    fetchData: fn({ returnType: "object", allowedCallers: "agentOnly" }, "fetchData"),
    summarize: fn({ returnType: "validationResult", allowedCallers: "rendererOrAgent" }, "summarize"),
  }) }).ok, true);

  const openUrl = registry.getFunctionDefinition("functions", "openUrl");
  assert.deepEqual(openUrl.ok && { returnType: openUrl.value.returnType, allowedCallers: openUrl.value.allowedCallers, requiresUserActivation: openUrl.value.requiresUserActivation }, {
    returnType: "void", allowedCallers: "rendererOnly", requiresUserActivation: true,
  });
  const fetchData = registry.getFunctionDefinition("functions", "fetchData");
  assert.deepEqual(fetchData.ok && { returnType: fetchData.value.returnType, allowedCallers: fetchData.value.allowedCallers, requiresUserActivation: fetchData.value.requiresUserActivation }, {
    returnType: "object", allowedCallers: "agentOnly", requiresUserActivation: false,
  });
  const summarize = registry.getFunctionDefinition("functions", "summarize");
  assert.ok(summarize.ok && summarize.value.returnType === "validationResult");
});

test("validates wire function calls by @call and rejects declaration-only keys", () => {
  const registry = registered("calls");
  assert.equal(registry.validateFunctionCall("calls", { "@call": "isPresent", args: { value: "x" } }).ok, true);
  assert.equal(registry.validateFunctionCall("calls", { "@call": "isPresent", args: {} }).ok, false);
  const declared = registry.validateFunctionCall("calls", { "@call": "isPresent", args: { value: "x" }, returnType: "boolean" });
  assert.equal(declared.ok, false);
  if (!declared.ok) {
    assert.equal(declared.error.code, "FUNCTION_VALIDATION_FAILED");
    assert.ok(declared.error.issues?.some(({ path }) => path === "/returnType"));
  }
  const legacy = registry.validateFunctionCall("calls", { call: "isPresent", args: { value: "x" } });
  assert.equal(!legacy.ok && legacy.error.code, "FUNCTION_NOT_ALLOWED");
  const unknown = registry.validateFunctionCall("calls", { "@call": "missing", args: {} });
  assert.equal(!unknown.ok && unknown.error.code, "FUNCTION_NOT_ALLOWED");
});

test("does not resolve progressive component references or require a root ID", () => {
  const registry = registered();
  assert.equal(registry.validateComponent("test", { id: "not-root", component: "Button", child: "missing" }).ok, true);
});

test("discovers only direct Action property references defensively", () => {
  const source = catalog("actions", {
    CustomButton: {
      type: "object",
      properties: {
        component: { const: "CustomButton" },
        primaryAction: { $ref: "common_types.json#/$defs/Action" },
        config: { type: "object" },
        wrappedAction: { oneOf: [{ $ref: "common_types.json#/$defs/Action" }] },
      },
    },
  });
  const registry = new CatalogRegistry();
  assert.equal(registry.register({ catalogId: "actions", schema: source }).ok, true);
  const result = registry.getActionProperties("actions", "CustomButton");
  assert.deepEqual(result, { ok: true, value: ["primaryAction"] });
  if (result.ok) result.value.push("config");
  assert.deepEqual(registry.getActionProperties("actions", "CustomButton"), { ok: true, value: ["primaryAction"] });
});

test("discovers wrapped and recursively nested dynamic value locations defensively", () => {
  const source = catalog("locations", {
    Complex: {
      type: "object",
      properties: {
        component: { const: "Complex" },
        min: { allOf: [
          { $ref: "common_types.json#/$defs/DynamicString" },
          { if: {}, then: {} },
        ] },
        config: { type: "object", properties: { title: { $ref: "common_types.json#/$defs/DynamicString" } } },
        options: { type: "array", items: { type: "object", properties: {
          label: { $ref: "common_types.json#/$defs/DynamicString" }, value: { type: "string" },
        } } },
        groups: { type: "array", items: { type: "object", properties: {
          items: { type: "array", items: { type: "object", properties: {
            label: { $ref: "common_types.json#/$defs/DynamicBoolean" },
          } } },
        } } },
        ignored: { oneOf: [{ $ref: "common_types.json#/$defs/DynamicString" }, { type: "number" }] },
      },
    },
  });
  const registry = new CatalogRegistry();
  assert.equal(registry.register({ catalogId: "locations", schema: source }).ok, true);
  const expected = [
    { path: [{ kind: "property", name: "min" }], valueKind: "dynamicString" },
    { path: [{ kind: "property", name: "config" }, { kind: "property", name: "title" }], valueKind: "dynamicString" },
    { path: [{ kind: "property", name: "options" }, { kind: "arrayItems" }, { kind: "property", name: "label" }], valueKind: "dynamicString" },
    { path: [{ kind: "property", name: "groups" }, { kind: "arrayItems" }, { kind: "property", name: "items" }, { kind: "arrayItems" }, { kind: "property", name: "label" }], valueKind: "dynamicBoolean" },
  ];
  const result = registry.getDynamicValueLocations("locations", "Complex");
  assert.deepEqual(result, { ok: true, value: expected });
  assert.deepEqual(registry.getDynamicProperties("locations", "Complex"), { ok: true, value: [] });
  if (result.ok) {
    result.value.push({ path: [], valueKind: "dynamicNumber" });
    (result.value[0]!.path[0] as { kind: "property"; name: string }).name = "changed";
  }
  assert.deepEqual(registry.getDynamicValueLocations("locations", "Complex"), { ok: true, value: expected });
});

test("discovers only direct supported dynamic property references defensively", () => {
  const source = catalog("dynamic", {
    Metric: {
      type: "object",
      properties: {
        component: { const: "Metric" },
        primaryValue: { $ref: "common_types.json#/$defs/DynamicNumber" },
        unusualLabel: { $ref: "common_types.json#/$defs/DynamicString" },
        wrapped: { oneOf: [{ $ref: "common_types.json#/$defs/DynamicBoolean" }] },
        metadata: { type: "object", properties: { path: { type: "string" } } },
      },
      required: ["component"], additionalProperties: false,
    },
  });
  const registry = new CatalogRegistry();
  assert.equal(registry.register({ catalogId: "dynamic", schema: source }).ok, true);
  const result = registry.getDynamicProperties("dynamic", "Metric");
  assert.deepEqual(result, { ok: true, value: [
    { property: "primaryValue", valueKind: "dynamicNumber" },
    { property: "unusualLabel", valueKind: "dynamicString" },
  ] });
  if (result.ok) result.value[0]!.property = "changed";
  const again = registry.getDynamicProperties("dynamic", "Metric");
  assert.equal(again.ok && again.value[0]?.property, "primaryValue");
});

test("resolves built-in common types with relative and absolute v1.0 refs and no embedded copy", () => {
  const source: JsonObject = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    protocolVersion: "1.0",
    catalogId: "builtin-common",
    components: {
      Label: {
        type: "object",
        properties: {
          component: { const: "Label" },
          text: { $ref: "common_types.json#/$defs/DynamicString" },
          caption: { $ref: "https://a2ui.org/specification/v1_0/common_types.json#/$defs/DynamicString" },
          child: { $ref: "common_types.json#/$defs/Child" },
        },
        required: ["component", "text"],
        additionalProperties: false,
      },
    },
    functions: {
      isPresent: {
        type: "object",
        returnType: "boolean",
        properties: {
          "@call": { const: "isPresent" },
          args: { type: "object", properties: { value: {} }, required: ["value"] },
        },
        required: ["@call", "args"],
      },
    },
  };
  const registry = new CatalogRegistry();
  const result = registry.register({ catalogId: "builtin-common", schema: source });
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.error));

  const label = (fields: JsonObject) => ({ id: "l", component: "Label", text: "hi", ...fields }) as A2UIComponent;
  assert.equal(registry.validateComponent("builtin-common", label({})).ok, true);
  assert.equal(registry.validateComponent("builtin-common", label({ text: { "@path": "/name" } })).ok, true);
  assert.equal(
    registry.validateComponent("builtin-common", label({ text: { "@call": "isPresent", args: { value: { "@path": "/x" } } } })).ok,
    true,
  );
  expectCode(registry.validateComponent("builtin-common", label({ text: 42 })), "COMPONENT_VALIDATION_FAILED");
  // Component schemas accept any FunctionCall envelope; an unknown name is refused per call against its catalog.
  assert.equal(registry.validateComponent("builtin-common", label({ text: { "@call": "missing", args: {} } })).ok, true);
  const unknownCall = registry.validateFunctionCall("builtin-common", { "@call": "missing", args: {} });
  assert.equal(!unknownCall.ok && unknownCall.error.code, "FUNCTION_NOT_ALLOWED");
  expectCode(registry.validateComponent("builtin-common", label({ caption: 42 })), "COMPONENT_VALIDATION_FAILED");
  assert.equal(registry.validateComponent("builtin-common", label({ caption: "Plain" })).ok, true);

  assert.deepEqual(registry.getComponentStructure("builtin-common", "Label"), {
    ok: true,
    value: { singleChildFields: ["child"], childListFields: [] },
  });
});

test("rejects a catalog that embeds common_types.json because Core provides it", () => {
  const source = catalog("embedded-common");
  (source.$defs as JsonObject).commonTypes = { $id: "common_types.json", $defs: { DynamicString: {} } };
  const issues = registrationIssues(source, "embedded-common");
  assert.ok(issues.some(({ message, path }) => path === "/$defs/commonTypes" && message.includes("built into Weaver")));
});

test("rejects a function argument that references another catalog", () => {
  const source = catalog("arg-ref");
  (source.functions as JsonObject).formatBadge = {
    type: "object",
    returnType: "string",
    properties: {
      "@call": { const: "formatBadge" },
      args: {
        type: "object",
        properties: {
          value: { $ref: "other_catalog.json#/functions/formatString/properties/args/properties/value" },
        },
        required: ["value"],
      },
    },
    required: ["@call", "args"],
  };
  assert.ok(registrationIssues(source, "arg-ref").some(({ message }) => message.includes("Unsupported external $ref")));
});

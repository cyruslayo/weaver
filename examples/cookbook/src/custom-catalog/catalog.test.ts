import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createA2UIV091Producer,
  createBasicCatalogV091Registration,
  createWeaverRuntime,
  generateA2UIV091Prompt,
  type A2UIComponent,
  type JsonObject,
  type JsonValue,
} from "@cylayo/weaver-core";
import { createBasicWebRuntime } from "@cylayo/weaver-web";
import {
  COOKBOOK_CATALOG_ID,
  COOKBOOK_MAX_BARS,
  cookbookCatalog,
  cookbookCatalogSchema,
} from "./catalog.js";

const SURFACE_ID = "cookbook-custom-catalog";
const BASIC_CATALOG_ID = "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json";

/** A screen that uses every cookbook component and the three layout primitives. */
function screenComponents(overrides: {
  columns?: JsonValue;
  barChart?: Partial<JsonObject>;
} = {}): A2UIComponent[] {
  return [
    { id: "root", component: "Column", children: ["card"] },
    { id: "card", component: "Card", child: "content" },
    { id: "content", component: "Column", children: ["title", "table", "chart"] },
    { id: "title", component: "Text", text: "Orders" },
    {
      id: "table",
      component: "DataTable",
      caption: "Recent orders",
      columns:
        overrides.columns ?? [
          { key: "id", header: "Order" },
          { key: "total", header: "Total", align: "end" },
        ],
      rows: { path: "/orders" },
    },
    {
      id: "chart",
      component: "BarChart",
      title: "By status",
      values: { path: "/stats/byStatus" },
      maxBars: 10,
      ...overrides.barChart,
    } as A2UIComponent,
  ];
}

/** The schema issues behind a component rejection, for precise assertions. */
function validationIssues(error: unknown): Array<{ path: string; keyword: string }> {
  const catalogError = (error as { catalogError?: { issues?: Array<{ path: string; keyword: string }> } })
    .catalogError;
  return catalogError?.issues ?? [];
}

function runtimeWithCookbook() {
  const created = createWeaverRuntime({
    catalogs: [createBasicCatalogV091Registration(), cookbookCatalog],
  });
  assert.equal(created.ok, true, "cookbook catalog must register next to Basic");
  if (!created.ok) throw new Error("unreachable");
  return created.value;
}

/** Creates the surface with the cookbook catalog, then sends the given components. */
function processComponents(components: JsonValue[]) {
  const runtime = runtimeWithCookbook();
  const producer = createA2UIV091Producer();
  const created = runtime.process(
    producer.createSurface({
      surfaceId: SURFACE_ID,
      catalogId: COOKBOOK_CATALOG_ID,
      sendDataModel: false,
    }),
  );
  assert.equal(created.ok, true, "createSurface with the cookbook catalogId must succeed");
  return runtime.process({
    version: "v0.9.1",
    updateComponents: { surfaceId: SURFACE_ID, components },
  });
}

test("the cookbook catalog registers with createWeaverRuntime and as an additional Web catalog", () => {
  const runtime = runtimeWithCookbook();
  assert.ok(runtime, "runtime created");

  const web = createBasicWebRuntime({ additionalCatalogs: [cookbookCatalog] });
  assert.equal(web.ok, true, "createBasicWebRuntime must accept the cookbook catalog");
  assert.equal(web.ok && web.value.catalogId, BASIC_CATALOG_ID);
});

test("the cookbook catalog declares its own catalogId and leaves the Basic catalog untouched", () => {
  assert.equal(cookbookCatalog.catalogId, COOKBOOK_CATALOG_ID);
  assert.notEqual(COOKBOOK_CATALOG_ID, BASIC_CATALOG_ID);

  const basic = createBasicCatalogV091Registration().schema.components as Record<string, unknown>;
  assert.equal("DataTable" in basic, false, "Basic must not gain DataTable");
  assert.equal("BarChart" in basic, false, "Basic must not gain BarChart");
  assert.deepEqual(
    cookbookCatalog.schema.components.Column,
    basic.Column,
    "layout primitives are reused from Basic, not redefined",
  );
  assert.deepEqual(cookbookCatalog.schema.components.Text, basic.Text);
  assert.deepEqual(cookbookCatalog.schema.components.Card, basic.Card);
});

test("a valid screen using every cookbook component passes message validation", () => {
  const result = processComponents(screenComponents());
  assert.equal(result.ok, true, JSON.stringify(result));
});

test("BarChart rejects maxBars above the cap of 50 at message validation", () => {
  assert.equal(COOKBOOK_MAX_BARS, 50);
  const over = processComponents(screenComponents({ barChart: { maxBars: 51 } }));
  assert.equal(over.ok, false, "maxBars 51 must be rejected");
  if (!over.ok) {
    assert.equal(over.error.code, "CATALOG_REGISTRY_ERROR");
    const issues = validationIssues(over.error);
    assert.ok(
      issues.some((issue) => issue.keyword === "maximum" && issue.path === "/maxBars"),
      "the rejection names the maximum on /maxBars",
    );
  }

  const zero = processComponents(screenComponents({ barChart: { maxBars: 0 } }));
  assert.equal(zero.ok, false, "maxBars 0 must be rejected");

  const fractional = processComponents(screenComponents({ barChart: { maxBars: 2.5 } }));
  assert.equal(fractional.ok, false, "a fractional maxBars must be rejected");

  const atCap = processComponents(screenComponents({ barChart: { maxBars: 50 } }));
  assert.equal(atCap.ok, true, "maxBars 50 is the cap and must be accepted");
});

test("BarChart accepts values as a data binding and as a literal array of {label, value}", () => {
  assert.equal(processComponents(screenComponents()).ok, true, "a data binding is accepted");
  const literal = processComponents(
    screenComponents({ barChart: { values: [{ label: "Paid", value: 3 }, { label: "Open", value: 0 }] } }),
  );
  assert.equal(literal.ok, true, JSON.stringify(literal));
});

test("BarChart rejects a values array of the wrong shape", () => {
  const wrongShapes: Array<[string, JsonValue]> = [
    ["a string", "Paid"],
    ["an item without a value", [{ label: "Paid" }]],
    ["an item whose value is a string", [{ label: "Paid", value: "3" }]],
    ["an item with an extra property", [{ label: "Paid", value: 3, colour: "red" }]],
    ["a plain number array", [1, 2, 3]],
  ];
  for (const [label, values] of wrongShapes) {
    const result = processComponents(screenComponents({ barChart: { values } }));
    assert.equal(result.ok, false, `${label} must be rejected`);
  }
});

test("the generated prompt presents the binding as preferred and names the literal alternative", () => {
  const result = generateA2UIV091Prompt({ catalogs: [cookbookCatalog] });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.value.text, /data binding such as \{"path": "\/orders"\} \(preferred\) or a literal array/);
  assert.match(result.value.text, /data binding such as \{"path": "\/stats\/byStatus"\} \(preferred\) or a literal array/);
});

test("the generated prompt says DataTable is read-only and points row actions to a List template of Cards", () => {
  const result = generateA2UIV091Prompt({ catalogs: [cookbookCatalog] });
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) return;
  assert.match(result.value.text, /A read-only table of rows/);
  assert.match(result.value.text, /For rows with actions, use a List template of Cards instead\./);
  assert.doesNotMatch(result.value.text, /rowAction/, "the prompt never offers a rowAction");
});

test("the DataTable schema declares no rowAction and its description points to a List template", () => {
  const components = cookbookCatalogSchema.components as Record<string, JsonObject>;
  const dataTable = components.DataTable as {
    description?: string;
    additionalProperties?: unknown;
    properties: Record<string, JsonObject>;
  };
  assert.equal("rowAction" in dataTable.properties, false, "rowAction is removed from the DataTable schema");
  assert.equal(dataTable.additionalProperties, false, "unknown DataTable properties are rejected");
  assert.match(dataTable.description ?? "", /For rows with actions, use a List template of Cards instead\./);
});

test("DataTable rejects a bad column shape at message validation", () => {
  const cases: Array<[string, JsonValue]> = [
    ["a column without a header", [{ key: "id" }]],
    ["a column without a key", [{ header: "Order" }]],
    ["an unknown column property", [{ key: "id", header: "Order", width: 3 }]],
    ["an empty key", [{ key: "", header: "Order" }]],
    ["an unknown alignment", [{ key: "id", header: "Order", align: "left" }]],
    ["an empty column list", []],
    [
      "more than 12 columns",
      Array.from({ length: 13 }, (_, index) => ({ key: `c${index}`, header: `C${index}` })),
    ],
  ];
  for (const [label, columns] of cases) {
    const result = processComponents(screenComponents({ columns }));
    assert.equal(result.ok, false, `${label} must be rejected`);
  }
});

/** Replaces the `rows` property of the DataTable in the standard screen. */
function screenWithRows(rows: JsonValue): A2UIComponent[] {
  const components = screenComponents();
  const table = components.find((component) => component.id === "table") as JsonObject;
  return components.map((component) =>
    component.id === "table" ? ({ ...table, rows } as unknown as A2UIComponent) : component,
  );
}

test("DataTable accepts rows as a data binding and as a literal array of row objects", () => {
  assert.equal(processComponents(screenComponents()).ok, true, "a data binding is accepted");
  const literal = processComponents(screenWithRows([{ id: "A-1", total: 10 }]));
  assert.equal(literal.ok, true, JSON.stringify(literal));
  const empty = processComponents(screenWithRows([]));
  assert.equal(empty.ok, true, "an empty literal array is a valid list of rows");
});

test("DataTable rejects a rows value of the wrong shape", () => {
  const wrongShapes: Array<[string, JsonValue]> = [
    ["a string", "A-1"],
    ["a number", 5],
    ["an array of strings", ["A-1", "A-2"]],
    ["an array containing an array", [["A-1"]]],
  ];
  for (const [label, rows] of wrongShapes) {
    assert.equal(processComponents(screenWithRows(rows)).ok, false, `${label} must be rejected`);
  }
});

test("Button is declared by the cookbook catalog, so a Button message is accepted", () => {
  const components: A2UIComponent[] = [
    { id: "root", component: "Column", children: ["button"] },
    {
      id: "button",
      component: "Button",
      child: "label",
      action: { event: { name: "x", context: {} } },
    },
    { id: "label", component: "Text", text: "Go" },
  ];
  const result = processComponents(components);
  assert.equal(result.ok, true, JSON.stringify(result));
});

test("a component outside the cookbook catalog is rejected, so one surface uses one catalog", () => {
  // Divider is a valid Basic component that this catalog does not declare, so only the catalog membership fails.
  const components: A2UIComponent[] = [
    { id: "root", component: "Column", children: ["rule", "label"] },
    { id: "rule", component: "Divider" },
    { id: "label", component: "Text", text: "Go" },
  ];
  const result = processComponents(components);
  assert.equal(result.ok, false, "Divider is not declared by the cookbook catalog");
});

test("the generated prompt lists DataTable and BarChart and no undeclared component", () => {
  const result = generateA2UIV091Prompt({ catalogs: [cookbookCatalog] });
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) return;

  const components = result.value.sections.find((section) => section.id === "components");
  assert.ok(components, "a components section is generated");
  const headings = [...components.text.matchAll(/^### (\w+)$/gm)].map((match) => match[1]);
  assert.deepEqual(
    [...headings].sort(),
    ["BarChart", "Button", "Card", "Column", "DataTable", "Text"],
    "only the components this catalog declares appear",
  );
  for (const undeclared of ["Divider", "Row", "List", "TextField", "Tabs", "Modal"]) {
    assert.doesNotMatch(result.value.text, new RegExp(`^### ${undeclared}$`, "m"));
  }

  assert.match(result.value.text, new RegExp(COOKBOOK_CATALOG_ID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const again = generateA2UIV091Prompt({ catalogs: [cookbookCatalog] });
  assert.equal(again.ok && again.value.text, result.value.text, "the prompt is deterministic");
});

test("every DataTable and BarChart property has a description for the prompt", () => {
  const components = cookbookCatalogSchema.components as Record<string, JsonObject>;
  for (const name of ["DataTable", "BarChart"]) {
    const schema = components[name] as {
      description?: string;
      properties: Record<string, JsonObject>;
    };
    assert.ok(schema.description?.length, `${name} has a component description`);
    for (const [property, definition] of Object.entries(schema.properties)) {
      assert.ok(
        typeof definition.description === "string" && definition.description.length > 0,
        `${name}.${property} must have a description`,
      );
    }
  }

  const columnItem = (components.DataTable as {
    properties: { columns: { items: { properties: Record<string, JsonObject> } } };
  }).properties.columns.items.properties;
  for (const [property, definition] of Object.entries(columnItem)) {
    assert.ok(
      typeof definition.description === "string" && definition.description.length > 0,
      `DataTable column ${property} must have a description`,
    );
  }
});

test("the prompt carries the schema descriptions and the cap", () => {
  const result = generateA2UIV091Prompt({ catalogs: [cookbookCatalog] });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.value.text, /A read-only table of rows/);
  assert.match(result.value.text, /The most bars to draw, from 1 to 50/);
});

test("a DataTable message that still sends rowAction is rejected at message validation", () => {
  const components = screenComponents().map((component) =>
    component.id === "table"
      ? ({
          ...component,
          rowAction: { event: { name: "cookbook.orders.open", context: { source: "orders" } } },
        } as unknown as A2UIComponent)
      : component,
  );
  const result = processComponents(components);
  assert.equal(result.ok, false, "a DataTable with rowAction must be rejected");
  if (!result.ok) {
    assert.equal(result.error.code, "CATALOG_REGISTRY_ERROR");
    assert.ok(
      validationIssues(result.error).some((issue) => issue.keyword === "additionalProperties"),
      "the rejection names the unknown rowAction property",
    );
  }
});

test("registering the cookbook catalog twice is rejected rather than silently replaced", () => {
  const result = createWeaverRuntime({
    catalogs: [createBasicCatalogV091Registration(), cookbookCatalog, cookbookCatalog],
  });
  assert.equal(result.ok, false, "a duplicate catalogId must not register silently");
});

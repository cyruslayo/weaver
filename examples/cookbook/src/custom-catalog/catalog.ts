import {
  createBasicCatalogV091Registration,
  defineCatalog,
  type A2UIV091CatalogSchema,
  type JsonObject,
} from "@cylayo/weaver-core";

/**
 * The app-owned cookbook catalog: DataTable and BarChart, plus the layout
 * primitives (Column, Text, Card) and the Button that the screens need.
 *
 * ONE CATALOG PER SURFACE. A surface is created with exactly one catalogId,
 * so this catalog must declare every component the surface uses. It does not
 * inherit Basic components at runtime. The layout primitives below are copied
 * from the canonical Basic registration, so their schemas are not redefined here.
 *
 * The canonical Basic catalog is never modified. This catalog has its own
 * catalogId and is registered next to Basic with `additionalCatalogs`.
 */
export const COOKBOOK_CATALOG_ID = "https://weaver.dev/examples/cookbook/v1";

/** The largest number of bars a BarChart may request. The schema enforces it. */
export const COOKBOOK_MAX_BARS = 50;

const basic = createBasicCatalogV091Registration().schema;

function basicComponent(name: string): JsonObject {
  const components = basic.components as Record<string, JsonObject> | undefined;
  const schema = components?.[name];
  if (schema === undefined) {
    throw new Error(`The Basic catalog does not declare ${name}`);
  }
  return schema;
}

/**
 * Basic's shared definitions, without `anyComponent`. That definition is a
 * union over every Basic component, so keeping it would make the cookbook
 * catalog reference components it does not declare. Everything else (theme,
 * commonTypes, anyFunction, basicFunctions) is needed by the layout primitives.
 */
const basicDefs = Object.fromEntries(
  Object.entries(basic.$defs as JsonObject).filter(([name]) => name !== "anyComponent"),
) as JsonObject & { theme: JsonObject };
const basicFunctions = basic.functions as Record<string, JsonObject> | undefined;

const dataTable: JsonObject = {
  type: "object",
  description:
    "A read-only table of rows. Use it for lists of records such as orders, tickets, or results. Columns name the fields to show, and the rows come from a data binding. For rows with actions, use a List template of Cards instead.",
  properties: {
    id: {
      type: "string",
      description: "The unique component id within the surface.",
    },
    component: {
      const: "DataTable",
      description: "Must be the literal string DataTable.",
    },
    caption: {
      $ref: "common_types.json#/$defs/DynamicString",
      description:
        "A short caption shown above the table. Accepts a literal string or a data binding such as {\"path\": \"/table/caption\"}.",
    },
    columns: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      description:
        "The columns, in display order. Each column reads the field named by key from every row.",
      items: {
        type: "object",
        description: "One column of the table.",
        properties: {
          key: {
            type: "string",
            minLength: 1,
            description: "The field name to read from each row object.",
          },
          header: {
            type: "string",
            description: "The column heading shown to the user.",
          },
          align: {
            type: "string",
            enum: ["start", "center", "end"],
            description: "Horizontal alignment of the cells. Defaults to start.",
          },
        },
        required: ["key", "header"],
        additionalProperties: false,
      },
    },
    rows: {
      // The Basic bindable-value pattern: a data binding, or a literal array of the same item shape.
      // Core resolves the binding before the renderer runs, because the literal branch is declared.
      oneOf: [
        { $ref: "common_types.json#/$defs/DataBinding" },
        {
          type: "array",
          items: {
            type: "object",
            description: "One row. Its keys are the field names that the columns read.",
          },
        },
      ],
      description:
        "The rows to show, as a data binding such as {\"path\": \"/orders\"} (preferred) or a literal array of row objects. Each object supplies the values for the columns.",
    },
  },
  required: ["id", "component", "columns", "rows"],
  additionalProperties: false,
};

const barChart: JsonObject = {
  type: "object",
  description:
    "A bar chart with one bar per item, drawn from a data binding. Use it for a small set of labelled numeric values, such as counts per status.",
  properties: {
    id: {
      type: "string",
      description: "The unique component id within the surface.",
    },
    component: {
      const: "BarChart",
      description: "Must be the literal string BarChart.",
    },
    title: {
      type: "string",
      description: "The chart title shown above the bars.",
    },
    values: {
      // The same bindable-value pattern as rows: a binding, or a literal array of the same item shape.
      oneOf: [
        { $ref: "common_types.json#/$defs/DataBinding" },
        {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "The label shown under the bar." },
              value: { type: "number", description: "The bar height. It is a number." },
            },
            required: ["label", "value"],
            additionalProperties: false,
          },
        },
      ],
      description:
        "The bars, as a data binding such as {\"path\": \"/stats/byStatus\"} (preferred) or a literal array of {label, value} objects. Each object becomes one bar. The value is a number.",
    },
    maxBars: {
      type: "integer",
      minimum: 1,
      maximum: COOKBOOK_MAX_BARS,
      description: `The most bars to draw, from 1 to ${COOKBOOK_MAX_BARS}. Extra items are not drawn.`,
    },
  },
  required: ["id", "component", "title", "values", "maxBars"],
  additionalProperties: false,
};

/**
 * The catalog schema. The `$defs` object is copied from Basic, so the shared
 * common types and the theme definition come from the canonical registration.
 */
export const cookbookCatalogSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: COOKBOOK_CATALOG_ID,
  title: "Weaver Cookbook Catalog",
  description:
    "App-owned components for the cookbook screens: DataTable and BarChart, plus the Column, Text, Card, and Button primitives.",
  catalogId: COOKBOOK_CATALOG_ID,
  components: {
    Column: basicComponent("Column"),
    Text: basicComponent("Text"),
    Card: basicComponent("Card"),
    Button: basicComponent("Button"),
    DataTable: dataTable,
    BarChart: barChart,
  },
  // Basic's shared $defs refer to Basic's functions, so the functions travel with them.
  functions: basicFunctions ?? {},
  $defs: basicDefs,
} satisfies A2UIV091CatalogSchema;

/** The typed catalog definition. Pass it to `createWeaverRuntime` or `createBasicWebRuntime({ additionalCatalogs })`. */
export const cookbookCatalog = defineCatalog(cookbookCatalogSchema);

# Custom catalogs

A custom catalog adds components that the canonical Basic catalog does not have, such as a
data table or a chart, to a Weaver surface. The model may then ask for those components, and
your code decides how they look. This guide is the recipe, from the catalog schema to the
failure tests. The worked example is the cookbook's `DataTable` and `BarChart` catalog, which
is real and tested. The code blocks quoted from it are checked against the cookbook sources.

Three rules hold for every custom catalog:

- **The catalog is trusted host configuration.** Its schema is what the runtime validates against,
  and its renderers are host code. The model only chooses from them.
- **A component chooses its catalog.** A component with `"@catalogId"` resolves to that catalog,
  and a component without one resolves to its surface's default catalog. A Basic surface can
  therefore place a custom component, and a custom surface can place Basic layout components.
  See [Catalog resolution](architecture.md#catalog-resolution).
- **A renderer is registered per catalog and component.** A component with no renderer fails
  safely, and it never falls back to another catalog.

## The runnable example

The Orders report screen mounts the cookbook catalog. Read its source while you read this guide:

- Screen: [`examples/cookbook/src/screens/orders-report.ts`](../examples/cookbook/src/screens/orders-report.ts).
  Its harness field is `catalog`. Other cookbook screens use Basic only.
- Browser checks: [`examples/cookbook/e2e/orders-report.spec.ts`](../examples/cookbook/e2e/orders-report.spec.ts).
- The cookbook's own summary is in [`examples/cookbook/README.md`](../examples/cookbook/README.md).

The sources are in `examples/cookbook/src/custom-catalog/`:

| File | Role |
|---|---|
| `catalog.ts` | The catalog schema and `cookbookCatalog` (step 1) |
| `dataTableRenderer.ts` | The trusted `DataTable` renderer (step 3) |
| `barChart.ts` | The trusted, dependency-free SVG `BarChart` renderer (step 3) |
| `renderers.ts` | The one registration list (step 4) |
| `crossCatalogSafety.test.ts` | The failure-mode tests (step 6) |

## Step 1: define the catalog

`defineCatalog()` attaches a catalog id to a schema. It does not validate the schema.
Validation happens when the catalog is registered with `createWeaverRuntime` or
`createBasicWebRuntime({ additionalCatalogs })` ([`definition.ts`](../packages/core/src/catalog/definition.ts)).

A v1.0 catalog document declares:

- `protocolVersion: "1.0"` (required), `catalogId`, and `components`. Each component is a JSON
  Schema object for its properties.
- `functions`, a map from function name to its declared contract. It may be empty.
- `$defs`, optional. If present it must contain `anyComponent` and `anyFunction`.
- No embedded `common_types.json`. The standard common types are built into Weaver, and a
  catalog that embeds them is rejected. Reference them as `common_types.json#/$defs/DynamicString`,
  `common_types.json#/$defs/DataBinding`, and so on.

The schema describes the component's properties only. The envelope keys (`id`, `@catalogId`,
`@accessibility`, `@checks`, `@metadata`) are removed before the component body is validated.
So a component schema does not list `id` in `required`. The `component` name stays in the body
and must match the schema's `const`.

The cookbook catalog declares its id once and then builds the schema around it:

<!-- from: examples/cookbook/src/custom-catalog/catalog.ts -->
```ts
export const COOKBOOK_CATALOG_ID = "https://weaver.dev/examples/cookbook/v1";
```

<!-- from: examples/cookbook/src/custom-catalog/catalog.ts -->
```ts
const basic = createBasicCatalogV10Registration().schema;
```

The schema object itself is short, because it reuses Basic's layout primitives and common
definitions:

<!-- from: examples/cookbook/src/custom-catalog/catalog.ts -->
```ts
  $id: COOKBOOK_CATALOG_ID,
  protocolVersion: "1.0",
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
  functions: basicFunctions ?? {},
  $defs: cookbookDefs,
} satisfies A2UIV10CatalogSchema;

/** The typed catalog definition. Pass it to `createWeaverRuntime` or `createBasicWebRuntime({ additionalCatalogs })`. */
```

<!-- from: examples/cookbook/src/custom-catalog/catalog.ts -->
```ts

```

The Basic definitions in `$defs` contain the shared `theme` and `anyFunction` definitions. The
cookbook copies them with `anyComponent` removed, so the catalog does not refer to components it
does not declare.

## Step 2: a minimal catalog you can run

This block is self-contained. It declares one `Note` component, registers the catalog with the
Core runtime, and shows that an undeclared component is rejected by the catalog.

```ts
import { createWeaverRuntime, defineCatalog, type A2UIV10CatalogSchema } from "@cylayo/weaver-core";

const catalogId = "https://example.com/catalogs/notes/v1";
const schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: catalogId,
  protocolVersion: "1.0",
  catalogId,
  title: "Notes",
  description: "A catalog with one Note component.",
  components: {
    Note: {
      type: "object",
      properties: {
        component: { const: "Note" },
        text: { $ref: "common_types.json#/$defs/DynamicString" },
      },
      required: ["component", "text"],
      additionalProperties: false,
    },
  },
  functions: {},
} satisfies A2UIV10CatalogSchema;

const created = createWeaverRuntime({ catalogs: [defineCatalog(schema)] });
if (!created.ok) throw new Error(`runtime configuration failed: ${created.error.code}`);
const runtime = created.value;

const surface = runtime.process({ version: "1.0", createSurface: { surfaceId: "notes", catalogId } });
if (!surface.ok) throw new Error(`createSurface failed: ${surface.error.code}`);

const updated = runtime.process({
  version: "1.0",
  updateComponents: {
    surfaceId: "notes",
    components: [{ id: "root", component: "Note", text: "Hello from a custom catalog" }],
  },
});
if (!updated.ok) throw new Error(`updateComponents failed: ${JSON.stringify(updated.error)}`);

const resolved = runtime.resolveSurface("notes");
if (!resolved.ok) throw new Error(`surface not resolved: ${resolved.error.code}`);
console.log(JSON.stringify(resolved.value.tree));

// A component the catalog does not declare is rejected, and the surface is unchanged.
const rejected = runtime.process({
  version: "1.0",
  updateComponents: { surfaceId: "notes", components: [{ id: "root", component: "Chart3D", text: "x" }] },
});
if (rejected.ok) throw new Error("an undeclared component must be rejected");
```

## Step 3: trusted renderers

Each cookbook component has a renderer in the Web package's trusted allowlist. The renderer
receives the validated, hydrated properties and returns a DOM `Node`. It must build its nodes with
`textContent` or attributes. It must never parse strings as HTML.

The table renderer uses one exported constant for its component name, and a registration that binds
it to the catalog id:

<!-- from: examples/cookbook/src/custom-catalog/dataTableRenderer.ts -->
```ts
export const DATA_TABLE_COMPONENT = "DataTable";
```

<!-- from: examples/cookbook/src/custom-catalog/dataTableRenderer.ts -->
```ts
/** The registration the cookbook catalog's renderer list includes. */
export const dataTableRegistration: RendererRegistration = {
  catalogId: COOKBOOK_CATALOG_ID,
  component: DATA_TABLE_COMPONENT,
  render: renderDataTable,
};
```

The chart registration is one function, which takes the catalog id as an argument:

<!-- from: examples/cookbook/src/custom-catalog/barChart.ts -->
```ts
/** The registration for one BarChart entry. The cookbook catalog id is the default. */
export function createBarChartRegistration(catalogId: string = COOKBOOK_CATALOG_ID): RendererRegistration {
  return { catalogId, component: "BarChart", render: renderBarChart };
}
```

A minimal renderer for the `Note` component of step 2 is shown in the next step, where the
registration is wired into the Web runtime.

## Step 4: register catalogs and renderers in Web

Pass the catalog through `additionalCatalogs` and its renderers through `additionalRenderers`.
`createBasicWebRuntime` keeps the Basic catalog and its renderers, and adds yours beside them.
The cookbook keeps every registration in one list:

<!-- from: examples/cookbook/src/custom-catalog/renderers.ts -->
```ts
/**
 * The ONE registration point for every trusted renderer of the cookbook catalog.
 * Pass it to `createBasicWebRuntime({ additionalRenderers })` together with
 * `additionalCatalogs: [cookbookCatalog]`. RendererRegistry throws on duplicate
 * registrations, so each component appears here exactly once. Add one line per
 * new cookbook component, and never register a component in another file.
 */
export const cookbookCatalogRendererRegistrations: readonly RendererRegistration[] = [
  ...cookbookLayoutRenderers,
  dataTableRegistration,
  createBarChartRegistration(),
];
```

The same wiring, self-contained, for a `Note` component:

```ts
import { defineCatalog, type A2UIV10CatalogSchema } from "@cylayo/weaver-core";
import { createBasicWebRuntime, type WebComponentRenderer } from "@cylayo/weaver-web";

const catalogId = "https://example.com/catalogs/notes/v1";
const schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: catalogId,
  protocolVersion: "1.0",
  catalogId,
  title: "Notes",
  description: "A catalog with one Note component.",
  components: {
    Note: {
      type: "object",
      properties: {
        component: { const: "Note" },
        text: { $ref: "common_types.json#/$defs/DynamicString" },
      },
      required: ["component", "text"],
      additionalProperties: false,
    },
  },
  functions: {},
} satisfies A2UIV10CatalogSchema;

// The renderer builds its node with textContent. It never parses the text as HTML.
const renderNote: WebComponentRenderer = ({ document, properties }) => {
  const paragraph = document.createElement("p");
  const text = properties.text;
  paragraph.textContent = typeof text === "string" ? text : "";
  return paragraph;
};

const created = createBasicWebRuntime({
  additionalCatalogs: [defineCatalog(schema)],
  additionalRenderers: [{ catalogId, component: "Note", render: renderNote }],
});
if (!created.ok) throw new Error(`Web runtime configuration failed: ${created.error.code}`);
```

A component declared by the catalog with no registered renderer is not rendered. Its surface
reports the failure through `onError`, and the last good DOM stays in place.

## Step 5: the prompt

Pass the same catalog to `generateA2UIV10Prompt()`. The generated prompt lists only the
components the catalog declares, and only the functions that are both declared and registered.
Catalog `instructions` are included in the prompt, with their Markdown headings demoted so they
cannot override the surrounding prompt sections. Set `defaultCatalogId` to the catalog that the
model's surfaces use by default, so the model can omit `"@catalogId"` for those components. Without
it, the prompt tells the model that there is no default catalog, and every component and call must
name its catalog. See [prompt generation](prompt-generation.md).

## Step 6: failure tests

The cookbook's cross-catalog tests exercise the failure modes that matter. They are the model
for your own tests:

- an unknown component on a custom surface is rejected at validation, and the prior DOM is kept:

<!-- from: examples/cookbook/src/custom-catalog/crossCatalogSafety.test.ts -->
```ts
test("(a) an unknown component on a cookbook surface is rejected at validation and the prior DOM is kept", () => {
  const web = createWeb();
  assert.equal(web.runtime.process(createSurface(COOKBOOK_CATALOG_ID)).ok, true);
  assert.equal(web.runtime.process(update(goodScreen)).ok, true);
  const target = createTarget();
  assert.equal(web.mount({ surfaceId: SURFACE_ID, target }).ok, true);
  const before = target.innerHTML;
  assert.equal(before.includes(LAST_GOOD_TEXT), true, "the good screen must be on the page before the bad update");

  const rejected = web.runtime.process(
    update([
      { id: "root", component: "Column", children: ["title", "chart"] },
      { id: "title", component: "Text", text: "Broken update" },
      { id: "chart", component: "Chart3D", values: [{ label: "A", value: 1 }] } as unknown as A2UIComponent,
    ]),
  );
  assert.equal(rejected.ok, false, "Chart3D is not declared by the cookbook catalog, so validation must reject it");
  assert.equal(rejectionCode(rejected), "COMPONENT_NOT_ALLOWED", "the rejection is the catalog's component check");
  assert.equal(target.innerHTML === before, true, "the last good DOM is unchanged by the rejected update");
  assert.equal(target.innerHTML.includes("Chart3D"), false, "no Chart3D markup reaches the page");
  assert.equal(target.innerHTML.includes("Broken update"), false, "the rejected text never reaches the page");
});
```

- a custom component on a Basic surface is rejected, and Basic never falls back to the custom catalog:

<!-- from: examples/cookbook/src/custom-catalog/crossCatalogSafety.test.ts -->
```ts
test("(b) a custom DataTable on a Basic surface is rejected, and Basic never falls back to the cookbook catalog", () => {
  const web = createWeb();
  assert.equal(web.runtime.process(createSurface(BASIC_CATALOG_ID)).ok, true);
  assert.equal(web.runtime.process(update(goodScreen)).ok, true);
  const target = createTarget();
  assert.equal(web.mount({ surfaceId: SURFACE_ID, target }).ok, true);
  const before = target.innerHTML;

  const rejected = web.runtime.process(
    update([
      { id: "root", component: "Column", children: ["table"] },
      {
        id: "table",
        component: "DataTable",
        columns: [{ key: "id", header: "Order" }],
        rows: [{ id: "A-1" }],
      } as unknown as A2UIComponent,
    ]),
  );
  assert.equal(rejected.ok, false, "DataTable is not declared by the Basic catalog, so Basic must reject it");
  assert.equal(rejectionCode(rejected), "COMPONENT_NOT_ALLOWED", "the rejection is the Basic catalog's component check");
  assert.equal(target.innerHTML === before, true, "the Basic DOM is unchanged");
  assert.equal(
    target.querySelector("[data-cookbook-component=DataTable]") === null,
    true,
    "no cookbook DataTable is rendered on the Basic surface",
  );

  // Control: the same DataTable is accepted on a cookbook surface, so the rejection above is the catalog boundary.
  const controlSurface = "cookbook-control";
  assert.equal(web.runtime.process(createSurface(COOKBOOK_CATALOG_ID, controlSurface)).ok, true);
  const accepted = web.runtime.process(
    update(
      [
        { id: "root", component: "Column", children: ["table"] },
        {
          id: "table",
          component: "DataTable",
          columns: [{ key: "id", header: "Order" }],
          rows: [{ id: "A-1" }],
        } as unknown as A2UIComponent,
      ],
      controlSurface,
    ),
  );
  assert.equal(accepted.ok, true, "the same DataTable must be accepted on a cookbook surface (control)");
});
```

## Mixing custom components with Basic

A surface does not need to be built on the custom catalog. A Basic surface can place a custom
component with `"@catalogId"`, and the rest of the screen stays Basic. The cookbook test
"(d) a Basic surface mixes in a cookbook DataTable" in `crossCatalogSafety.test.ts` covers this.

```json
{ "version": "1.0", "createSurface": { "surfaceId": "orders", "catalogId": "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json" } }
{ "version": "1.0", "updateComponents": { "surfaceId": "orders", "components": [
  { "id": "root", "component": "Column", "children": ["title", "table"] },
  { "id": "title", "component": "Text", "text": "Orders" },
  { "id": "table", "component": "DataTable", "@catalogId": "https://weaver.dev/examples/cookbook/v1", "columns": [{ "key": "id", "header": "Order" }], "rows": [{ "id": "A-1" }] }
] } }
```

Without `"@catalogId"`, the `DataTable` resolves to Basic and is rejected, because Basic does not
declare it. The model must name the catalog for each custom component it places.

## Security checklist

- The catalog schema is host code, reviewed like any other trusted configuration. Messages cannot
  add or change catalogs.
- Every component the catalog declares has a registered renderer, and every renderer writes only
  through `textContent`, attributes, or Weaver's interaction bridge.
- Every function the catalog declares has a trusted host implementation. Set `requiresUserActivation`
  for any function that opens a URL or performs an effect a click should gate, and set `allowedCallers`
  to the callers that need it.
- The catalog does not embed `common_types.json`, and it uses no external `$ref` targets.
- Each component's `@catalogId` is checked against the registered catalogs. A component that names an
  unregistered catalog is refused.
- Tests cover an undeclared component, a component without `@catalogId` placed in the wrong catalog, and
  a declared component with no renderer.

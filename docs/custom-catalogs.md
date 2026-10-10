# Custom catalogs

A custom catalog adds components that the canonical Basic catalog does not have, such as a
data table or a chart, to a Weaver surface. The model may then ask for those components, and
your code decides how they look. This guide is the recipe, from the catalog schema to the failure
tests. Every step uses the cookbook's `DataTable` and `BarChart` components, which are real and
tested.

Three rules hold for every custom catalog:

- **The catalog is trusted host configuration.** Its schema is what the runtime validates against,
  and its renderers are host code. The model only chooses from them.
- **One catalog per surface.** A surface is created with exactly one `catalogId`.
- **A renderer is registered per catalog and component.** A component with no renderer fails
  safely, and it never falls back to another catalog.

## The runnable example

The Orders report screen mounts the cookbook catalog. Open it, or read its source, while you read
this guide:

- Page: [`examples/cookbook/orders-report.html`](../examples/cookbook/orders-report.html), built by
  `pnpm --filter @weaver/cookbook dev`.
- Screen: [`examples/cookbook/src/screens/orders-report.ts`](../examples/cookbook/src/screens/orders-report.ts).
  Its harness field is `catalog`. Every other cookbook screen uses Basic only.
- Browser checks: [`examples/cookbook/e2e/orders-report.spec.ts`](../examples/cookbook/e2e/orders-report.spec.ts),
  which checks Tab order, the named table region, the chart's accessible name, and the Refresh
  flow at 1280px and 360px.
- The cookbook's own summary of the catalog is in
  [`examples/cookbook/README.md`](../examples/cookbook/README.md#custom-catalog).

The sources are in `examples/cookbook/src/custom-catalog/`:

| File | Role |
|---|---|
| `catalog.ts` | The catalog schema and `cookbookCatalog` (step 1, step 2) |
| `dataTableRenderer.ts` | The trusted `DataTable` renderer (step 3) |
| `barChart.ts` | The trusted, dependency-free SVG `BarChart` renderer (step 3) |
| `renderers.ts` | The one registration list (step 4) |
| `crossCatalogSafety.test.ts` | The failure-mode tests (step 6) |

## Step 1: define the catalog

`defineCatalog()` in `@cylayo/weaver-core` attaches a catalog id to a schema. It does not validate
the schema. Validation happens when the catalog is registered with `createWeaverRuntime` or
`createBasicWebRuntime({ additionalCatalogs })`
([`definition.ts`](../packages/core/src/catalog/definition.ts)).

A catalog schema is an A2UI v0.9.1 catalog document. It needs these parts:

- `$schema`, `catalogId`, and `components`, where each component is a JSON Schema object.
- `$defs` with a `theme` definition, and the shared `common_types.json` definitions that the
  components reference, such as `DynamicString` and `DataBinding`.
- `functions`, which may be empty.

The cookbook catalog declares its id once and then builds the schema around it:

<!-- from: examples/cookbook/src/custom-catalog/catalog.ts -->
```ts
export const COOKBOOK_CATALOG_ID = "https://weaver.dev/examples/cookbook/v1";
```

<!-- from: examples/cookbook/src/custom-catalog/catalog.ts -->
```ts
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
```

Each new component is a JSON Schema object with `additionalProperties: false`, so an unknown
property is rejected. Its `description` text matters, because the prompt generator copies it
(step 5).

## Step 2: one catalog per surface, and reuse Basic schemas

**One catalog per surface.** A surface is created with exactly one `catalogId`, and the runtime
does not merge catalogs at runtime. A surface that uses `DataTable` must therefore declare every
component it uses in the same custom catalog. The cookbook catalog declares `Column`, `Text`,
`Card`, and `Button`, along with its own two components, because the Orders report uses all six.
If the catalog omits `Button`, a `Button` on that surface is rejected with `COMPONENT_NOT_ALLOWED`.
The canonical Basic catalog is never modified. Your catalog has its own id and is registered beside
Basic with `additionalCatalogs`.

**Reuse Basic schemas, do not copy them.** The layout primitives come from the canonical
registration. The helper below reads a component's schema and throws if the name is missing:

<!-- from: examples/cookbook/src/custom-catalog/catalog.ts -->
```ts
function basicComponent(name: string): JsonObject {
  const components = basic.components as Record<string, JsonObject> | undefined;
  const schema = components?.[name];
  if (schema === undefined) {
    throw new Error(`The Basic catalog does not declare ${name}`);
  }
  return schema;
}
```

**Gotcha 1: do not keep `anyComponent`.** Basic's `$defs` include `anyComponent`, a union over every
Basic component. The cookbook filters it out of the shared definitions:

<!-- from: examples/cookbook/src/custom-catalog/catalog.ts -->
```ts
/**
 * Basic's shared definitions, without `anyComponent`. That definition is a
 * union over every Basic component, so keeping it would make the cookbook
 * catalog reference components it does not declare. Everything else (theme,
 * commonTypes, anyFunction, basicFunctions) is needed by the layout primitives.
 */
const basicDefs = Object.fromEntries(
  Object.entries(basic.$defs as JsonObject).filter(([name]) => name !== "anyComponent"),
) as JsonObject & { theme: JsonObject };
```

If you keep it, the catalog fails to register. A check with the cookbook catalog and
`anyComponent` copied back in gave `CATALOG_CONFIGURATION_FAILED` from `createWeaverRuntime`.

**Gotcha 2: a bindable list must be a `oneOf` of a binding and a literal array.** The `rows`
property of `DataTable` is written like this:

<!-- from: examples/cookbook/src/custom-catalog/catalog.ts -->
```ts
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
```

Core decides which properties to resolve from the schema. In
[`CatalogRegistry.ts`](../packages/core/src/catalog/CatalogRegistry.ts) (`discoverBindableValues`), a
property is bindable only when its schema is a direct `oneOf` with exactly one `DataBinding`
branch and at least one literal branch. Core resolves the binding only at those locations
([`ComponentPropertyResolver.ts`](../packages/core/src/component-properties/ComponentPropertyResolver.ts)).
Every other property reaches the renderer exactly as the model wrote it.

If `rows` were only a `DataBinding`, a `{"path": "/orders"}` value would reach the renderer as that
object, not as the array. We checked this with the cookbook renderer and a `rows` schema that had
no literal branch: the renderer received `{"path":"/orders"}`. The renderer then reads no rows and
shows its "No rows" line. With the `oneOf` the same binding arrived as `[{"id":"A-1"}]`. The
literal branch also lets a screen pass rows inline, which the tests exercise. `BarChart.values`
uses the same pattern.

## Step 3: write a trusted renderer

A renderer is a `WebComponentRenderer`: a function from `WebComponentRenderInput` to a `Node`. The
input gives you the `document`, the hydrated `properties` (bindings already resolved), the
component's `catalogId`, and `interactions`. The renderer is host code. It runs in the page with the
page's privileges, so the checklist below is part of the contract.

### Security checklist

1. **No HTML sinks.** Never use `innerHTML`, `outerHTML`, or `insertAdjacentHTML`. The cookbook's
   tests read the renderer sources and fail if any of them appear
   (`dataTableRenderer.test.ts`, `barChart.test.ts`).
2. **No dynamic code.** No `eval`, no `new Function`, no string-to-script. A test checks both.
3. **Text through `textContent` or attributes only.** Every label, caption and header is set with
   `textContent`. A label such as `<b>x</b>` renders as text (`barChart.test.ts` checks this). For
   example, the `DataTable` cell writes:

<!-- from: examples/cookbook/src/custom-catalog/dataTableRenderer.ts -->
```ts
      td.textContent = cellText(cellValue(row, column.key));
```

4. **SVG through `createElementNS`.** The chart builds its SVG with the SVG namespace, never with
   markup strings:

<!-- from: examples/cookbook/src/custom-catalog/barChart.ts -->
```ts
function svgElement(document: Document, name: string): SVGElement {
  return document.createElementNS(SVG_NS, name) as SVGElement;
}
```

5. **Bound every input.** Clamp numbers, cap counts and ignore malformed items. The schema rejects
   bad values at message validation, and the renderer still does not trust them. `BarChart` limits
   `maxBars` to 1 to 50 (`COOKBOOK_MAX_BARS`), clamps negative values to zero, and says how many items
   it left out:

<!-- from: examples/cookbook/src/custom-catalog/barChart.ts -->
```ts
  const requested = properties.maxBars;
  const limit = typeof requested === "number" && Number.isInteger(requested) && requested >= 1
    ? Math.min(requested, COOKBOOK_MAX_BARS)
    : 0;
  const bars = items.slice(0, limit);
  return { title, bars, omitted: items.length - bars.length, total: items.length };
```

6. **Accessible name, role, and a fallback.** `BarChart` is an `svg` with `role="img"` and
   `aria-labelledby` pointing at its `<title>`. It also renders a visually hidden table with the same
   values, so screen-reader users get the data (`barChart.test.ts`, "the accessible name and the
   fallback table are present").

<!-- from: examples/cookbook/src/custom-catalog/barChart.ts -->
```ts
  svg.setAttribute("viewBox", `0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-labelledby", titleId);
```

7. **Keyboard-focusable scroll regions need a role and a name.** A wide table scrolls sideways
   inside its own wrapper. Because the wrapper scrolls, it must be focusable, so a keyboard user can
   reach the hidden columns. It gets a `region` role, `tabindex="0"`, and a label:

<!-- from: examples/cookbook/src/custom-catalog/dataTableRenderer.ts -->
```ts
  // The wrapper scrolls sideways, so a wide table never widens the page.
  wrapper.style.maxWidth = "100%";
  wrapper.style.overflowX = "auto";
  // A scrollable region with no focusable content is a keyboard trap for hidden columns. Make it
  // a named, focusable region on purpose, so a keyboard user can scroll the table at any width.
  wrapper.setAttribute("role", "region");
  wrapper.setAttribute("tabindex", "0");
  wrapper.setAttribute(
    "aria-label",
    typeof properties.caption === "string" && properties.caption.length > 0 ? properties.caption : "Data table",
  );
```

8. **Dispatch only through the allowlist.** A renderer that makes a control (a Button, a
   `writeInput`) goes through `input.interactions`. The `DataTable` renders no controls, and its
   test asserts that it dispatches nothing.

### The stale-interaction guard

Every render of a surface belongs to a new generation. An interaction from a render that has since
been replaced is ignored. `WebSurfaceRenderer` checks this for `dispatchAction`, `writeInput`, and
`setLocalState`: the call returns `{ ok: false, error: { code: "STALE_RENDER_INTERACTION" } }` and
changes nothing ([`WebSurfaceRenderer.ts`](../packages/web/src/surface/WebSurfaceRenderer.ts)). Your
renderer does not implement this check, but it must not hold on to an old `input.interactions` and
expect it to work after an update. The ticket board's test "old-scope buttons are inert after an
update" covers this in practice
([`ticket-board.test.ts`](../examples/cookbook/src/ticket-board.test.ts)).

The host has a second check. The Refresh button sends the refresh count it was rendered with, and
the transition accepts it only if it equals the agent's current count:

<!-- from: examples/cookbook/src/screens/orders-report.ts -->
```ts
/** The Refresh context must echo the current refresh count, so a stale or forged click is rejected. */
function isCurrentRefreshCount(value: JsonValue | undefined, current: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value === current;
}
```

<!-- from: examples/cookbook/src/screens/orders-report.ts -->
```ts
      transition: (state, context) => {
        // Core always sends an object, but the transition still rejects a missing context instead of throwing.
        const echoed = (context as JsonObject | undefined)?.refreshes;
        if (!isCurrentRefreshCount(echoed, state.refreshes)) return undefined;
        return ordersSnapshot(state.refreshes + 1);
      },
```

A transition that returns `undefined` leaves the state unchanged, and the harness reports
`INVALID_EVENT_CONTEXT`. The orders-report test "unknown events, other surfaces, and invalid or stale
Refresh contexts are rejected before any change" covers the stale and forged counts.

## Step 4: register the renderer

Register each renderer exactly once, in one list. `RendererRegistry` throws
`RendererRegistryConfigurationError` on a duplicate `(catalogId, component)` pair, so the cookbook
keeps one list for all its trusted renderers. Its layout primitives reuse Basic's renderer functions
under the cookbook's id, which Basic does not do on its own:

<!-- from: examples/cookbook/src/custom-catalog/renderers.ts -->
```ts
export const cookbookCatalogRendererRegistrations: readonly RendererRegistration[] = [
  ...cookbookLayoutRenderers,
  dataTableRegistration,
  createBarChartRegistration(),
];
```

Pass the catalog and that list to `createBasicWebRuntime`. The harness does this only for screens
that have a custom catalog:

<!-- from: examples/cookbook/src/shared/harness.ts -->
```ts
    ...(definition.catalog === undefined
      ? {}
      : {
          additionalCatalogs: [definition.catalog.catalog],
          additionalRenderers: definition.catalog.renderers,
        }),
```

`createBasicWebRuntime` does not throw on a duplicate. It returns
`{ ok: false, error: { code: "RENDERER_CONFIGURATION_FAILED" } }`. The cookbook's
`renderers.test.ts` checks that a duplicate throws in `RendererRegistry`, and that the one list builds
without error.

The complete recipe, with published APIs only, is in the runnable example at the end of this guide.

## Step 5: the prompt generator

Once the catalog is in place, `generateA2UIV091Prompt()` lists its components with no extra code,
because the prompt is built from the same schema the runtime validates against. Its `### Name`
entries come from `catalog.components`, and each property's `description` is copied from the schema
([`prompt-generation.md`](prompt-generation.md#custom-catalogs)).

Running `generateA2UIV091Prompt({ catalogs: [cookbookCatalog] })` and listing its `### ` headings
gives the cookbook catalog's components:

```text
### BarChart
### Button
### Card
### Column
### DataTable
### Text
```

The `DataTable` entry shows the binding rule from step 2 as the model reads it:

```text
### DataTable
A read-only table of rows. ...
- `rows`: reference DataBinding or array of object; required; binding allowed. The rows to show, as a data binding such as {"path": "/orders"} (preferred) or a literal array of row objects. Each object supplies the values for the columns.
```

The prompt is guidance. Enforcement stays in the runtime: a component outside the catalog is
rejected at message validation even when the model ignores the prompt. A component listed by the
prompt but missing a renderer still fails at render time (step 6).

## Step 6: test the failure modes

Test the failure modes of your own catalog as well as the happy path. The cookbook's
[`crossCatalogSafety.test.ts`](../examples/cookbook/src/custom-catalog/crossCatalogSafety.test.ts)
covers three cases, and each one asserts on the result:

| Failure | What happens | Asserted in the test |
|---|---|---|
| (a) An unknown component on a cookbook surface, such as `Chart3D` | Rejected at validation with `COMPONENT_NOT_ALLOWED`. The last good DOM is unchanged, and the rejected text never appears. | `(a) an unknown component ...` |
| (b) A cookbook `DataTable` on a Basic surface | Rejected with `COMPONENT_NOT_ALLOWED`. Basic never falls back to the cookbook catalog. A control on a cookbook surface is accepted, so the rejection is the catalog boundary. | `(b) a custom DataTable on a Basic surface ...` |
| (c) A catalog component with no renderer | Validation passes, because the schema is valid. The render step fails with `RENDERER_NOT_FOUND`, `onError` is called once, the last good DOM is kept, and `describeWebRenderError` gives a hint. | `(c) a component declared by the catalog ...` |

A `DataTable` message that still sends `rowAction` is rejected at message validation
(`COMPONENT_VALIDATION_FAILED`). The `DataTable` schema has `additionalProperties: false` and no
`rowAction`. The cookbook test for it is `a DataTable message that still sends rowAction is rejected
at message validation` in `catalog.test.ts`.

Case (c) is the one to design for. On a mounted surface, the failed update reports through `onError`,
and the last good screen stays on the page. The description of the error is what a host shows or logs:

```json
{"code":"RENDERER_NOT_FOUND","severity":"error","summary":"No trusted renderer is registered for this component. Catalog \"https://weaver.dev/examples/cookbook/v1\", component \"DataTable\", at scope \"/\".","componentId":"table","scopePath":"/","causes":[],"hint":"Register a trusted renderer for this catalog/component."}
```

That output comes from the cookbook catalog with its `DataTable` renderer removed, through
`describeWebRenderError`. The description is in
[`debugging.md`](debugging.md#reading-errors). If the failure happens on the first mount, the
mount returns `{ ok: false, error }` with the same code and `onError` is not called.

The runnable example at the end of this guide runs cases (a) and (c) against the packed packages.

## Read-only tables and per-row actions

`DataTable` is **read-only**. It renders no controls, it has no row actions, and it rejects a
`rowAction` property. Per-row dispatch from a table is gated and tracked as
[WVR-056](../scratch/issues/WVR-056-row-scoped-action-dispatch.md). It is not available yet.

For per-row actions today, use a `List` template of `Card`s, where each row is a template instance
with its own scope. The ticket board does this: each card is one ticket, and its Start, Assign and
Close buttons act on that ticket
([`ticket-board.ts`](../examples/cookbook/src/screens/ticket-board.ts)). The
[positional template identity](../examples/cookbook/README.md#positional-template-identity-ticket-board)
section of the cookbook README explains what a List template guarantees and what it does not.

## When to add a component

Add a component to a catalog only when a shipping app needs it, and only after you have measured
what it adds. A component that no app needs is maintenance and bundle weight with no user.

Measure before you add it:

- **Bundle.** Build the screen before and after with `pnpm --filter @weaver/cookbook build`, and
  compare the screen's chunk in the Vite output, both minified and gzipped.
- **Dependencies.** Read the package's `dependencies` before and after. A renderer should use DOM
  APIs only, the way `BarChart` does. `barChart.ts` imports only types and constants from the
  catalog module, and it adds no runtime package.

For a reference point, the cookbook's measured build output (this repository, this build) is:

| Chunk | Minified | Gzip |
|---|---|---|
| `orders-report` (the screen, its catalog, and the two custom renderers) | 12.45 kB | 4.59 kB |
| `harness` (the shared harness, Core, and the Basic renderers) | 180.04 kB | 44.27 kB |

These chunk sizes include the screen and the catalog, so they are not the marginal cost of one
component. Record the measurement in the issue that adds the component.

## Run the example

The block below is the whole recipe in one file: a small catalog with one custom `Badge`, Basic's
`Column` and `Text`, one registration list, and the two failure modes. It uses published APIs only,
so the packed-package check compiles and runs it.

```ts
import assert from "node:assert/strict";
import {
  createA2UIV091Producer,
  createBasicCatalogV091Registration,
  defineCatalog,
  type JsonObject,
} from "@cylayo/weaver-core";
import {
  createBasicCatalogRendererRegistrations,
  createBasicWebRuntime,
  describeWebRenderError,
  type RendererRegistration,
  type WebComponentRenderer,
  type WebRenderError,
} from "@cylayo/weaver-web";
import { Window } from "happy-dom";

// Step 1: a catalog with its own id.
const NOTES_CATALOG_ID = "https://example.com/catalogs/notes/v1";
const basic = createBasicCatalogV091Registration().schema;
const basicComponents = basic.components as Record<string, JsonObject>;
const basicFunctions = basic.functions as Record<string, JsonObject> | undefined;
// Basic's shared definitions, without anyComponent (step 2).
const sharedDefs = Object.fromEntries(
  Object.entries(basic.$defs as JsonObject).filter(([name]) => name !== "anyComponent"),
) as JsonObject & { theme: JsonObject };

const badgeSchema: JsonObject = {
  type: "object",
  description: "A short status label, such as Open or Closed.",
  properties: {
    id: { type: "string", description: "The unique component id within the surface." },
    component: { const: "Badge", description: "Must be the literal string Badge." },
    label: { $ref: "common_types.json#/$defs/DynamicString", description: "The text shown in the badge." },
  },
  required: ["id", "component", "label"],
  additionalProperties: false,
};

export const notesCatalog = defineCatalog({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: NOTES_CATALOG_ID,
  catalogId: NOTES_CATALOG_ID,
  title: "Notes catalog",
  description: "Column, Text, and Badge.",
  components: {
    Column: basicComponents.Column,
    Text: basicComponents.Text,
    Badge: badgeSchema,
  },
  functions: basicFunctions ?? {},
  $defs: sharedDefs,
});

// Step 3: a trusted renderer. It sets text with textContent and never parses markup.
const renderBadge: WebComponentRenderer = ({ document, properties }) => {
  const badge = document.createElement("span");
  badge.setAttribute("data-notes-component", "Badge");
  badge.textContent = typeof properties.label === "string" ? properties.label : "";
  return badge;
};

// Step 4: one registration list. Basic's Text and Column are reused under the notes id.
export const notesRenderers: readonly RendererRegistration[] = [
  ...createBasicCatalogRendererRegistrations({ catalogId: NOTES_CATALOG_ID }).filter(
    (registration) => registration.component === "Text" || registration.component === "Column",
  ),
  { catalogId: NOTES_CATALOG_ID, component: "Badge", render: renderBadge },
];

function createNotesWeb(renderers: readonly RendererRegistration[]) {
  const created = createBasicWebRuntime({
    additionalCatalogs: [notesCatalog],
    additionalRenderers: renderers,
  });
  if (!created.ok) throw new Error(created.error.code);
  return created.value;
}

const producer = createA2UIV091Producer();
const SURFACE_ID = "notes";

// Render a good screen.
const web = createNotesWeb(notesRenderers);
assert.equal(web.runtime.process(producer.createSurface({ surfaceId: SURFACE_ID, catalogId: NOTES_CATALOG_ID })).ok, true);
assert.equal(
  web.runtime.process(
    producer.updateComponents({
      surfaceId: SURFACE_ID,
      components: [
        { id: "root", component: "Column", children: ["status"] },
        { id: "status", component: "Badge", label: "Open" },
      ],
    }),
  ).ok,
  true,
);
const target = new Window().document.createElement("main") as unknown as Element;
assert.equal(web.mount({ surfaceId: SURFACE_ID, target }).ok, true);
assert.equal(target.textContent?.includes("Open"), true);

// Step 2 and step 6(a): a component the catalog does not declare is rejected, and the page keeps its DOM.
const rejected = web.runtime.process(
  producer.updateComponents({
    surfaceId: SURFACE_ID,
    components: [
      { id: "root", component: "Column", children: ["field"] },
      { id: "field", component: "TextField", label: "Name", value: { path: "/name" } },
    ],
  }),
);
assert.equal(rejected.ok, false);
assert.equal(target.textContent?.includes("Open"), true);

// Step 6(c): a declared component with no renderer keeps the last good DOM and reports RENDERER_NOT_FOUND.
const withoutBadge = createNotesWeb(notesRenderers.filter((registration) => registration.component !== "Badge"));
const errors: WebRenderError[] = [];
const target2 = new Window().document.createElement("main") as unknown as Element;
assert.equal(withoutBadge.runtime.process(producer.createSurface({ surfaceId: SURFACE_ID, catalogId: NOTES_CATALOG_ID })).ok, true);
assert.equal(
  withoutBadge.runtime.process(
    producer.updateComponents({
      surfaceId: SURFACE_ID,
      components: [
        { id: "root", component: "Column", children: ["title"] },
        { id: "title", component: "Text", text: "Last good screen" },
      ],
    }),
  ).ok,
  true,
);
assert.equal(withoutBadge.mount({ surfaceId: SURFACE_ID, target: target2, onError: (error) => errors.push(error) }).ok, true);
assert.equal(
  withoutBadge.runtime.process(
    producer.updateComponents({
      surfaceId: SURFACE_ID,
      components: [
        { id: "root", component: "Column", children: ["title", "status"] },
        { id: "title", component: "Text", text: "Broken update" },
        { id: "status", component: "Badge", label: "Open" },
      ],
    }),
  ).ok,
  true,
);
assert.equal(target2.textContent?.includes("Last good screen"), true);
assert.equal(target2.textContent?.includes("Broken update"), false);
assert.equal(errors.length, 1);
const description = describeWebRenderError(errors[0]!);
assert.equal(description.code, "RENDERER_NOT_FOUND");
console.log(description.summary);
console.log(description.hint);
```

Run the failure modes in the cookbook's own test as well, against the real catalog:
`pnpm --filter @weaver/cookbook test`.

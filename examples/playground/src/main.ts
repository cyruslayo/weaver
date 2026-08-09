import { createWeaverRuntime, WEAVER_CORE_VERSION, type JsonObject } from "@weaver/core";
import { createBasicCatalogRendererRegistrations, RendererRegistry, WebSurfaceRenderer } from "@weaver/web";

const catalogId = "playground-basic";
const ref = (name: string): JsonObject => ({ $ref: `common_types.json#/$defs/${name}` });
const component = (name: string, properties: JsonObject, required: string[], allOf: JsonObject[] = []): JsonObject => ({
  type: "object", ...(allOf.length > 0 ? { allOf } : {}),
  properties: { id: { type: "string" }, component: { const: name }, ...properties },
  required: ["id", "component", ...required], additionalProperties: false,
});
const schema: JsonObject = {
  $schema: "https://json-schema.org/draft/2020-12/schema", catalogId,
  components: {
    Text: component("Text", { text: ref("DynamicString"), variant: { enum: ["h1", "h2", "h3", "h4", "h5", "caption", "body"] } }, ["text"]),
    Column: component("Column", { children: ref("ChildList"), justify: { enum: ["start", "center", "end", "spaceBetween", "spaceAround", "spaceEvenly", "stretch"] }, align: { enum: ["start", "center", "end", "stretch"] } }, ["children"]),
    Card: component("Card", { child: ref("ComponentId") }, ["child"]),
    Button: component("Button", { child: ref("ComponentId"), variant: { enum: ["default", "primary", "borderless"] }, action: ref("Action"), checks: { type: "array" } }, ["child", "action"], [ref("Checkable")]),
  },
  functions: {},
  $defs: { theme: { type: "object" }, commonTypes: { $id: "common_types.json", $defs: {
    ComponentId: { type: "string" }, ChildList: { type: "array", items: ref("ComponentId") },
    PathBinding: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
    FunctionCall: { type: "object" }, DynamicString: { oneOf: [{ type: "string" }, ref("PathBinding"), ref("FunctionCall")] },
    DynamicNumber: {}, DynamicBoolean: {}, DynamicStringList: {}, Checkable: {},
    Action: { type: "object", properties: { event: { type: "object" } }, required: ["event"], additionalProperties: false },
  } } },
};

const created = createWeaverRuntime({ catalogs: [{ catalogId, schema }] });
if (!created.ok) throw new Error("Playground runtime configuration failed");
const app = document.querySelector<HTMLElement>("#app");
if (app === null) throw new Error("Playground root element was not found");
app.dataset.coreVersion = WEAVER_CORE_VERSION;
const debug = document.createElement("pre");
debug.textContent = "Outbound events appear here.";

const renderers = new RendererRegistry(createBasicCatalogRendererRegistrations({ catalogId }));
created.value.process({ version: "v0.9.1", createSurface: { surfaceId: "main", catalogId } });
created.value.process({ version: "v0.9.1", updateComponents: { surfaceId: "main", components: [
  { id: "root", component: "Column", children: ["title", "card", "button"] },
  { id: "title", component: "Text", variant: "h1", text: "Weaver Playground" },
  { id: "card", component: "Card", child: "card-text" },
  { id: "card-text", component: "Text", text: "Trusted Basic Catalog renderers produce this DOM." },
  { id: "button", component: "Button", variant: "primary", child: "button-text", action: { event: { name: "playground.submit", context: {} } } },
  { id: "button-text", component: "Text", text: "Create server event" },
] } });
const mounted = new WebSurfaceRenderer({ runtime: created.value, renderers, onServerEvent: (event) => { debug.textContent = JSON.stringify(event, null, 2); } }).mount({ surfaceId: "main", target: app });
if (!mounted.ok) throw new Error(`Playground mount failed: ${mounted.error.code}`);
app.append(debug);

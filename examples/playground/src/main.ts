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
    Tabs: component("Tabs", { tabs: { type: "array", items: { type: "object", properties: { title: ref("DynamicString"), child: ref("ComponentId") }, required: ["title", "child"], additionalProperties: false } } }, ["tabs"]),
    Modal: component("Modal", { trigger: ref("ComponentId"), content: ref("ComponentId") }, ["trigger", "content"]),
    Button: component("Button", { child: ref("ComponentId"), variant: { enum: ["default", "primary", "borderless"] }, action: ref("Action"), checks: { type: "array" } }, ["child", "action"], [ref("Checkable")]),
    TextField: component("TextField", { label: ref("DynamicString"), value: ref("DynamicString"), variant: { enum: ["shortText", "longText", "number", "obscured"] }, checks: { type: "array" } }, ["label"], [ref("Checkable")]),
    CheckBox: component("CheckBox", { label: ref("DynamicString"), value: ref("DynamicBoolean"), checks: { type: "array" } }, ["label", "value"], [ref("Checkable")]),
    Slider: component("Slider", { label: ref("DynamicString"), min: { type: "number" }, max: { type: "number" }, value: ref("DynamicNumber"), checks: { type: "array" } }, ["max", "value"], [ref("Checkable")]),
    ChoicePicker: component("ChoicePicker", { label: ref("DynamicString"), value: ref("DynamicStringList"), options: { type: "array", items: { type: "object", properties: { label: ref("DynamicString"), value: { type: "string" } }, required: ["label", "value"], additionalProperties: false } }, variant: { enum: ["mutuallyExclusive", "multipleSelection"] }, displayStyle: { enum: ["checkbox", "chips"] }, filterable: { type: "boolean" }, checks: { type: "array" } }, ["options", "value"], [ref("Checkable")]),
  },
  functions: {},
  $defs: { theme: { type: "object" }, commonTypes: { $id: "common_types.json", $defs: {
    ComponentId: { type: "string" }, ChildList: { type: "array", items: ref("ComponentId") },
    PathBinding: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
    FunctionCall: { type: "object" }, DynamicString: { oneOf: [{ type: "string" }, ref("PathBinding"), ref("FunctionCall")] },
    DynamicNumber: { oneOf: [{ type: "number" }, ref("PathBinding"), ref("FunctionCall")] }, DynamicBoolean: { oneOf: [{ type: "boolean" }, ref("PathBinding"), ref("FunctionCall")] }, DynamicStringList: { oneOf: [{ type: "array", items: { type: "string" } }, ref("PathBinding"), ref("FunctionCall")] }, Checkable: {},
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
created.value.process({ version: "v0.9.1", createSurface: { surfaceId: "main", catalogId, sendDataModel: true } });
created.value.process({ version: "v0.9.1", updateComponents: { surfaceId: "main", components: [
  { id: "root", component: "Tabs", tabs: [{ title: "Overview", child: "overview" }, { title: "Form", child: "form" }, { title: "Event", child: "event" }, { title: "Modal", child: "modal" }] },
  { id: "overview", component: "Column", children: ["title", "greeting"] },
  { id: "title", component: "Text", variant: "h1", text: "Weaver Basic Tabs playground" },
  { id: "greeting", component: "Text", text: { path: "/form/name" } },
  { id: "form", component: "Column", children: ["name", "ready", "volume", "choice"] },
  { id: "name", component: "TextField", label: "Name", value: { path: "/form/name" } },
  { id: "ready", component: "CheckBox", label: "Ready", value: { path: "/form/ready" } },
  { id: "volume", component: "Slider", label: "Volume", min: 0, max: 10, value: { path: "/form/volume" } },
  { id: "choice", component: "ChoicePicker", label: "Mode", value: { path: "/form/mode" }, options: [{ label: "Fast", value: "fast" }, { label: "Careful", value: "careful" }] },
  { id: "event", component: "Column", children: ["button"] },
  { id: "button", component: "Button", variant: "primary", child: "button-text", action: { event: { name: "playground.submit", context: { name: { path: "/form/name" } } } } },
  { id: "button-text", component: "Text", text: "Create server event" },
  { id: "modal", component: "Modal", trigger: "modal-trigger", content: "modal-card" },
  { id: "modal-trigger", component: "Button", child: "modal-trigger-text", action: { event: { name: "must.not.fire", context: {} } } },
  { id: "modal-trigger-text", component: "Text", text: "Open local Modal" },
  { id: "modal-card", component: "Card", child: "modal-content" },
  { id: "modal-content", component: "Column", children: ["modal-title", "modal-name", "modal-action"] },
  { id: "modal-title", component: "Text", variant: "h2", text: "Mount-local Modal" },
  { id: "modal-name", component: "TextField", label: "Name", value: { path: "/form/name" } },
  { id: "modal-action", component: "Button", child: "modal-action-text", action: { event: { name: "playground.modal", context: { name: { path: "/form/name" } } } } },
  { id: "modal-action-text", component: "Text", text: "Run content action" },
] } });
created.value.process({ version: "v0.9.1", updateDataModel: { surfaceId: "main", value: { form: { name: "Ada", ready: false, volume: 5, mode: ["careful"] } } } });
const mounted = new WebSurfaceRenderer({ runtime: created.value, renderers, onServerEvent: (event) => { debug.textContent = JSON.stringify(event, null, 2); } }).mount({ surfaceId: "main", target: app });
if (!mounted.ok) throw new Error(`Playground mount failed: ${mounted.error.code}`);
app.append(debug);

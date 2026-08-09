import { createWeaverRuntime, WEAVER_CORE_VERSION, type JsonObject } from "@weaver/core";
import { RendererRegistry, WebSurfaceRenderer } from "@weaver/web";

const ref = (name: string): JsonObject => ({ $ref: `common_types.json#/$defs/${name}` });
const schema: JsonObject = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  catalogId: "playground",
  components: {
    PlaygroundGroup: { type: "object", properties: { id: { type: "string" }, component: { const: "PlaygroundGroup" }, children: ref("ChildList") }, required: ["id", "component", "children"], additionalProperties: false },
    PlaygroundInput: { type: "object", properties: { id: { type: "string" }, component: { const: "PlaygroundInput" }, value: ref("DynamicString") }, required: ["id", "component", "value"], additionalProperties: false },
    PlaygroundText: { type: "object", properties: { id: { type: "string" }, component: { const: "PlaygroundText" }, text: ref("DynamicString") }, required: ["id", "component", "text"], additionalProperties: false },
    PlaygroundButton: { type: "object", properties: { id: { type: "string" }, component: { const: "PlaygroundButton" }, action: ref("Action") }, required: ["id", "component", "action"], additionalProperties: false },
  },
  functions: {},
  $defs: { theme: { type: "object" }, commonTypes: { $id: "common_types.json", $defs: {
    ComponentId: { type: "string" },
    ChildList: { type: "array", items: ref("ComponentId") },
    PathBinding: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
    FunctionCall: { type: "object" },
    DynamicString: { oneOf: [{ type: "string" }, ref("PathBinding"), ref("FunctionCall")] },
    DynamicNumber: {}, DynamicBoolean: {}, DynamicStringList: {}, Checkable: {},
    Action: { type: "object", properties: { event: { type: "object" } }, required: ["event"], additionalProperties: false },
  } } },
};

const created = createWeaverRuntime({ catalogs: [{ catalogId: "playground", schema }] });
if (!created.ok) throw new Error("Playground runtime configuration failed");
const app = document.querySelector<HTMLElement>("#app");
if (app === null) throw new Error("Playground root element was not found");
const heading = document.createElement("h1"); heading.textContent = "Weaver Playground"; app.append(heading); app.dataset.coreVersion = WEAVER_CORE_VERSION;
const debug = document.createElement("pre"); debug.textContent = "Outbound events appear here.";

const renderers = new RendererRegistry([
  { catalogId: "playground", component: "PlaygroundGroup", render: ({ document, relationships }) => { const node = document.createElement("div"); const relationship = relationships[0]; if (relationship?.kind !== "single") node.append(...(relationship?.children ?? [])); return node; } },
  { catalogId: "playground", component: "PlaygroundInput", render: ({ document, properties, interactions }) => { const input = document.createElement("input"); input.value = String(properties.value ?? ""); input.addEventListener("input", () => { interactions.writeInput("value", input.value); }); return input; } },
  { catalogId: "playground", component: "PlaygroundText", render: ({ document, properties }) => { const output = document.createElement("p"); output.textContent = String(properties.text ?? ""); return output; } },
  { catalogId: "playground", component: "PlaygroundButton", render: ({ document, interactions }) => { const button = document.createElement("button"); button.textContent = "Create server event"; button.addEventListener("click", () => { interactions.dispatchAction("action"); }); return button; } },
]);
created.value.process({ version: "v0.9.1", createSurface: { surfaceId: "main", catalogId: "playground" } });
created.value.process({ version: "v0.9.1", updateComponents: { surfaceId: "main", components: [
  { id: "root", component: "PlaygroundGroup", children: ["input", "display", "button"] },
  { id: "input", component: "PlaygroundInput", value: { path: "/name" } },
  { id: "display", component: "PlaygroundText", text: { path: "/name" } },
  { id: "button", component: "PlaygroundButton", action: { event: { name: "submit", context: { name: { path: "/name" } } } } },
] } });
created.value.process({ version: "v0.9.1", updateDataModel: { surfaceId: "main", value: { name: "Ada" } } });
const mounted = new WebSurfaceRenderer({ runtime: created.value, renderers, onServerEvent: (event) => { debug.textContent = JSON.stringify(event, null, 2); } }).mount({ surfaceId: "main", target: app });
if (!mounted.ok) throw new Error(`Playground mount failed: ${mounted.error.code}`);
app.append(debug);

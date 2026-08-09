import { createWeaverRuntime, WEAVER_CORE_VERSION, type JsonObject } from "@weaver/core";
import { RendererRegistry, WebSurfaceRenderer } from "@weaver/web";

const schema: JsonObject = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  catalogId: "playground",
  components: {
    PlaygroundText: {
      type: "object",
      properties: { id: { type: "string" }, component: { const: "PlaygroundText" }, text: { type: "string" } },
      required: ["id", "component", "text"],
      additionalProperties: false,
    },
  },
  functions: {},
  $defs: { theme: { type: "object" }, commonTypes: { $id: "common_types.json", $defs: {
    ComponentId: { type: "string" }, ChildList: {}, PathBinding: {}, FunctionCall: {},
    DynamicString: {}, DynamicNumber: {}, DynamicBoolean: {}, DynamicStringList: {}, Checkable: {},
  } } },
};

const created = createWeaverRuntime({ catalogs: [{ catalogId: "playground", schema }] });
if (!created.ok) throw new Error("Playground runtime configuration failed");

const app = document.querySelector<HTMLElement>("#app");
if (app === null) throw new Error("Playground root element was not found");

const heading = document.createElement("h1");
heading.textContent = "Weaver Playground";
app.append(heading);
app.dataset.coreVersion = WEAVER_CORE_VERSION;

const renderers = new RendererRegistry([{
  catalogId: "playground",
  component: "PlaygroundText",
  render: ({ document, properties }) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = String(properties.text ?? "");
    return paragraph;
  },
}]);
created.value.process({ version: "v0.9.1", createSurface: { surfaceId: "main", catalogId: "playground" } });
created.value.process({ version: "v0.9.1", updateComponents: { surfaceId: "main", components: [
  { id: "root", component: "PlaygroundText", text: "Trusted DOM rendering is active." },
] } });
const mounted = new WebSurfaceRenderer({ runtime: created.value, renderers }).mount({ surfaceId: "main", target: app });
if (!mounted.ok) throw new Error(`Playground mount failed: ${mounted.error.code}`);

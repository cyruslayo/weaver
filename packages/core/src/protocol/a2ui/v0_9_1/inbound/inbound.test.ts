import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";
import { createWeaverRuntime } from "../../../../runtime/index.js";
import type { JsonObject } from "../types.js";

const fixture = (name: string): JsonObject => JSON.parse(readFileSync(
  new URL(`../../../../../src/protocol/a2ui/v0_9_1/inbound/fixtures/${name}.json`, import.meta.url), "utf8",
)) as JsonObject;
const common = fixture("common_types");
const catalog = fixture("catalog");
const server = fixture("server_to_client");
const mappedCatalog = structuredClone(catalog);
mappedCatalog.$id = "https://a2ui.org/specification/v0_9/catalog.json";
const ajv = new Ajv2020({ strict: false, validateFormats: false });
ajv.addSchema(common);
ajv.addSchema(mappedCatalog);
const validateOfficial = ajv.compile(server);

function weaverCatalog(): JsonObject {
  const ref = (name: string): JsonObject => ({ $ref: `common_types.json#/$defs/${name}` });
  const component = (name: string, properties: JsonObject): JsonObject => ({ type: "object", properties: { id: { type: "string" }, component: { const: name }, ...properties }, required: ["id", "component"], additionalProperties: false });
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema", catalogId: String(catalog.catalogId),
    components: {
      Text: component("Text", { text: ref("DynamicString") }), Row: component("Row", { children: ref("ChildList") }),
      TextField: component("TextField", { label: ref("DynamicString"), value: ref("DynamicString") }),
      Button: component("Button", { child: ref("ComponentId"), action: ref("Action") }),
    }, functions: {}, $defs: { theme: { type: "object" }, commonTypes: { $id: "common_types.json", $defs: {
      ComponentId: { type: "string" }, ChildList: { type: "array", items: ref("ComponentId") }, DataBinding: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
      DynamicString: { oneOf: [{ type: "string" }, ref("DataBinding")] }, Action: { type: "object" },
    } } },
  };
}
function runtime() {
  const made = createWeaverRuntime({ catalogs: [{ catalogId: String(catalog.catalogId), schema: weaverCatalog() }] });
  assert.ok(made.ok, made.ok ? undefined : JSON.stringify(made.error));
  return made.value;
}
const create = { version: "v0.9.1", createSurface: { surfaceId: "gate", catalogId: String(catalog.catalogId), theme: { primaryColor: "#123456" }, sendDataModel: true } };
const updateComponents = { version: "v0.9.1", updateComponents: { surfaceId: "gate", components: [
  { id: "root", component: "Row", children: ["title", "field", "submit"] },
  { id: "title", component: "Text", text: "Conformance" },
  { id: "field", component: "TextField", label: "Name", value: { path: "/name" } },
  { id: "button-label", component: "Text", text: "Submit" },
  { id: "submit", component: "Button", child: "button-label", action: { event: { name: "submit", context: { name: { path: "/name" } } } } },
] } };

test("official createSurface and representative Basic updateComponents pass both gates", () => {
  const rt = runtime();
  for (const message of [create, updateComponents]) {
    assert.equal(validateOfficial(message), true, JSON.stringify(validateOfficial.errors));
    assert.ok(rt.process(message).ok);
  }
  const resolved = rt.resolveSurface("gate"); assert.ok(resolved.ok); assert.equal(resolved.value.tree.ready, true);
});

test("official root, path, and null data updates pass both gates", () => {
  const rt = runtime(); assert.ok(rt.process(create).ok);
  const updates = [
    { version: "v0.9.1", updateDataModel: { surfaceId: "gate", value: { name: "Ada", nullable: "before" } } },
    { version: "v0.9.1", updateDataModel: { surfaceId: "gate", path: "/nullable", value: null } },
    { version: "v0.9.1", updateDataModel: { surfaceId: "gate", path: "/nested/value", value: 4 } },
  ];
  for (const message of updates) { assert.equal(validateOfficial(message), true, JSON.stringify(validateOfficial.errors)); assert.ok(rt.process(message).ok); }
  assert.deepEqual(rt.getSurface("gate")?.dataModel, { name: "Ada", nullable: null, nested: { value: 4 } });
});

test("official deleteSurface and v0.9 compatibility pass both gates", () => {
  const rt = runtime(); const compatible = { ...create, version: "v0.9" };
  assert.equal(validateOfficial(compatible), true, JSON.stringify(validateOfficial.errors)); assert.ok(rt.process(compatible).ok);
  const remove = { version: "v0.9", deleteSurface: { surfaceId: "gate" } };
  assert.equal(validateOfficial(remove), true, JSON.stringify(validateOfficial.errors)); assert.ok(rt.process(remove).ok);
});

test("official and Weaver validators both reject multiple discriminators", () => {
  const invalid = { version: "v0.9.1", createSurface: create.createSurface, deleteSurface: { surfaceId: "gate" } };
  assert.equal(validateOfficial(invalid), false); assert.equal(runtime().process(invalid).ok, false);
});

test("official catalog-aware and Weaver catalog validation reject an invalid Basic property", () => {
  const invalid = { version: "v0.9.1", updateComponents: { surfaceId: "gate", components: [{ id: "root", component: "Text", text: 42 }] } };
  assert.equal(validateOfficial(invalid), false);
  const rt = runtime(); assert.ok(rt.process(create).ok); assert.equal(rt.process(invalid).ok, false);
});

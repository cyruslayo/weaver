import assert from "node:assert/strict";
import { test } from "node:test";
import { createWeaverRuntime, type JsonObject, type WeaverRuntime } from "@weaver/core";
import { Window } from "happy-dom";
import { RendererRegistry, type RendererRegistration } from "../renderers/index.js";
import { WebSurfaceRenderer } from "./WebSurfaceRenderer.js";

const ref = (name: string): JsonObject => ({ $ref: `common_types.json#/$defs/${name}` });
const dynamic = (literal: JsonObject): JsonObject => ({ oneOf: [literal, ref("PathBinding"), ref("FunctionCall")] });
const component = (name: string, properties: JsonObject = {}, allOf: JsonObject[] = []): JsonObject => ({
  type: "object", ...(allOf.length ? { allOf } : {}),
  properties: { id: { type: "string" }, component: { const: name }, ...properties },
  required: ["id", "component"], additionalProperties: false,
});
function catalog(catalogId: string): JsonObject {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema", catalogId,
    components: {
      Text: component("Text", { text: ref("DynamicString") }),
      Stack: component("Stack", { sections: ref("ChildList") }),
      CheckText: component("CheckText", { text: ref("DynamicString"), checks: { type: "array" } }, [ref("Checkable")]),
      Missing: component("Missing"), Throwing: component("Throwing"), Invalid: component("Invalid"),
    },
    functions: {},
    $defs: { theme: { type: "object" }, commonTypes: { $id: "common_types.json", $defs: {
      ComponentId: { type: "string" },
      ChildList: { oneOf: [
        { type: "array", items: ref("ComponentId") },
        { type: "object", properties: { path: { type: "string" }, componentId: ref("ComponentId") }, required: ["path", "componentId"], additionalProperties: false },
      ] },
      PathBinding: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
      FunctionCall: { type: "object", properties: { call: { type: "string" }, args: { type: "object" } }, required: ["call", "args"], additionalProperties: false },
      DynamicString: dynamic({ type: "string" }), DynamicNumber: dynamic({ type: "number" }),
      DynamicBoolean: dynamic({ type: "boolean" }), DynamicStringList: dynamic({ type: "array", items: { type: "string" } }),
      Checkable: {},
    } } },
  };
}
const create = (catalogId = "test") => ({ version: "v0.9.1", createSurface: { surfaceId: "s", catalogId } });
const components = (values: JsonObject[]) => ({ version: "v0.9.1", updateComponents: { surfaceId: "s", components: values } });
const data = (value: unknown) => ({ version: "v0.9.1", updateDataModel: { surfaceId: "s", value } });
function runtime(catalogIds = ["test"]): WeaverRuntime {
  const made = createWeaverRuntime({ catalogs: catalogIds.map((catalogId) => ({ catalogId, schema: catalog(catalogId) })) });
  assert.ok(made.ok);
  return made.value;
}
function dom() {
  const window = new Window();
  return { document: window.document as unknown as Document, target: window.document.createElement("main") as unknown as Element };
}
function registrations(tag = "span"): RendererRegistration[] {
  return [
    { catalogId: "test", component: "Text", render: ({ document, properties }) => {
      const node = document.createElement(tag); node.textContent = String(properties.text ?? ""); return node;
    } },
    { catalogId: "test", component: "Stack", render: ({ document, relationships }) => {
      assert.equal(relationships[0]?.property, "sections");
      const node = document.createElement("div");
      const relation = relationships[0];
      if (relation?.kind !== "single") node.append(...(relation?.children ?? []));
      return node;
    } },
    { catalogId: "test", component: "CheckText", render: ({ document, properties, checks }) => {
      const node = document.createElement("output"); node.textContent = `${properties.text}:${checks?.status}`; return node;
    } },
  ];
}
function mount(rt: WeaverRuntime, regs = registrations()) {
  const { target } = dom();
  const web = new WebSurfaceRenderer({ runtime: rt, renderers: new RendererRegistry(regs) });
  const result = web.mount({ surfaceId: "s", target });
  return { target, result };
}

test("mount renders hydrated nested values immediately and preserves host siblings", () => {
  const rt = runtime(); rt.process(create());
  rt.process(components([{ id: "root", component: "Stack", sections: ["name"] }, { id: "name", component: "Text", text: { path: "/name" } }]));
  rt.process(data({ name: "Ada" }));
  const { target, result } = mount(rt); assert.ok(result.ok);
  assert.equal(target.textContent, "Ada");
  assert.equal(target.firstElementChild?.hasAttribute("data-weaver-mount"), true);
});

test("progressive root stays mounted, reacts, refreshes, and unmount removes only its container", () => {
  const rt = runtime(); rt.process(create());
  const { document, target } = dom(); const host = document.createElement("aside"); target.append(host);
  const web = new WebSurfaceRenderer({ runtime: rt, renderers: new RendererRegistry(registrations()) });
  const mounted = web.mount({ surfaceId: "s", target }); assert.ok(mounted.ok);
  const initial = mounted.value.getLastResult();
  assert.equal(initial.ok && initial.value.ready, false);
  rt.process(components([{ id: "root", component: "Text", text: "later" }]));
  assert.equal(target.textContent, "later");
  assert.equal(mounted.value.refresh().ok, true);
  mounted.value.unmount();
  assert.equal(target.firstChild, host);
});

test("subscriptions rebuild properties, component definitions, and dynamic templates", () => {
  const rt = runtime(); rt.process(create());
  rt.process(components([{ id: "root", component: "Text", text: { path: "/name" } }])); rt.process(data({ name: "Ada" }));
  const { target, result } = mount(rt); assert.ok(result.ok); assert.equal(target.textContent, "Ada");
  rt.process(data({ name: "Grace" })); assert.equal(target.textContent, "Grace");
  rt.process(components([{ id: "root", component: "Text", text: "replacement" }])); assert.equal(target.textContent, "replacement");
  rt.process(components([{ id: "root", component: "Stack", sections: { path: "/items", componentId: "item" } }, { id: "item", component: "Text", text: { path: "name" } }]));
  rt.process(data({ items: [{ name: "A" }, { name: "B" }] })); assert.equal(target.querySelectorAll("span").length, 2);
  rt.process(data({ items: [{ name: "A" }, { name: "B" }, { name: "C" }] })); assert.equal(target.querySelectorAll("span").length, 3);
});

test("renderer identity is catalog plus component with no cross-catalog fallback", () => {
  const rt = runtime(["catalog-a", "catalog-b"]); rt.process(create("catalog-b")); rt.process(components([{ id: "root", component: "Text", text: "B" }]));
  const regs: RendererRegistration[] = [
    { catalogId: "catalog-a", component: "Text", render: ({ document }) => document.createElement("i") },
    { catalogId: "catalog-b", component: "Text", render: ({ document, properties }) => { const n = document.createElement("b"); n.textContent = String(properties.text); return n; } },
  ];
  const { target, result } = mount(rt, regs); assert.ok(result.ok); assert.equal(target.querySelector("b")?.textContent, "B"); assert.equal(target.querySelector("i"), null);
});

test("missing, throwing, and invalid renderers fail safely without exposing exceptions", () => {
  for (const [componentName, expected, extra] of [
    ["Missing", "RENDERER_NOT_FOUND", []],
    ["Throwing", "RENDERER_EXECUTION_FAILED", [{ catalogId: "test", component: "Throwing", render: () => { throw new Error("secret"); } }]],
    ["Invalid", "INVALID_RENDERER_RESULT", [{ catalogId: "test", component: "Invalid", render: (() => "bad") as unknown as RendererRegistration["render"] }]],
  ] as const) {
    const rt = runtime(); rt.process(create()); rt.process(components([{ id: "root", component: componentName }]));
    const { result } = mount(rt, [...registrations(), ...extra]); assert.equal(!result.ok && result.error.code, expected);
    if (!result.ok) assert.equal("stack" in result.error, false);
  }
});

test("rerender failure is atomic, reports errors, and later valid state recovers", () => {
  const rt = runtime(); rt.process(create()); rt.process(components([{ id: "root", component: "Text", text: "old" }]));
  const { document, target } = dom(); const errors: string[] = [];
  const web = new WebSurfaceRenderer({ runtime: rt, renderers: new RendererRegistry(registrations()) });
  const mounted = web.mount({ surfaceId: "s", target, onError: (error) => errors.push(error.code) }); assert.ok(mounted.ok);
  const oldNode = target.querySelector("span");
  rt.process(components([{ id: "root", component: "Missing" }]));
  assert.equal(target.textContent, "old"); assert.equal(target.querySelector("span"), oldNode); assert.deepEqual(errors, ["RENDERER_NOT_FOUND"]);
  rt.process(components([{ id: "root", component: "Text", text: "recovered" }]));
  assert.equal(target.textContent, "recovered"); assert.notEqual(target.querySelector("span"), oldNode);
  void document;
});

test("checks are matched by full template instance identity and mounts are independent", () => {
  const rt = runtime(); rt.process(create());
  rt.process(components([{ id: "root", component: "Stack", sections: { path: "/items", componentId: "item" } }, { id: "item", component: "CheckText", text: { path: "name" }, checks: [{ condition: { path: "valid" }, message: "required" }] }]));
  rt.process(data({ items: [{ name: "A", valid: true }, { name: "B", valid: false }] }));
  const one = mount(rt); const two = mount(rt); assert.ok(one.result.ok && two.result.ok);
  assert.equal(one.target.textContent, "A:validB:invalid"); assert.equal(two.target.textContent, "A:validB:invalid");
  one.result.value.unmount(); rt.process(data({ items: [{ name: "C", valid: true }] }));
  assert.equal(one.target.textContent, ""); assert.equal(two.target.textContent, "C:valid");
});

test("missing initial surface is a typed mount error", () => {
  const { result } = mount(runtime());
  assert.equal(!result.ok && result.error.code, "SURFACE_RESOLUTION_FAILED");
  assert.equal(!result.ok && result.error.code === "SURFACE_RESOLUTION_FAILED" && result.error.cause.code, "SURFACE_NOT_FOUND");
});

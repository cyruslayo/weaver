import assert from "node:assert/strict";
import { test } from "node:test";
import { createWeaverRuntime, type JsonObject, type WeaverRuntime } from "@weaver/core";
import { Window } from "happy-dom";
import { createBasicCatalogRendererRegistrations } from "../basic/index.js";
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
      Image: component("Image", { url: ref("DynamicString"), description: ref("DynamicString") }),
      Stack: component("Stack", { sections: ref("ChildList") }),
      TabsLike: component("TabsLike", { tabs: { type: "array", items: { type: "object", properties: {
        title: ref("DynamicString"), child: ref("ComponentId"),
      }, required: ["title", "child"], additionalProperties: false } } }),
      Tabs: component("Tabs", { tabs: { type: "array", items: { type: "object", properties: {
        title: ref("DynamicString"), child: ref("ComponentId"),
      }, required: ["title", "child"], additionalProperties: false } } }),
      Local: component("Local"),
      CheckText: component("CheckText", { text: ref("DynamicString"), checks: { type: "array" } }, [ref("Checkable")]),
      Missing: component("Missing"), Throwing: component("Throwing"), Invalid: component("Invalid"),
    },
    functions: {
      mediaUrl: { type: "object", properties: { call: { const: "mediaUrl" }, args: { type: "object" }, returnType: { const: "string" } }, required: ["call", "args"], additionalProperties: false },
    },
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

test("renders repeated nested child relationships by location without exposing component IDs", () => {
  const rt = runtime(); rt.process(create());
  rt.process(components([
    { id: "root", component: "TabsLike", tabs: [
      { title: { path: "/first" }, child: "a" }, { title: "Second", child: "b" },
    ] },
    { id: "a", component: "Text", text: "Panel A" }, { id: "b", component: "Text", text: "Panel B" },
  ]));
  rt.process(data({ first: "First" }));
  const tabsRenderer: RendererRegistration = { catalogId: "test", component: "TabsLike", render: ({ document, properties, relationships }) => {
    assert.deepEqual(properties.tabs, [{ title: "First" }, { title: "Second" }]);
    assert.deepEqual(relationships.map(({ property, location }) => ({ property, location })), [
      { property: "child", location: [{ kind: "property", name: "tabs" }, { kind: "arrayIndex", index: 0 }, { kind: "property", name: "child" }] },
      { property: "child", location: [{ kind: "property", name: "tabs" }, { kind: "arrayIndex", index: 1 }, { kind: "property", name: "child" }] },
    ]);
    const node = document.createElement("section");
    for (const relationship of relationships) if (relationship.kind === "single" && relationship.child) node.append(relationship.child);
    return node;
  } };
  const { target, result } = mount(rt, [...registrations(), tabsRenderer]);
  assert.ok(result.ok);
  assert.equal(target.textContent, "Panel APanel B");
});

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

test("Basic media policy receives bound hydrated URLs and policy exceptions preserve prior DOM", () => {
  const rt = runtime(); rt.process(create());
  rt.process(components([{ id: "root", component: "Image", url: { path: "/url" }, description: "cover" }]));
  const seen: string[] = [];
  const { target, result } = mount(rt, createBasicCatalogRendererRegistrations({
    catalogId: "test",
    resourcePolicy: ({ url }) => { seen.push(url); if (url === "/throw") throw new Error("host policy failed"); return `/approved${url}`; },
  }));
  assert.ok(result.ok); assert.equal(target.querySelector("img")?.hasAttribute("src"), false); assert.deepEqual(seen, []);
  rt.process(data({ url: "/one.png" }));
  const previous = target.querySelector("img"); assert.equal(previous?.getAttribute("src"), "/approved/one.png"); assert.deepEqual(seen, ["/one.png"]);
  rt.process(data({ url: "/throw" }));
  assert.equal(result.value.getLastResult().ok, false);
  const failed = result.value.getLastResult(); assert.equal(!failed.ok && failed.error.code, "RENDERER_EXECUTION_FAILED");
  assert.equal(target.querySelector("img"), previous); assert.equal(target.querySelector("img")?.getAttribute("src"), "/approved/one.png");
});

test("Basic media policy receives trusted function-backed URL results", () => {
  const made = createWeaverRuntime({
    catalogs: [{ catalogId: "test", schema: catalog("test") }],
    functions: [{ catalogId: "test", name: "mediaUrl", implementation: () => "/function.png" }],
  });
  assert.ok(made.ok); const rt = made.value; rt.process(create());
  rt.process(components([{ id: "root", component: "Image", url: { call: "mediaUrl", args: {} } }]));
  const seen: string[] = [];
  const mounted = mount(rt, createBasicCatalogRendererRegistrations({ catalogId: "test", resourcePolicy: ({ url }) => { seen.push(url); return url; } }));
  assert.ok(mounted.result.ok); assert.deepEqual(seen, ["/function.png"]); assert.equal(mounted.target.querySelector("img")?.getAttribute("src"), "/function.png");
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

test("mount-local state defaults, rerenders defensively, rejects stale writes, and never mutates Core", () => {
  const rt = runtime(); rt.process(create()); rt.process(components([{ id: "root", component: "Local" }]));
  let renders = 0; const seen: unknown[] = []; const callbacks: Array<(value: unknown) => unknown> = [];
  const local: RendererRegistration = { catalogId: "test", component: "Local", render: ({ document, interactions }) => {
    renders++;
    const value = interactions.getLocalState("value", { count: 0, values: [0] });
    seen.push(value);
    callbacks.push((next) => interactions.setLocalState("value", next as JsonObject));
    return document.createElement("div");
  } };
  const before = rt.getSurface("s");
  const mounted = mount(rt, [...registrations(), local]); assert.ok(mounted.result.ok);
  const owned = { count: 1, values: [1] }; assert.deepEqual(callbacks[0]?.(owned), { ok: true });
  owned.count = 9; owned.values.push(9);
  (seen[1] as { count: number; values: number[] }).values.push(7);
  assert.deepEqual(callbacks[1]?.({ count: 2, values: [2] }), { ok: true });
  assert.deepEqual(seen[2], { count: 2, values: [2] });
  assert.equal(renders, 3); assert.deepEqual(rt.getSurface("s"), before);
  assert.deepEqual(callbacks[0]?.({ count: 99 }), { ok: false, error: { code: "STALE_RENDER_INTERACTION" } });
  assert.equal(renders, 3);
  mounted.result.value.unmount();
  assert.deepEqual(callbacks.at(-1)?.({ count: 99 }), { ok: false, error: { code: "STALE_RENDER_INTERACTION" } });
});

test("local state prunes only after a successful presentation removes an instance", () => {
  const rt = runtime(); rt.process(create());
  rt.process(components([{ id: "root", component: "Stack", sections: ["a"] }, { id: "a", component: "Local" }]));
  const values: number[] = []; let setA: ((value: number) => unknown) | undefined;
  const local: RendererRegistration = { catalogId: "test", component: "Local", render: ({ document, interactions }) => {
    values.push(interactions.getLocalState("count", 0)); setA = (value) => interactions.setLocalState("count", value); return document.createElement("div");
  } };
  const mounted = mount(rt, [...registrations(), local]); assert.ok(mounted.result.ok); setA?.(4);
  rt.process(components([{ id: "root", component: "Missing" }]));
  rt.process(components([{ id: "root", component: "Stack", sections: ["a"] }]));
  assert.equal(values.at(-1), 4, "failed presentation must not prune A");
  rt.process(components([{ id: "root", component: "Stack", sections: [] }]));
  rt.process(components([{ id: "root", component: "Stack", sections: ["a"] }]));
  assert.equal(values.at(-1), 0, "successful removal prunes A");
});

test("Basic Tabs selects by structural location, persists locally, restores keyboard focus, and isolates mounts", () => {
  const rt = runtime(); rt.process(create());
  rt.process(components([
    { id: "root", component: "Tabs", tabs: [{ title: { path: "/titles/0" }, child: "a" }, { title: { path: "/titles/1" }, child: "b" }, { title: "History", child: "missing" }] },
    { id: "a", component: "Text", text: { path: "/content" } }, { id: "b", component: "Text", text: "Details" },
  ]));
  rt.process(data({ titles: ["Overview", "Account"], content: "Welcome", unrelated: 0 }));
  const regs = createBasicCatalogRendererRegistrations({ catalogId: "test" });
  const one = mount(rt, regs); const two = mount(rt, regs); assert.ok(one.result.ok && two.result.ok);
  one.target.ownerDocument.body.append(one.target);
  two.target.ownerDocument.body.append(two.target);
  const tabs = (target: Element) => [...target.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  assert.deepEqual(tabs(one.target).map((button) => button.textContent), ["Overview", "Account", "History"]);
  assert.equal(one.target.querySelector('[role="tabpanel"]')?.textContent, "Welcome");
  const oldFirst = tabs(one.target)[0]!; oldFirst.focus();
  oldFirst.dispatchEvent(new oldFirst.ownerDocument.defaultView!.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  assert.equal(one.target.querySelector('[role="tabpanel"]')?.textContent, "Details");
  assert.equal(one.target.ownerDocument.activeElement, tabs(one.target)[1]);
  assert.equal(tabs(two.target)[0]?.getAttribute("aria-selected"), "true");
  rt.process(data({ titles: ["Overview", "Account updated"], content: "Changed", unrelated: 1 }));
  assert.equal(tabs(one.target)[1]?.textContent, "Account updated"); assert.equal(tabs(one.target)[1]?.getAttribute("aria-selected"), "true");
  oldFirst.click(); assert.equal(tabs(one.target)[1]?.getAttribute("aria-selected"), "true", "stale button cannot select");
  tabs(one.target)[2]?.click();
  assert.equal(one.target.querySelector('[role="tabpanel"]')?.textContent, "");
  rt.process(components([{ id: "root", component: "Tabs", tabs: [{ title: "Only", child: "a" }] }]));
  assert.equal(tabs(one.target)[0]?.getAttribute("aria-selected"), "true");
  assert.equal(one.target.querySelector('[role="tabpanel"]')?.textContent, "Changed");
});

function interactionCatalog(): JsonObject {
  const action: JsonObject = { oneOf: [
    { type: "object", properties: { functionCall: { type: "object" } }, required: ["functionCall"], additionalProperties: false },
    { type: "object", properties: { event: { type: "object" } }, required: ["event"], additionalProperties: false },
  ] };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema", catalogId: "interactive",
    components: {
      Stack: component("Stack", { sections: ref("ChildList") }),
      Input: component("Input", { value: ref("DynamicString") }),
      Rating: component("Rating", { rating: ref("DynamicNumber") }),
      Display: component("Display", { text: ref("DynamicString") }),
      Button: component("Button", { primaryAction: ref("Action"), checks: { type: "array" } }, [ref("Checkable")]),
      Missing: component("Missing"),
    },
    functions: { local: { type: "object", properties: { call: { const: "local" }, args: { type: "object" }, returnType: { const: "void" } }, required: ["call", "args"], additionalProperties: false } },
    $defs: { theme: { type: "object" }, common: { $id: "common_types.json", $defs: {
      ComponentId: { type: "string" },
      ChildList: { oneOf: [{ type: "array", items: ref("ComponentId") }, { type: "object", properties: { path: { type: "string" }, componentId: ref("ComponentId") }, required: ["path", "componentId"], additionalProperties: false }] },
      PathBinding: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
      FunctionCall: { type: "object", properties: { call: { type: "string" }, args: { type: "object" } }, required: ["call", "args"], additionalProperties: false },
      DynamicString: dynamic({ type: "string" }), DynamicNumber: dynamic({ type: "number" }),
      DynamicBoolean: dynamic({ type: "boolean" }), DynamicStringList: dynamic({ type: "array", items: { type: "string" } }),
      Checkable: {}, Action: action,
    } } },
  };
}

function interactiveRuntime(local?: () => void): WeaverRuntime {
  const made = createWeaverRuntime({
    catalogs: [{ catalogId: "interactive", schema: interactionCatalog() }],
    ...(local === undefined ? {} : { functions: [{ catalogId: "interactive", name: "local", implementation: local }] }),
    now: () => new Date("2025-01-02T03:04:05.000Z"),
  });
  assert.ok(made.ok);
  made.value.process({ version: "v0.9.1", createSurface: { surfaceId: "s", catalogId: "interactive", sendDataModel: true } });
  return made.value;
}

function interactionRegistrations(results: unknown[] = []): RendererRegistration[] {
  return [
    { catalogId: "interactive", component: "Stack", render: ({ document, relationships }) => { const node = document.createElement("div"); const relation = relationships[0]; if (relation?.kind !== "single") node.append(...(relation?.children ?? [])); return node; } },
    { catalogId: "interactive", component: "Input", render: ({ document, properties, interactions }) => { const node = document.createElement("input"); node.value = String(properties.value ?? ""); interactions.registerControl(node, "value"); node.addEventListener("input", () => results.push(interactions.writeInput("value", node.value))); return node; } },
    { catalogId: "interactive", component: "Rating", render: ({ document, properties, interactions }) => { const node = document.createElement("input"); node.value = String(properties.rating ?? ""); node.addEventListener("input", () => results.push(interactions.writeInput("rating", Number(node.value)))); return node; } },
    { catalogId: "interactive", component: "Display", render: ({ document, properties }) => { const node = document.createElement("output"); node.textContent = String(properties.text ?? ""); return node; } },
    { catalogId: "interactive", component: "Button", render: ({ document, interactions }) => { const node = document.createElement("button"); node.addEventListener("click", () => results.push(interactions.dispatchAction("primaryAction"))); return node; } },
  ];
}

const interactiveComponents = (values: JsonObject[]) => ({ version: "v0.9.1", updateComponents: { surfaceId: "s", components: values } });
const interactiveData = (value: unknown) => ({ version: "v0.9.1", updateDataModel: { surfaceId: "s", value } });

function dispatch(node: Element, type: string): void {
  const EventConstructor = node.ownerDocument.defaultView!.Event;
  node.dispatchEvent(new EventConstructor(type, { bubbles: true }));
}

test("input writes synchronously, rerenders, and a later action uses current model in handoff metadata", () => {
  const rt = interactiveRuntime();
  rt.process(interactiveComponents([
    { id: "root", component: "Stack", sections: ["input", "display", "button"] },
    { id: "input", component: "Input", value: { path: "/name" } },
    { id: "display", component: "Display", text: { path: "/name" } },
    { id: "button", component: "Button", primaryAction: { event: { name: "submit", context: { name: { path: "/name" } } } } },
  ]));
  rt.process(interactiveData({ name: "Ada" }));
  const { target } = dom(); const handoffs: unknown[] = []; const results: unknown[] = [];
  const mounted = new WebSurfaceRenderer({ runtime: rt, renderers: new RendererRegistry(interactionRegistrations(results)), onServerEvent: (event) => handoffs.push(event) }).mount({ surfaceId: "s", target });
  assert.ok(mounted.ok);
  const input = target.querySelector("input")!; input.value = "Grace"; dispatch(input, "input");
  assert.equal(rt.getSurface("s")?.dataModel && (rt.getSurface("s")!.dataModel as JsonObject).name, "Grace");
  assert.equal(target.querySelector("output")?.textContent, "Grace");
  dispatch(target.querySelector("button")!, "click");
  const handoff = handoffs[0] as { message: { action: { context: JsonObject } }; metadata: { a2uiClientDataModel: { surfaces: Record<string, JsonObject> } } };
  assert.equal(handoff.message.action.context.name, "Grace");
  assert.equal(handoff.metadata.a2uiClientDataModel.surfaces.s?.name, "Grace");
  assert.equal(results.length, 2);
});

test("custom input properties and nested template scopes delegate unchanged", () => {
  const rt = interactiveRuntime();
  rt.process(interactiveComponents([
    { id: "root", component: "Stack", sections: { path: "/groups", componentId: "group" } },
    { id: "group", component: "Stack", sections: { path: "members", componentId: "rating" } },
    { id: "rating", component: "Rating", rating: { path: "rating" } },
  ]));
  rt.process(interactiveData({ groups: [{ members: [{ rating: 1 }, { rating: 2 }] }] }));
  const { target } = dom();
  const mounted = new WebSurfaceRenderer({ runtime: rt, renderers: new RendererRegistry(interactionRegistrations()) }).mount({ surfaceId: "s", target }); assert.ok(mounted.ok);
  const second = target.querySelectorAll("input")[1]!; second.value = "4"; dispatch(second, "input");
  assert.equal(((rt.getSurface("s")!.dataModel as JsonObject).groups as JsonObject[])[0]!.members instanceof Array && (((rt.getSurface("s")!.dataModel as JsonObject).groups as JsonObject[])[0]!.members as JsonObject[])[1]!.rating, 4);
});

test("local actions execute once, blocked actions do not hand off, and handoff failures are typed", () => {
  let calls = 0; const rt = interactiveRuntime(() => { calls++; });
  rt.process(interactiveComponents([{ id: "root", component: "Button", primaryAction: { functionCall: { call: "local", args: {} } } }]));
  const { target } = dom(); let handoffs = 0; const results: unknown[] = [];
  const web = new WebSurfaceRenderer({ runtime: rt, renderers: new RendererRegistry(interactionRegistrations(results)), onServerEvent: () => { handoffs++; } });
  const mounted = web.mount({ surfaceId: "s", target }); assert.ok(mounted.ok); dispatch(target.querySelector("button")!, "click");
  assert.equal(calls, 1); assert.equal(handoffs, 0);
  rt.process(interactiveComponents([{ id: "root", component: "Button", primaryAction: { event: { name: "blocked", context: {} } }, checks: [{ condition: false, message: "no" }] }]));
  dispatch(target.querySelector("button")!, "click"); assert.equal(handoffs, 0);
  assert.equal((results.at(-1) as { ok: false; error: { cause: { code: string } } }).error.cause.code, "ACTION_BLOCKED_BY_CHECKS");

  rt.process(interactiveComponents([{ id: "root", component: "Button", primaryAction: { event: { name: "ready", context: {} } } }]));
  const failingResults: unknown[] = []; const secondTarget = dom().target;
  const second = new WebSurfaceRenderer({ runtime: rt, renderers: new RendererRegistry(interactionRegistrations(failingResults)), onServerEvent: () => { throw new Error("host secret"); } }).mount({ surfaceId: "s", target: secondTarget }); assert.ok(second.ok);
  dispatch(secondTarget.querySelector("button")!, "click");
  assert.deepEqual(failingResults.at(-1), { ok: false, error: { code: "SERVER_EVENT_HANDOFF_FAILED" } });
});

test("successful, failed, refresh, and unmount render attempts invalidate retained DOM interactions", () => {
  const rt = interactiveRuntime(); const results: unknown[] = [];
  rt.process(interactiveComponents([{ id: "root", component: "Input", value: { path: "/name" } }])); rt.process(interactiveData({ name: "Ada" }));
  const { target } = dom(); const mounted = new WebSurfaceRenderer({ runtime: rt, renderers: new RendererRegistry(interactionRegistrations(results)) }).mount({ surfaceId: "s", target }); assert.ok(mounted.ok);
  const first = target.querySelector("input")!; rt.process(interactiveData({ name: "Grace" })); first.value = "stale-success"; dispatch(first, "input");
  assert.deepEqual(results.at(-1), { ok: false, error: { code: "STALE_RENDER_INTERACTION" } });
  const visible = target.querySelector("input")!; rt.process(interactiveComponents([{ id: "root", component: "Missing" }])); visible.value = "stale-failure"; dispatch(visible, "input");
  assert.deepEqual(results.at(-1), { ok: false, error: { code: "STALE_RENDER_INTERACTION" } });
  rt.process(interactiveComponents([{ id: "root", component: "Input", value: { path: "/name" } }]));
  const beforeRefresh = target.querySelector("input")!; assert.equal(mounted.value.refresh().ok, true); dispatch(beforeRefresh, "input");
  assert.deepEqual(results.at(-1), { ok: false, error: { code: "STALE_RENDER_INTERACTION" } });
  const beforeUnmount = target.querySelector("input")!; mounted.value.unmount(); dispatch(beforeUnmount, "input");
  assert.deepEqual(results.at(-1), { ok: false, error: { code: "STALE_RENDER_INTERACTION" } });
});

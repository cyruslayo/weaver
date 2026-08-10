import assert from "node:assert/strict";
import { test } from "node:test";
import { createWeaverRuntime, type JsonObject, type WeaverRuntime } from "@weaver/core";
import { Window } from "happy-dom";
import { createBasicCatalogRendererRegistrations, createBasicCatalogThemeAdapter } from "../basic/index.js";
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
      Text: component("Text", { text: ref("DynamicString"), weight: { type: "number" } }),
      Row: component("Row", { children: ref("ChildList") }),
      Column: component("Column", { children: ref("ChildList") }),
      Image: component("Image", { url: ref("DynamicString"), description: ref("DynamicString") }),
      Video: component("Video", { url: ref("DynamicString") }),
      AudioPlayer: component("AudioPlayer", { url: ref("DynamicString"), description: ref("DynamicString") }),
      Probe: component("Probe"),
      Icon: component("Icon", { name: {} }),
      List: component("List", { children: ref("ChildList"), direction: { type: "string" }, align: { type: "string" } }),
      Card: component("Card", { child: ref("ComponentId") }), Divider: component("Divider", { axis: { type: "string" } }),
      TextField: component("TextField", { label: ref("DynamicString"), value: ref("DynamicString") }),
      CheckBox: component("CheckBox", { label: ref("DynamicString"), value: ref("DynamicBoolean") }),
      Slider: component("Slider", { value: ref("DynamicNumber"), min: { type: "number" }, max: { type: "number" } }),
      ChoicePicker: component("ChoicePicker", { options: { type: "array" }, value: ref("DynamicStringList") }),
      DateTimeInput: component("DateTimeInput", { value: ref("DynamicString"), enableDate: { type: "boolean" }, enableTime: { type: "boolean" } }),
      Stack: component("Stack", { sections: ref("ChildList") }),
      TabsLike: component("TabsLike", { tabs: { type: "array", items: { type: "object", properties: {
        title: ref("DynamicString"), child: ref("ComponentId"),
      }, required: ["title", "child"], additionalProperties: false } } }),
      Tabs: component("Tabs", { tabs: { type: "array", items: { type: "object", properties: {
        title: ref("DynamicString"), child: ref("ComponentId"),
      }, required: ["title", "child"], additionalProperties: false } } }),
      Modal: component("Modal", { trigger: ref("ComponentId"), content: ref("ComponentId") }),
      Button: component("Button", { child: ref("ComponentId"), action: ref("Action") }),
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
      Checkable: {}, Action: { oneOf: [
        { type: "object", properties: { functionCall: { type: "object" } }, required: ["functionCall"], additionalProperties: false },
        { type: "object", properties: { event: { type: "object" } }, required: ["event"], additionalProperties: false },
      ] },
    } } },
  };
}
const create = (catalogId = "test", theme?: JsonObject) => ({ version: "v0.9.1", createSurface: { surfaceId: "s", catalogId, ...(theme === undefined ? {} : { theme }) } });
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

test("surface theme translation is opt-in, catalog-isolated, allowlisted, and mount-scoped", () => {
  const themed = runtime(["test", "custom"]); themed.process(create("test", { primaryColor: "#112233", customThing: "ignored", iconUrl: "https://invalid.example/icon", agentDisplayName: "Agent" }));
  themed.process(components([{ id: "root", component: "Text", text: "safe" }]));
  const absent = mount(themed); assert.ok(absent.result.ok);
  const absentContainer = absent.target.firstElementChild as HTMLElement;
  assert.equal(absentContainer.style.getPropertyValue("--a2ui-color-primary"), "");
  assert.equal(absent.target.querySelector("img"), null); assert.equal(absent.target.textContent, "safe");

  const { target } = dom();
  const web = new WebSurfaceRenderer({ runtime: themed, renderers: new RendererRegistry(registrations()), themeAdapter: createBasicCatalogThemeAdapter({ catalogId: "test" }) });
  const mounted = web.mount({ surfaceId: "s", target }); assert.ok(mounted.ok);
  const container = target.firstElementChild as HTMLElement;
  assert.equal(container.style.getPropertyValue("--a2ui-color-primary"), "#112233");
  assert.equal(container.style.length, 1);

  const mismatch = runtime(["test", "custom"]); mismatch.process(create("custom", { primaryColor: "#abcdef" }));
  mismatch.process({ version: "v0.9.1", updateComponents: { surfaceId: "s", components: [{ id: "root", component: "Text", text: "custom" }] } });
  const mismatchTarget = dom().target;
  const mismatchMount = new WebSurfaceRenderer({ runtime: mismatch, renderers: new RendererRegistry([{ catalogId: "custom", component: "Text", render: ({ document }) => document.createElement("span") }]), themeAdapter: createBasicCatalogThemeAdapter({ catalogId: "test" }) }).mount({ surfaceId: "s", target: mismatchTarget });
  assert.ok(mismatchMount.ok); assert.equal((mismatchTarget.firstElementChild as HTMLElement).style.length, 0);
});

test("raw attribution claims are inert without a trusted provider", () => {
  const rt = runtime();
  rt.process(create("test", { agentDisplayName: "Trusted Bank", iconUrl: "https://attacker.example/icon.png" }));
  rt.process(components([{ id: "root", component: "Text", text: "content" }]));
  const { target, result } = mount(rt); assert.ok(result.ok);
  assert.equal(target.querySelector("[data-weaver-surface-attribution]"), null);
  assert.equal(target.querySelector("img"), null);
  assert.equal(target.textContent, "content");
});

test("trusted attribution overrides raw claims and uses safe accessible chrome", () => {
  const rt = runtime();
  rt.process(create("test", { agentDisplayName: "Trusted Bank", iconUrl: "https://attacker.example/a.png" }));
  rt.process(components([{ id: "root", component: "Text", text: "tree" }]));
  const seen: unknown[] = [];
  const { target } = dom();
  const mounted = new WebSurfaceRenderer({
    runtime: rt,
    renderers: new RendererRegistry(registrations()),
    attributionProvider: (input) => {
      seen.push(input);
      if (input.theme !== undefined) input.theme.agentDisplayName = "mutated provider copy";
      return { displayName: "<img src=x onerror=attack>", iconUrl: "https://trusted.example/verified.png" };
    },
  }).mount({ surfaceId: "s", target });
  assert.ok(mounted.ok);
  const container = target.firstElementChild!;
  const chrome = container.querySelector<HTMLElement>("[data-weaver-surface-attribution]")!;
  assert.equal(container.firstElementChild, chrome);
  assert.equal(chrome.textContent, "<img src=x onerror=attack>");
  assert.equal(chrome.querySelectorAll("img").length, 1);
  assert.equal(chrome.querySelector("img")?.getAttribute("src"), "https://trusted.example/verified.png");
  assert.equal(chrome.querySelector("img")?.alt, "");
  assert.equal(chrome.querySelector("img")?.width, 24); assert.equal(chrome.querySelector("img")?.height, 24);
  assert.equal(chrome.querySelector("img")?.style.objectFit, "contain");
  assert.equal(chrome.querySelector("button,a,[tabindex]"), null);
  assert.equal(chrome.attributes.length, 2, "only the static hook and style are serialized");
  assert.equal(target.textContent, "<img src=x onerror=attack>tree");
  assert.deepEqual(rt.getSurface("s")?.theme, { agentDisplayName: "Trusted Bank", iconUrl: "https://attacker.example/a.png" });
  assert.equal((seen[0] as { surfaceId: string; catalogId: string }).surfaceId, "s");
  assert.equal((seen[0] as { surfaceId: string; catalogId: string }).catalogId, "test");
});

test("attribution supports name-only, undefined, independent mounts, updates, and delete/recreate", () => {
  const rt = runtime(); rt.process(create("test", { agentDisplayName: "raw" }));
  rt.process(components([{ id: "root", component: "Text", text: "one" }]));
  let verified: string | undefined = "Registry One"; let calls = 0;
  const provider = ({ surfaceId, catalogId }: { surfaceId: string; catalogId: string }) => {
    calls++; return verified === undefined ? undefined : { displayName: `${verified}:${surfaceId}:${catalogId}` };
  };
  const web = new WebSurfaceRenderer({ runtime: rt, renderers: new RendererRegistry(registrations()), attributionProvider: provider });
  const oneTarget = dom().target; const twoTarget = dom().target;
  const one = web.mount({ surfaceId: "s", target: oneTarget }); const two = web.mount({ surfaceId: "s", target: twoTarget });
  assert.ok(one.ok && two.ok); assert.equal(calls, 2);
  assert.equal(oneTarget.querySelector("[data-weaver-surface-attribution]")?.textContent, "Registry One:s:test");
  assert.equal(oneTarget.querySelector("[data-weaver-surface-attribution] img"), null);
  verified = "Registry Two"; rt.process(data({ changed: true }));
  assert.equal(oneTarget.querySelector("[data-weaver-surface-attribution]")?.textContent, "Registry Two:s:test");
  assert.equal(twoTarget.querySelector("[data-weaver-surface-attribution]")?.textContent, "Registry Two:s:test");
  verified = undefined; rt.process(components([{ id: "root", component: "Text", text: "two" }]));
  assert.equal(oneTarget.querySelector("[data-weaver-surface-attribution]"), null);
  one.value.unmount(); assert.equal(oneTarget.childNodes.length, 0); assert.equal(twoTarget.textContent, "two");

  rt.process({ version: "v0.9.1", deleteSurface: { surfaceId: "s" } });
  rt.process(create("test", { agentDisplayName: "new raw" }));
  rt.process(components([{ id: "root", component: "Text", text: "new tree" }]));
  verified = "Recreated"; const refreshed = two.value.refresh(); assert.ok(refreshed.ok);
  assert.equal(twoTarget.textContent, "Recreated:s:testnew tree");
});

test("invalid or throwing attribution providers preserve the prior chrome, tree, and theme", () => {
  const rt = runtime(); rt.process(create("test", { primaryColor: "#112233" }));
  rt.process(components([{ id: "root", component: "Text", text: "old" }]));
  let mode: "valid" | "empty" | "throw" = "valid";
  const { target } = dom();
  const mounted = new WebSurfaceRenderer({
    runtime: rt,
    renderers: new RendererRegistry(registrations()),
    themeAdapter: createBasicCatalogThemeAdapter({ catalogId: "test" }),
    attributionProvider: () => {
      if (mode === "throw") throw new Error("provider secret");
      return { displayName: mode === "empty" ? "   " : "Verified" };
    },
  }).mount({ surfaceId: "s", target });
  assert.ok(mounted.ok); const container = target.firstElementChild as HTMLElement;
  const oldChildren = [...container.childNodes];
  mode = "empty"; rt.process(components([{ id: "root", component: "Text", text: "new" }]));
  let failure = mounted.value.getLastResult(); assert.deepEqual(failure, { ok: false, error: { code: "INVALID_VERIFIED_ATTRIBUTION" } });
  assert.deepEqual([...container.childNodes], oldChildren); assert.equal(container.textContent, "Verifiedold");
  assert.equal(container.style.getPropertyValue("--a2ui-color-primary"), "#112233");
  mode = "throw"; mounted.value.refresh(); failure = mounted.value.getLastResult();
  assert.deepEqual(failure, { ok: false, error: { code: "ATTRIBUTION_PROVIDER_FAILED" } });
  assert.equal(JSON.stringify(failure).includes("secret"), false); assert.deepEqual([...container.childNodes], oldChildren);
});

test("theme adapter and attribution provider receive independent defensive theme copies", () => {
  const rt = runtime(); rt.process(create("test", { primaryColor: "#445566", agentDisplayName: "raw" }));
  rt.process(components([{ id: "root", component: "Text", text: "tree" }]));
  const adapter = createBasicCatalogThemeAdapter({ catalogId: "test" });
  const { target } = dom();
  const mounted = new WebSurfaceRenderer({
    runtime: rt, renderers: new RendererRegistry(registrations()),
    themeAdapter: (input) => { const result = adapter(input); if (input.theme) input.theme.agentDisplayName = "adapter mutation"; return result; },
    attributionProvider: (input) => ({ displayName: String(input.theme?.agentDisplayName) }),
  }).mount({ surfaceId: "s", target });
  assert.ok(mounted.ok);
  assert.equal(target.querySelector("[data-weaver-surface-attribution]")?.textContent, "raw");
  assert.equal((target.firstElementChild as HTMLElement).style.getPropertyValue("--a2ui-color-primary"), "#445566");
});

test("theme updates clean only mount-owned properties and delete/recreate does not leak", () => {
  const rt = runtime(); rt.process(create("test", { primaryColor: "#ff0000" })); rt.process(components([{ id: "root", component: "Text", text: "red" }]));
  const { target } = dom();
  const mounted = new WebSurfaceRenderer({ runtime: rt, renderers: new RendererRegistry(registrations()), themeAdapter: createBasicCatalogThemeAdapter({ catalogId: "test" }) }).mount({ surfaceId: "s", target });
  assert.ok(mounted.ok); const container = target.firstElementChild as HTMLElement;
  container.style.setProperty("--host-owned", "keep");
  rt.process({ version: "v0.9.1", deleteSurface: { surfaceId: "s" } });
  rt.process(create("test")); rt.process(components([{ id: "root", component: "Text", text: "plain" }]));
  assert.ok(mounted.value.refresh().ok);
  assert.equal(container.style.getPropertyValue("--a2ui-color-primary"), ""); assert.equal(container.style.getPropertyValue("--host-owned"), "keep");
  rt.process({ version: "v0.9.1", deleteSurface: { surfaceId: "s" } });
  rt.process(create("test", { primaryColor: "#0000ff" })); rt.process(components([{ id: "root", component: "Text", text: "blue" }]));
  mounted.value.refresh(); assert.equal(container.style.getPropertyValue("--a2ui-color-primary"), "#0000ff");
});

test("theme adapter failures and invalid property names preserve previous DOM and theme atomically", () => {
  const rt = runtime(); rt.process(create("test", { primaryColor: "#ff0000" })); rt.process(components([{ id: "root", component: "Text", text: "old" }]));
  let fail = false;
  const adapter = createBasicCatalogThemeAdapter({ catalogId: "test" });
  const { target } = dom();
  const mounted = new WebSurfaceRenderer({ runtime: rt, renderers: new RendererRegistry(registrations()), themeAdapter: (input) => { if (fail) throw new Error("secret"); return adapter(input); } }).mount({ surfaceId: "s", target });
  assert.ok(mounted.ok); const container = target.firstElementChild as HTMLElement; const oldNode = container.firstChild;
  fail = true; rt.process(components([{ id: "root", component: "Text", text: "new" }]));
  const failed = mounted.value.getLastResult(); assert.equal(!failed.ok && failed.error.code, "THEME_ADAPTER_FAILED");
  assert.equal(container.firstChild, oldNode); assert.equal(container.textContent, "old"); assert.equal(container.style.getPropertyValue("--a2ui-color-primary"), "#ff0000");

  const badTarget = dom().target;
  const bad = new WebSurfaceRenderer({ runtime: rt, renderers: new RendererRegistry(registrations()), themeAdapter: () => ({ customProperties: { color: "red" } }) }).mount({ surfaceId: "s", target: badTarget });
  assert.equal(!bad.ok && bad.error.code, "THEME_ADAPTER_FAILED"); assert.equal(badTarget.childNodes.length, 0);
});

test("theme property ownership is independent across mounts", () => {
  const rt = runtime(); rt.process(create("test", { primaryColor: "#112233" })); rt.process(components([{ id: "root", component: "Text", text: "x" }]));
  const adapter = createBasicCatalogThemeAdapter({ catalogId: "test" });
  const oneTarget = dom().target; const twoTarget = dom().target;
  const web = new WebSurfaceRenderer({ runtime: rt, renderers: new RendererRegistry(registrations()), themeAdapter: adapter });
  const one = web.mount({ surfaceId: "s", target: oneTarget }); const two = web.mount({ surfaceId: "s", target: twoTarget }); assert.ok(one.ok && two.ok);
  one.value.unmount(); assert.equal((twoTarget.firstElementChild as HTMLElement).style.getPropertyValue("--a2ui-color-primary"), "#112233");
});

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

test("relationships expose defensively owned target-child hydrated metadata", () => {
  const rt = runtime(); rt.process(create());
  rt.process(components([
    { id: "root", component: "Stack", sections: ["item", "item"] },
    { id: "item", component: "Text", text: { path: "/label" }, weight: 2 },
  ]));
  rt.process(data({ label: "Hydrated" }));
  const observed: unknown[] = [];
  const parent: RendererRegistration = { catalogId: "test", component: "Stack", render: ({ document, relationships }) => {
    const relationship = relationships[0];
    assert.ok(relationship && relationship.kind !== "single");
    observed.push(relationship.childComponents, relationship.childProperties);
    assert.deepEqual(relationship.childComponents, ["Text", "Text"]);
    assert.deepEqual(relationship.childProperties, [{ text: "Hydrated", weight: 2 }, { text: "Hydrated", weight: 2 }]);
    (relationship.childProperties?.[0] as { text?: unknown }).text = "mutated";
    assert.equal(relationship.childProperties?.[1]?.text, "Hydrated");
    const node = document.createElement("div"); node.append(...relationship.children); return node;
  } };
  const mounted = mount(rt, [...registrations().filter(({ component }) => component !== "Stack"), parent]); assert.ok(mounted.result.ok);
  const resolved = rt.resolveSurface("s"); assert.ok(resolved.ok);
  assert.equal(resolved.value.tree.root?.relationships[0]?.kind !== "single" && resolved.value.tree.root?.relationships[0]?.children[0]?.properties.text, "Hydrated");
  assert.equal(mounted.target.textContent, "HydratedHydrated");
  assert.equal(observed.length, 2);
});

test("progressively missing relationships omit child metadata safely and preserve location", () => {
  const rt = runtime(); rt.process(create());
  rt.process(components([{ id: "root", component: "TabsLike", tabs: [{ title: "Later", child: "missing" }] }]));
  const parent: RendererRegistration = { catalogId: "test", component: "TabsLike", render: ({ document, relationships }) => {
    assert.deepEqual(relationships, [{ kind: "single", property: "child", location: [{ kind: "property", name: "tabs" }, { kind: "arrayIndex", index: 0 }, { kind: "property", name: "child" }] }]);
    return document.createElement("div");
  } };
  assert.ok(mount(rt, [...registrations(), parent]).result.ok);
});

test("Row applies hydrated weight across templates and runtime updates without stale styles", () => {
  const rt = runtime(); rt.process(create());
  rt.process(components([
    { id: "root", component: "Row", children: { path: "/items", componentId: "item" } },
    { id: "item", component: "Text", text: { path: "label" }, weight: 1.5 },
  ]));
  rt.process(data({ items: [{ label: "A" }, { label: "B" }] }));
  const { target, result } = mount(rt, createBasicCatalogRendererRegistrations({ catalogId: "test" })); assert.ok(result.ok);
  assert.deepEqual([...target.querySelectorAll("p")].map((node) => node.style.flexGrow), ["1.5", "1.5"]);
  rt.process(components([{ id: "item", component: "Text", text: { path: "label" }, weight: 3 }]));
  assert.deepEqual([...target.querySelectorAll("p")].map((node) => node.style.flexGrow), ["3", "3"]);
  rt.process(components([{ id: "item", component: "Text", text: { path: "label" } }]));
  assert.deepEqual([...target.querySelectorAll("p")].map((node) => node.style.flexGrow), ["", ""]);
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
    functions: [{ catalogId: "test", name: "mediaUrl", effect: "pure", implementation: () => "/function.png" }],
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
  rt.process(components([{ id: "root", component: "Tabs", tabs: [
    { title: "Gamma", child: "missing" }, { title: "Alpha", child: "a" }, { title: "Beta", child: "b" },
  ] }]));
  assert.equal(tabs(one.target)[1]?.getAttribute("aria-selected"), "true", "reorder preserves selectedIndex 1");
  assert.equal(one.target.querySelector('[role="tabpanel"]')?.textContent, "Changed", "logical content follows the new occupant of position 1");
  tabs(one.target)[2]?.click();
  assert.equal(one.target.querySelector('[role="tabpanel"]')?.textContent, "Details");
  rt.process(components([{ id: "root", component: "Tabs", tabs: [{ title: "Only", child: "a" }] }]));
  assert.equal(tabs(one.target)[0]?.getAttribute("aria-selected"), "true", "out-of-range selectedIndex renders index 0");
  assert.equal(one.target.querySelector('[role="tabpanel"]')?.textContent, "Changed");
});

test("official Basic all-18-component surface validates, resolves, and mounts", () => {
  const catalogId = "test";
  const rt = runtime();
  assert.ok(rt.process({ version: "v0.9.1", createSurface: { surfaceId: "all", catalogId, theme: { primaryColor: "#123456" } } }).ok);
  const all = [
    { id: "root", component: "Column", children: ["text", "image", "icon", "video", "audio", "row", "list", "card", "tabs", "modal", "divider", "button", "field", "checkbox", "slider", "choice", "date"] },
    { id: "text", component: "Text", text: "All components" }, { id: "image", component: "Image", url: "/image.png" },
    { id: "icon", component: "Icon", name: "home" }, { id: "video", component: "Video", url: "/video.mp4" }, { id: "audio", component: "AudioPlayer", url: "/audio.mp3" },
    { id: "row", component: "Row", children: ["row-text"] }, { id: "row-text", component: "Text", text: "Row" },
    { id: "list", component: "List", children: ["list-text"] }, { id: "list-text", component: "Text", text: "List" },
    { id: "card", component: "Card", child: "card-text" }, { id: "card-text", component: "Text", text: "Card" },
    { id: "tabs", component: "Tabs", tabs: [{ title: "One", child: "tab-one" }, { title: "Two", child: "tab-two" }] }, { id: "tab-one", component: "Text", text: "Tab one" }, { id: "tab-two", component: "Text", text: "Tab two" },
    { id: "modal", component: "Modal", trigger: "modal-trigger", content: "modal-content" }, { id: "modal-trigger", component: "Text", text: "Open modal" }, { id: "modal-content", component: "Text", text: "Modal content" },
    { id: "divider", component: "Divider" }, { id: "button", component: "Button", child: "button-text", action: { event: { name: "submit", context: {} } } }, { id: "button-text", component: "Text", text: "Submit" },
    { id: "field", component: "TextField", label: "Field", value: { path: "/field" } }, { id: "checkbox", component: "CheckBox", label: "Check", value: { path: "/checked" } },
    { id: "slider", component: "Slider", max: 10, value: { path: "/slider" } }, { id: "choice", component: "ChoicePicker", options: [{ label: "A", value: "a" }], value: { path: "/choice" } },
    { id: "date", component: "DateTimeInput", value: { path: "/date" }, enableDate: true },
  ];
  const update = rt.process({ version: "v0.9.1", updateComponents: { surfaceId: "all", components: all } }); assert.ok(update.ok);
  assert.ok(rt.process({ version: "v0.9.1", updateDataModel: { surfaceId: "all", value: { field: "x", checked: true, slider: 2, choice: ["a"], date: "2026-08-10" } } }).ok);
  const resolved = rt.resolveSurface("all"); assert.ok(resolved.ok); assert.equal(resolved.value.tree.ready, true); assert.deepEqual(resolved.value.issues, { tree: [], instances: [], properties: [] });
  const registrations = createBasicCatalogRendererRegistrations({ catalogId, resourcePolicy: () => undefined, iconResolver: () => "M0 0", regexMatcher: () => true });
  assert.equal(registrations.length, 18); assert.equal(new Set(registrations.map(({ component }) => component)).size, 18);
  const { target } = dom(); const mounted = new WebSurfaceRenderer({ runtime: rt, renderers: new RendererRegistry(registrations), themeAdapter: createBasicCatalogThemeAdapter({ catalogId }), attributionProvider: () => ({ displayName: "Trusted test host" }) }).mount({ surfaceId: "all", target });
  assert.ok(mounted.ok); assert.equal(target.querySelectorAll("[data-a2ui-component]").length >= 18, true); assert.equal(target.querySelector("img")?.hasAttribute("src"), false);
});

test("closed Modal and inactive Tabs descendants are safely constructed detached", () => {
  const rt = runtime(); rt.process(create());
  rt.process(components([
    { id: "root", component: "Column", children: ["modal", "tabs"] },
    { id: "modal", component: "Modal", trigger: "trigger", content: "media" },
    { id: "trigger", component: "Text", text: "Open" },
    { id: "media", component: "Column", children: ["image", "video", "audio", "modal-probe"] },
    { id: "image", component: "Image", url: "/approved.png" },
    { id: "video", component: "Video", url: "/approved.mp4" },
    { id: "audio", component: "AudioPlayer", url: "/approved.mp3" },
    { id: "modal-probe", component: "Probe" },
    { id: "tabs", component: "Tabs", tabs: [{ title: "Alpha", child: "alpha" }, { title: "Beta", child: "beta" }, { title: "Gamma", child: "gamma" }] },
    { id: "alpha", component: "Probe" }, { id: "beta", component: "Probe" }, { id: "gamma", component: "Probe" },
  ]));
  const constructed: string[] = []; const approved: string[] = []; const assigned: string[] = [];
  const probe: RendererRegistration = { catalogId: "test", component: "Probe", render: ({ document, instance }) => { constructed.push(instance.sourceComponentId); return document.createElement("span"); } };
  const mediaAudit: RendererRegistration[] = createBasicCatalogRendererRegistrations({ catalogId: "test", resourcePolicy: ({ url }) => { approved.push(url); return url; } }).map((registration) => {
    if (!["Image", "Video", "AudioPlayer"].includes(registration.component)) return registration;
    return { ...registration, render: (input) => {
      const node = registration.render(input);
      const media = node instanceof input.document.defaultView!.Element && node.matches("img,video,audio") ? node : (node as Element).querySelector?.("img,video,audio");
      if (media?.hasAttribute("src")) assigned.push(`${registration.component}:${media.getAttribute("src")}`);
      return node;
    } };
  });
  const { target } = dom();
  const mounted = new WebSurfaceRenderer({ runtime: rt, renderers: new RendererRegistry([...mediaAudit, probe]) }).mount({ surfaceId: "s", target });
  assert.ok(mounted.ok);
  assert.deepEqual(constructed, ["modal-probe", "alpha", "beta", "gamma"]);
  assert.deepEqual(approved, ["/approved.png", "/approved.mp4", "/approved.mp3"]);
  assert.deepEqual(assigned, ["Image:/approved.png", "Video:/approved.mp4", "AudioPlayer:/approved.mp3"]);
  assert.equal(target.textContent, "OpenAlphaBetaGamma");
  assert.equal(target.querySelector("img,video,audio"), null, "approved media was assigned only in the discarded detached branch");
  assert.deepEqual(rt.getSurface("s")?.dataModel, {});
});

test("nested Basic Modals keep the closest dialog open, focused, and keyboard-contained", () => {
  const rt = runtime(); rt.process(create());
  rt.process(components([
    { id: "root", component: "Modal", trigger: "outer-trigger", content: "outer-content" },
    { id: "outer-trigger", component: "Button", child: "outer-label", action: { event: { name: "outer-trigger-leak", context: {} } } },
    { id: "outer-label", component: "Text", text: "Open outer" },
    { id: "outer-content", component: "Row", children: ["inner"] },
    { id: "inner", component: "Modal", trigger: "inner-trigger", content: "inner-content" },
    { id: "inner-trigger", component: "Button", child: "inner-label", action: { event: { name: "inner-trigger-leak", context: {} } } },
    { id: "inner-label", component: "Text", text: "Open inner" },
    { id: "inner-content", component: "Button", child: "action-label", action: { event: { name: "inside", context: {} } } },
    { id: "action-label", component: "Text", text: "Run inner action" },
  ]));
  const { target } = dom(); target.ownerDocument.body.append(target); const handoffs: unknown[] = [];
  const mounted = new WebSurfaceRenderer({ runtime: rt, renderers: new RendererRegistry(createBasicCatalogRendererRegistrations({ catalogId: "test" })), onServerEvent: (event) => handoffs.push(event) }).mount({ surfaceId: "s", target });
  assert.ok(mounted.ok);
  target.querySelector<HTMLButtonElement>("button")!.focus(); target.querySelector<HTMLButtonElement>("button")!.click();
  assert.equal(target.querySelectorAll('[role="dialog"]').length, 1); assert.match(target.textContent ?? "", /Open inner/);
  const innerTrigger = [...target.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Open inner")!;
  innerTrigger.focus(); innerTrigger.click();
  assert.equal(handoffs.length, 0); assert.equal(target.querySelectorAll('[role="dialog"]').length, 2);
  assert.ok(target.ownerDocument.activeElement === [...target.querySelectorAll<HTMLButtonElement>('button[aria-label="Close"]')].at(-1));

  let dialogs = [...target.querySelectorAll<HTMLElement>('[role="dialog"]')]; let inner = dialogs.at(-1)!;
  const innerAction = [...inner.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Run inner action")!;
  innerAction.focus(); innerAction.dispatchEvent(new innerAction.ownerDocument.defaultView!.KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
  assert.ok(target.ownerDocument.activeElement === inner.querySelector('button[aria-label="Close"]'));
  const innerClose = inner.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!; innerClose.focus();
  innerClose.dispatchEvent(new innerClose.ownerDocument.defaultView!.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
  assert.equal(target.ownerDocument.activeElement?.textContent, "Run inner action");
  innerAction.click(); assert.equal(handoffs.length, 1);

  inner = [...target.querySelectorAll<HTMLElement>('[role="dialog"]')].at(-1)!;
  inner.dispatchEvent(new inner.ownerDocument.defaultView!.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(target.querySelectorAll('[role="dialog"]').length, 1); assert.equal(target.ownerDocument.activeElement?.textContent, "Open inner");
  const reopenedTrigger = [...target.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Open inner")!;
  reopenedTrigger.focus(); reopenedTrigger.click();
  const innerBackdrop = [...target.querySelectorAll<HTMLElement>('[data-a2ui-modal-backdrop]')].at(-1)!; innerBackdrop.click();
  assert.equal(target.querySelectorAll('[role="dialog"]').length, 1); assert.equal(target.ownerDocument.activeElement?.textContent, "Open inner");
  const outerDialog = target.querySelector<HTMLElement>('[role="dialog"]')!;
  outerDialog.dispatchEvent(new outerDialog.ownerDocument.defaultView!.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(target.querySelector('[role="dialog"]'), null); assert.equal(target.ownerDocument.activeElement?.textContent, "Open outer");
});

test("Basic Modal intercepts a real Button trigger, persists open state, restores focus, and keeps content actions normal", () => {
  const rt = runtime(); rt.process(create());
  rt.process(components([
    { id: "root", component: "Modal", trigger: "trigger", content: "content" },
    { id: "trigger", component: "Button", child: "trigger-label", action: { event: { name: "leak", context: {} } } },
    { id: "trigger-label", component: "Text", text: "Open" },
    { id: "content", component: "Button", child: "content-label", action: { event: { name: "inside", context: {} } } },
    { id: "content-label", component: "Text", text: "Run" },
  ]));
  const { target } = dom(); target.ownerDocument.body.append(target); const handoffs: unknown[] = [];
  const mounted = new WebSurfaceRenderer({ runtime: rt, renderers: new RendererRegistry(createBasicCatalogRendererRegistrations({ catalogId: "test" })), onServerEvent: (event) => handoffs.push(event) }).mount({ surfaceId: "s", target });
  assert.ok(mounted.ok); const oldTrigger = target.querySelector<HTMLButtonElement>("button")!; oldTrigger.focus(); oldTrigger.click();
  assert.equal(handoffs.length, 0); assert.ok(target.querySelector('[role="dialog"]')); assert.equal(target.ownerDocument.activeElement?.getAttribute("aria-label"), "Close");
  const contentButton = [...target.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Run")!; contentButton.click();
  assert.equal(handoffs.length, 1); assert.ok(target.querySelector('[role="dialog"]'));
  rt.process(data({ unrelated: true })); assert.ok(target.querySelector('[role="dialog"]'));
  const oldClose = target.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!; oldClose.click();
  assert.equal(target.querySelector('[role="dialog"]'), null); assert.equal(target.ownerDocument.activeElement?.textContent, "Open");
  oldClose.click(); assert.equal(target.querySelector('[role="dialog"]'), null);
  oldTrigger.click(); assert.equal(target.querySelector('[role="dialog"]'), null, "old trigger is stale");
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
    ...(local === undefined ? {} : { functions: [{ catalogId: "interactive", name: "local", effect: "pure", implementation: local }] }),
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

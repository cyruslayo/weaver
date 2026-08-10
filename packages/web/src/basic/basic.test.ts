import assert from "node:assert/strict";
import { test } from "node:test";
import { Window } from "happy-dom";
import { RendererRegistry, type WebComponentInteractions, type WebComponentRenderInput, type WebComponentRenderer } from "../renderers/index.js";
import { createBasicCatalogRendererRegistrations } from "./createBasicCatalogRendererRegistrations.js";
import type { BasicIconResolver } from "./icon.js";
import type { BasicResourcePolicy } from "./media.js";

function setup(component: string, overrides: Partial<WebComponentRenderInput> = {}, resourcePolicy?: BasicResourcePolicy, iconResolver?: BasicIconResolver) {
  const window = new Window();
  const document = window.document as unknown as Document;
  const calls: string[] = [];
  const registration = createBasicCatalogRendererRegistrations({ catalogId: "test-basic", resourcePolicy, iconResolver })
    .find((candidate) => candidate.component === component);
  assert.ok(registration);
  const input = {
    document,
    catalogId: "test-basic",
    instance: { sourceComponentId: "root", component, scopePath: "/", definition: {}, properties: {}, relationships: [] },
    properties: {}, relationships: [],
    interactions: { registerControl: () => {}, getLocalState: (_key, fallback) => structuredClone(fallback), setLocalState: () => ({ ok: false, error: { code: "STALE_RENDER_INTERACTION" as const } }), writeInput: () => ({ ok: false, error: { code: "STALE_RENDER_INTERACTION" as const } }), dispatchAction: (property: string) => { calls.push(property); return { ok: false, error: { code: "STALE_RENDER_INTERACTION" as const } }; } },
    ...overrides,
  } as WebComponentRenderInput;
  return { document, calls, node: registration.render(input) as HTMLElement };
}

const child = (document: Document, text: string) => { const node = document.createElement("span"); node.textContent = text; return node; };

test("factory registers exactly the foundation components under the supplied catalog ID", () => {
  const registrations = createBasicCatalogRendererRegistrations({ catalogId: "not-an-official-url" });
  assert.deepEqual(registrations.map(({ component }) => component), ["Text", "Image", "Icon", "Video", "AudioPlayer", "Divider", "Row", "Column", "List", "Card", "Tabs", "Modal", "Button", "TextField", "CheckBox", "Slider", "ChoicePicker", "DateTimeInput"]);
  assert.ok(registrations.every(({ catalogId }) => catalogId === "not-an-official-url"));
});

test("Basic registrations compose with application registrations", () => {
  const application: WebComponentRenderer = ({ document }) => document.createElement("main");
  const registry = new RendererRegistry([...createBasicCatalogRendererRegistrations({ catalogId: "basic" }), { catalogId: "app", component: "Shell", render: application }]);
  assert.ok(registry.get("basic", "Text"));
  assert.equal(registry.get("app", "Shell"), application);
});

test("Icon renders explicit paths with inert native SVG DOM and fixed geometry", () => {
  const hostile = `M0 0 <script onclick="bad()">`;
  const svg = setup("Icon", { properties: { name: { svgPath: hostile } } }).node as unknown as SVGSVGElement;
  const path = svg.querySelector("path")!;
  assert.equal(svg.namespaceURI, "http://www.w3.org/2000/svg");
  assert.equal(path.namespaceURI, "http://www.w3.org/2000/svg");
  assert.equal(path.getAttribute("d"), hostile); assert.equal(path.getAttribute("fill"), "currentColor");
  assert.equal(svg.getAttribute("viewBox"), "0 0 24 24"); assert.equal(svg.getAttribute("width"), "24"); assert.equal(svg.getAttribute("height"), "24");
  assert.equal(svg.getAttribute("aria-hidden"), "true"); assert.equal(svg.getAttribute("focusable"), "false");
  assert.equal(svg.querySelector("script"), null); assert.equal(path.hasAttribute("onclick"), false);
});

test("Icon resolves names through its local host resolver and fails soft", () => {
  const requests: unknown[] = [];
  const resolver: BasicIconResolver = (request) => { requests.push(request); return request.name === "home" ? "M2 2" : undefined; };
  const named = setup("Icon", { properties: { name: "home" } }, undefined, resolver).node;
  assert.equal(named.querySelector("path")?.getAttribute("d"), "M2 2"); assert.deepEqual(requests, [{ name: "home" }]);
  const direct = setup("Icon", { properties: { name: { svgPath: "M3 3" } } }, undefined, resolver).node;
  assert.equal(direct.querySelector("path")?.getAttribute("d"), "M3 3"); assert.equal(requests.length, 1);
  for (const unresolved of [setup("Icon", { properties: { name: "home" } }).node, setup("Icon", { properties: { name: "unknown" } }, undefined, resolver).node, setup("Icon", { properties: { name: undefined } }).node]) {
    assert.equal(unresolved.getAttribute("data-a2ui-icon-state"), "unresolved"); assert.equal(unresolved.querySelector("path"), null);
  }
});

test("media defaults to deny and allows, rewrites, and identifies hydrated non-empty URLs", () => {
  for (const [component, selector] of [["Image", "img"], ["Video", "video"], ["AudioPlayer", "audio"]] as const) {
    const blocked = setup(component, { properties: { url: "https://agent.example/media" } }).node.querySelector(selector) ?? setup(component, { properties: { url: "https://agent.example/media" } }).node;
    assert.equal(blocked.hasAttribute("src"), false);
  }
  const requests: unknown[] = [];
  const policy: BasicResourcePolicy = (request) => { requests.push(request); return request.kind === "image" ? "/proxy/media/123" : request.url; };
  const image = setup("Image", { properties: { url: "https://agent.example/image.png" } }, policy).node;
  const video = setup("Video", { properties: { url: "/video.mp4" } }, policy).node as HTMLVideoElement;
  const audioFigure = setup("AudioPlayer", { properties: { url: "/audio.mp3" } }, policy).node;
  assert.equal(image.getAttribute("src"), "/proxy/media/123");
  assert.equal(video.getAttribute("src"), "/video.mp4");
  assert.equal(audioFigure.querySelector("audio")?.getAttribute("src"), "/audio.mp3");
  assert.deepEqual(requests, [{ kind: "image", url: "https://agent.example/image.png" }, { kind: "video", url: "/video.mp4" }, { kind: "audio", url: "/audio.mp3" }]);
});

test("media skips unavailable URLs and denied or empty rewrites", () => {
  let calls = 0;
  const policy: BasicResourcePolicy = () => { calls++; return undefined; };
  assert.equal(setup("Image", { properties: { url: "" } }, policy).node.hasAttribute("src"), false);
  assert.equal(setup("Video", { properties: { url: "  " } }, policy).node.hasAttribute("src"), false);
  assert.equal(calls, 0);
  assert.equal(setup("Image", { properties: { url: "/denied" } }, policy).node.getAttribute("data-a2ui-resource-state"), "blocked");
  assert.equal(calls, 1);
});

test("Image maps native accessibility, fit, and variant behavior", () => {
  const fits = { contain: "contain", cover: "cover", fill: "fill", none: "none", scaleDown: "scale-down" };
  for (const [fit, css] of Object.entries(fits)) assert.equal(setup("Image", { properties: { fit } }).node.style.objectFit, css);
  const unsafe = setup("Image", { properties: { description: "<script>x</script>", fit: "bad", variant: "avatar" } }).node as HTMLImageElement;
  assert.equal(unsafe.tagName, "IMG"); assert.equal(unsafe.alt, "<script>x</script>"); assert.equal(unsafe.querySelector("script"), null);
  assert.equal(unsafe.style.objectFit, "fill"); assert.equal(unsafe.getAttribute("data-a2ui-variant"), "avatar"); assert.equal(unsafe.style.borderRadius, "50%");
  assert.equal((setup("Image").node as HTMLImageElement).alt, "");
  for (const variant of ["icon", "avatar", "smallFeature", "mediumFeature", "largeFeature", "header"]) assert.equal(setup("Image", { properties: { variant } }).node.getAttribute("data-a2ui-variant"), variant);
});

test("Video and AudioPlayer use native controls without autoplay and safe captions", () => {
  const video = setup("Video").node as HTMLVideoElement;
  assert.equal(video.tagName, "VIDEO"); assert.equal(video.controls, true); assert.equal(video.autoplay, false);
  const figure = setup("AudioPlayer", { properties: { description: "<script>alert(1)</script>" } }).node;
  const audio = figure.querySelector("audio")!;
  assert.equal(audio.controls, true); assert.equal(audio.autoplay, false); assert.equal(figure.querySelector("figcaption")?.textContent, "<script>alert(1)</script>"); assert.equal(figure.querySelector("script"), null);
  assert.equal(setup("AudioPlayer").node.querySelector("figcaption"), null);
});

test("Text selects native semantic elements and defaults to body", () => {
  const variants = { h1: "H1", h2: "H2", h3: "H3", h4: "H4", h5: "H5", caption: "SMALL", body: "P" };
  for (const [variant, tag] of Object.entries(variants)) assert.equal(setup("Text", { properties: { text: "x", variant } }).node.tagName, tag);
  assert.equal(setup("Text", { properties: { text: "x" } }).node.tagName, "P");
});

test("Text uses textContent and renders missing or null text empty", () => {
  const unsafe = setup("Text", { properties: { text: "<script>alert(1)</script>" } }).node;
  assert.equal(unsafe.textContent, "<script>alert(1)</script>");
  assert.equal(unsafe.querySelector("script"), null);
  assert.equal(setup("Text", { properties: { text: undefined } }).node.textContent, "");
  assert.equal(setup("Text", { properties: { text: null } }).node.textContent, "");
});

test("Row and Column preserve children and apply mapped layout defaults", () => {
  for (const [component, direction] of [["Row", "row"], ["Column", "column"]] as const) {
    const base = setup(component); const children = [child(base.document, "a"), child(base.document, "b")];
    const rendered = setup(component, { relationships: [{ kind: "list", property: "children", location: [{ kind: "property", name: "children" }], children }] }).node;
    assert.equal(rendered.textContent, "ab"); assert.equal(rendered.style.display, "flex"); assert.equal(rendered.style.flexDirection, direction);
    assert.equal(rendered.style.justifyContent, "flex-start"); assert.equal(rendered.style.alignItems, "stretch");
    const mapped = setup(component, { properties: { justify: "spaceBetween", align: "end" } }).node;
    assert.equal(mapped.style.justifyContent, "space-between"); assert.equal(mapped.style.alignItems, "flex-end");
  }
});

test("List wraps ordered children with list semantics, direction, alignment, and empty support", () => {
  const base = setup("List"); const children = [child(base.document, "a"), child(base.document, "b")];
  const list = setup("List", { properties: { direction: "horizontal", align: "center" }, relationships: [{ kind: "template", property: "children", location: [{ kind: "property", name: "children" }], children }] }).node;
  assert.equal(list.getAttribute("role"), "list"); assert.equal(list.style.flexDirection, "row"); assert.equal(list.style.alignItems, "center");
  assert.deepEqual([...list.children].map((item) => [item.getAttribute("role"), item.textContent]), [["listitem", "a"], ["listitem", "b"]]);
  assert.equal(setup("List").node.children.length, 0);
});

test("Card appends one resolved child and tolerates a missing child", () => {
  const base = setup("Card"); const content = child(base.document, "content");
  assert.equal(setup("Card", { relationships: [{ kind: "single", property: "child", location: [{ kind: "property", name: "child" }], child: content }] }).node.textContent, "content");
  assert.equal(setup("Card").node.childNodes.length, 0);
});

test("Tabs maps repeated structural child locations and exposes accessible positional headers", () => {
  const base = setup("Tabs");
  const first = child(base.document, "first");
  const second = child(base.document, "second");
  const rendered = setup("Tabs", {
    properties: { tabs: [{ title: "Overview" }, { title: undefined }, { title: null }] },
    relationships: [
      { kind: "single", property: "child", location: [{ kind: "property", name: "tabs" }, { kind: "arrayIndex", index: 1 }, { kind: "property", name: "child" }], child: second },
      { kind: "single", property: "child", location: [{ kind: "property", name: "tabs" }, { kind: "arrayIndex", index: 0 }, { kind: "property", name: "child" }], child: first },
    ],
  }).node;
  const buttons = [...rendered.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const panel = rendered.querySelector<HTMLElement>('[role="tabpanel"]')!;
  assert.deepEqual(buttons.map((button) => button.textContent), ["Overview", "", ""]);
  assert.deepEqual(buttons.map((button) => [button.type, button.getAttribute("aria-selected"), button.tabIndex]), [["button", "true", 0], ["button", "false", -1], ["button", "false", -1]]);
  assert.equal(rendered.querySelector('[role="tablist"]')?.children.length, 3);
  assert.equal(panel.textContent, "first");
  assert.equal(buttons[0]?.getAttribute("aria-controls"), panel.id);
  assert.equal(panel.getAttribute("aria-labelledby"), buttons[0]?.id);
  assert.equal(rendered.textContent?.includes("second"), false);
  assert.equal([...buttons, panel].some((element) => element.id.includes("root") || element.id.includes("/")), false);
});

test("Modal renders direct trigger/content branches, intercepts trigger actions, and supplies fallback keyboard semantics", () => {
  const base = setup("Modal");
  const button = base.document.createElement("button"); button.type = "button"; button.textContent = "Open";
  let childActions = 0; button.addEventListener("click", () => childActions++);
  const state: unknown[] = []; const controls: Array<[Element, string]> = [];
  const modalInteractions = (open: unknown): WebComponentInteractions => ({
    registerControl: (element: Element, key: string) => { controls.push([element, key]); },
    getLocalState: <T>(_key: string, _fallback: T) => open as T,
    setLocalState: (_key: string, value: unknown) => { state.push(value); return { ok: true as const }; },
    writeInput: () => ({ ok: false as const, error: { code: "STALE_RENDER_INTERACTION" as const } }),
    dispatchAction: () => ({ ok: false as const, error: { code: "STALE_RENDER_INTERACTION" as const } }),
  });
  const closed = setup("Modal", { relationships: [
    { kind: "single", property: "trigger", location: [{ kind: "property", name: "trigger" }], child: button },
    { kind: "single", property: "content", location: [{ kind: "property", name: "content" }], child: child(base.document, "Hidden") },
  ], interactions: modalInteractions(false) }).node;
  assert.equal(closed.textContent, "Open"); assert.equal(closed.textContent?.includes("Hidden"), false);
  button.click(); assert.deepEqual(state, [true]); assert.equal(childActions, 0); assert.equal(controls.at(-1)?.[1], "modal-focus");

  state.length = 0;
  const textTrigger = child(base.document, "Details");
  const fallback = setup("Modal", { relationships: [{ kind: "single", property: "trigger", location: [{ kind: "property", name: "trigger" }], child: textTrigger }], interactions: modalInteractions(false) }).node;
  const wrapper = fallback.querySelector<HTMLElement>('[role="button"]')!;
  assert.equal(wrapper.tabIndex, 0); fireKey(wrapper, "keydown", "Enter"); assert.deepEqual(state, [true]);
  state.length = 0; fireKey(wrapper, "keydown", " "); fireKey(wrapper, "keyup", " "); assert.deepEqual(state, [true]);
  assert.equal(setup("Modal", { interactions: modalInteractions(true) }).node.childNodes.length, 0, "missing trigger stays empty");
});

test("open Modal has accessible dialog, local dismissal, content isolation, and focus wrapping", () => {
  const base = setup("Modal"); const content = base.document.createElement("section");
  const input = base.document.createElement("input"); const action = base.document.createElement("button"); action.textContent = "Act"; content.append(input, action);
  const states: unknown[] = []; const controls: Array<[Element, string]> = [];
  const node = setup("Modal", { relationships: [
    { kind: "single", property: "trigger", location: [{ kind: "property", name: "trigger" }], child: child(base.document, "Trigger") },
    { kind: "single", property: "content", location: [{ kind: "property", name: "content" }], child: content },
  ], interactions: {
    registerControl: (element: Element, key: string) => { controls.push([element, key]); }, getLocalState: <T>(_key: string, _fallback: T) => true as T,
    setLocalState: (_key: string, value: unknown) => { states.push(value); return { ok: true as const }; },
    writeInput: () => ({ ok: false as const, error: { code: "STALE_RENDER_INTERACTION" as const } }), dispatchAction: () => ({ ok: false as const, error: { code: "STALE_RENDER_INTERACTION" as const } }),
  } }).node;
  const backdrop = node.querySelector<HTMLElement>('[data-a2ui-modal-backdrop]')!;
  const dialog = node.querySelector<HTMLElement>('[role="dialog"]')!; const close = dialog.querySelector<HTMLButtonElement>('button')!;
  assert.equal(dialog.getAttribute("aria-modal"), "true"); assert.equal(dialog.getAttribute("aria-label"), "Modal dialog"); assert.equal(close.type, "button"); assert.equal(close.getAttribute("aria-label"), "Close");
  assert.equal(node.textContent?.includes("Trigger"), false); assert.equal(node.textContent?.includes("Act"), true); assert.equal(controls.at(-1)?.[1], "modal-focus");
  states.length = 0; content.click(); assert.deepEqual(states, []); backdrop.click(); assert.deepEqual(states, [false]);
  states.length = 0; close.click(); assert.deepEqual(states, [false]); states.length = 0; input.focus(); fireKey(dialog, "keydown", "Escape"); assert.deepEqual(states, [false]);
});

test("Divider uses native horizontal and semantic minimal vertical forms", () => {
  assert.equal(setup("Divider").node.tagName, "HR");
  assert.equal(setup("Divider", { properties: { axis: "horizontal" } }).node.tagName, "HR");
  const vertical = setup("Divider", { properties: { axis: "vertical" } }).node;
  assert.equal(vertical.tagName, "DIV"); assert.equal(vertical.getAttribute("role"), "separator"); assert.equal(vertical.getAttribute("aria-orientation"), "vertical");
});

test("Button appends child, emits one action, and exposes only safe variant hooks", () => {
  const base = setup("Button"); const label = child(base.document, "Go");
  const rendered = setup("Button", { properties: { variant: "primary" }, relationships: [{ kind: "single", property: "child", location: [{ kind: "property", name: "child" }], child: label }] });
  assert.equal(rendered.node.tagName, "BUTTON"); assert.equal((rendered.node as HTMLButtonElement).type, "button"); assert.equal(rendered.node.textContent, "Go");
  assert.equal(rendered.node.getAttribute("data-a2ui-variant"), "primary"); rendered.node.click(); assert.deepEqual(rendered.calls, ["action"]);
  assert.equal(setup("Button", { properties: { variant: "anything" } }).node.getAttribute("data-a2ui-variant"), "default");
});

test("Button mirrors supplied checks and disables a progressively empty control", () => {
  for (const status of ["invalid", "pending", "error"] as const) assert.equal((setup("Button", { checks: { sourceComponentId: "root", scopePath: "/", checkable: true, status, checks: [] } }).node as HTMLButtonElement).disabled, true);
  const base = setup("Button"); const label = child(base.document, "Go");
  const valid = setup("Button", { checks: { sourceComponentId: "root", scopePath: "/", checkable: true, status: "valid", checks: [] }, relationships: [{ kind: "single", property: "child", location: [{ kind: "property", name: "child" }], child: label }] }).node as HTMLButtonElement;
  assert.equal(valid.disabled, false);
  assert.equal((setup("Button").node as HTMLButtonElement).disabled, true);
});

test("Basic inputs use native controls and normalized writes", () => {
  const cases = [
    ["TextField", { label: "Name", value: "42.5", variant: "number" }, "input", "input"],
    ["CheckBox", { label: "Ready", value: true }, "input", "change"],
    ["Slider", { max: 10, value: 2.5 }, "input", "input"],
  ] as const;
  for (const [component, properties, selector, event] of cases) {
    const writes: unknown[] = [];
    const rendered = setup(component, { properties, interactions: interactions(writes) }).node;
    const control = rendered.querySelector(selector) as HTMLInputElement;
    if (component === "TextField") { assert.equal(control.type, "number"); control.value = "7.5"; }
    if (component === "CheckBox") { assert.equal(control.checked, true); control.checked = false; }
    if (component === "Slider") { assert.equal(control.min, "0"); assert.equal(control.max, "10"); assert.equal(control.step, "any"); control.value = "4.25"; }
    fire(control, event);
    assert.deepEqual(writes[0], ["value", component === "CheckBox" ? false : component === "Slider" ? 4.25 : "7.5"]);
  }
  assert.equal((setup("Slider", { properties: { max: 10 } }).node.querySelector("input") as HTMLInputElement).disabled, true);
});

test("TextField defers writes until IME composition ends", () => {
  const writes: unknown[] = [];
  const control = setup("TextField", { properties: { label: undefined }, interactions: interactions(writes) }).node.querySelector("input")!;
  fire(control, "compositionstart"); control.value = "に"; fire(control, "input"); control.value = "日本"; fire(control, "input"); fire(control, "compositionend");
  assert.deepEqual(writes, [["value", "日本"]]);
});

test("ChoicePicker filters labels ephemerally and writes string arrays", () => {
  const writes: unknown[] = [];
  const node = setup("ChoicePicker", { properties: { value: ["a"], filterable: true, displayStyle: "chips", options: [{ label: "Alpha", value: "a" }, { label: undefined, value: "b" }, { label: "Beta", value: "c" }] }, interactions: interactions(writes) }).node;
  assert.equal(node.getAttribute("data-a2ui-display-style"), "chips");
  const filter = node.querySelector('input[type="search"]') as HTMLInputElement; filter.value = "BET"; fire(filter, "input");
  assert.deepEqual([...node.querySelectorAll('fieldset > label:has(input[type="radio"])')].map((row) => (row as HTMLElement).hidden), [true, true, false]); assert.deepEqual(writes, []);
  const radio = node.querySelectorAll('input[type="radio"]')[2] as HTMLInputElement; radio.checked = true; fire(radio, "change"); assert.deepEqual(writes, [["value", ["c"]]]);
});

test("DateTimeInput applies safe native date/time policy", () => {
  const writes: unknown[] = [];
  const date = setup("DateTimeInput", { properties: { enableDate: true, value: "2026-08-09", min: "2026-01-01", max: "bad" }, interactions: interactions(writes) }).node.querySelector("input") as HTMLInputElement;
  assert.equal(date.type, "date"); assert.equal(date.value, "2026-08-09"); assert.equal(date.min, "2026-01-01"); assert.equal(date.hasAttribute("max"), false);
  date.value = "2026-08-10"; fire(date, "change"); assert.deepEqual(writes, [["value", "2026-08-10"]]);
  const invalid = setup("DateTimeInput", { properties: { enableDate: true, enableTime: true, value: "bad" } }).node.querySelector("input") as HTMLInputElement; assert.equal(invalid.value, "");
  const disabled = setup("DateTimeInput", { properties: { value: "opaque" } }).node.querySelector("input") as HTMLInputElement; assert.equal(disabled.disabled, true); assert.equal(disabled.value, "opaque");
});

test("invalid inputs remain editable and expose only failed validation messages", () => {
  const checks = { sourceComponentId: "root", scopePath: "/", checkable: true, status: "invalid" as const, checks: [{ index: 0, status: "failed" as const, message: "Required", issues: [] }, { index: 1, status: "pending" as const, message: "Wait", issues: [] }] };
  const node = setup("TextField", { properties: { label: "Name" }, checks }).node; const control = node.querySelector("input") as HTMLInputElement;
  assert.equal(control.disabled, false); assert.equal(control.getAttribute("aria-invalid"), "true"); assert.ok(control.getAttribute("aria-describedby")); assert.equal(node.textContent?.includes("Required"), true); assert.equal(node.textContent?.includes("Wait"), false);
});

function interactions(writes: unknown[]) { return { registerControl: () => {}, getLocalState: <T>(_key: string, fallback: T) => structuredClone(fallback), setLocalState: () => ({ ok: false as const, error: { code: "STALE_RENDER_INTERACTION" as const } }), writeInput: (property: string, value: unknown) => { writes.push([property, value]); return { ok: false as const, error: { code: "STALE_RENDER_INTERACTION" as const } }; }, dispatchAction: () => ({ ok: false as const, error: { code: "STALE_RENDER_INTERACTION" as const } }) }; }
function fire(node: Element, type: string): void { node.dispatchEvent(new node.ownerDocument.defaultView!.Event(type, { bubbles: true })); }
function fireKey(node: Element, type: "keydown" | "keyup", key: string, shiftKey = false): void { node.dispatchEvent(new node.ownerDocument.defaultView!.KeyboardEvent(type, { bubbles: true, key, shiftKey })); }

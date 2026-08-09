import assert from "node:assert/strict";
import { test } from "node:test";
import { Window } from "happy-dom";
import { RendererRegistry, type WebComponentRenderInput, type WebComponentRenderer } from "../renderers/index.js";
import { createBasicCatalogRendererRegistrations } from "./createBasicCatalogRendererRegistrations.js";

function setup(component: string, overrides: Partial<WebComponentRenderInput> = {}) {
  const window = new Window();
  const document = window.document as unknown as Document;
  const calls: string[] = [];
  const registration = createBasicCatalogRendererRegistrations({ catalogId: "test-basic" })
    .find((candidate) => candidate.component === component);
  assert.ok(registration);
  const input = {
    document,
    catalogId: "test-basic",
    instance: { sourceComponentId: "root", component, scopePath: "/", definition: {}, properties: {}, relationships: [] },
    properties: {}, relationships: [],
    interactions: { writeInput: () => ({ ok: false, error: { code: "STALE_RENDER_INTERACTION" as const } }), dispatchAction: (property: string) => { calls.push(property); return { ok: false, error: { code: "STALE_RENDER_INTERACTION" as const } }; } },
    ...overrides,
  } as WebComponentRenderInput;
  return { document, calls, node: registration.render(input) as HTMLElement };
}

const child = (document: Document, text: string) => { const node = document.createElement("span"); node.textContent = text; return node; };

test("factory registers exactly the foundation components under the supplied catalog ID", () => {
  const registrations = createBasicCatalogRendererRegistrations({ catalogId: "not-an-official-url" });
  assert.deepEqual(registrations.map(({ component }) => component), ["Text", "Divider", "Row", "Column", "List", "Card", "Button"]);
  assert.ok(registrations.every(({ catalogId }) => catalogId === "not-an-official-url"));
});

test("Basic registrations compose with application registrations", () => {
  const application: WebComponentRenderer = ({ document }) => document.createElement("main");
  const registry = new RendererRegistry([...createBasicCatalogRendererRegistrations({ catalogId: "basic" }), { catalogId: "app", component: "Shell", render: application }]);
  assert.ok(registry.get("basic", "Text"));
  assert.equal(registry.get("app", "Shell"), application);
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
    const rendered = setup(component, { relationships: [{ kind: "list", property: "children", children }] }).node;
    assert.equal(rendered.textContent, "ab"); assert.equal(rendered.style.display, "flex"); assert.equal(rendered.style.flexDirection, direction);
    assert.equal(rendered.style.justifyContent, "flex-start"); assert.equal(rendered.style.alignItems, "stretch");
    const mapped = setup(component, { properties: { justify: "spaceBetween", align: "end" } }).node;
    assert.equal(mapped.style.justifyContent, "space-between"); assert.equal(mapped.style.alignItems, "flex-end");
  }
});

test("List wraps ordered children with list semantics, direction, alignment, and empty support", () => {
  const base = setup("List"); const children = [child(base.document, "a"), child(base.document, "b")];
  const list = setup("List", { properties: { direction: "horizontal", align: "center" }, relationships: [{ kind: "template", property: "children", children }] }).node;
  assert.equal(list.getAttribute("role"), "list"); assert.equal(list.style.flexDirection, "row"); assert.equal(list.style.alignItems, "center");
  assert.deepEqual([...list.children].map((item) => [item.getAttribute("role"), item.textContent]), [["listitem", "a"], ["listitem", "b"]]);
  assert.equal(setup("List").node.children.length, 0);
});

test("Card appends one resolved child and tolerates a missing child", () => {
  const base = setup("Card"); const content = child(base.document, "content");
  assert.equal(setup("Card", { relationships: [{ kind: "single", property: "child", child: content }] }).node.textContent, "content");
  assert.equal(setup("Card").node.childNodes.length, 0);
});

test("Divider uses native horizontal and semantic minimal vertical forms", () => {
  assert.equal(setup("Divider").node.tagName, "HR");
  assert.equal(setup("Divider", { properties: { axis: "horizontal" } }).node.tagName, "HR");
  const vertical = setup("Divider", { properties: { axis: "vertical" } }).node;
  assert.equal(vertical.tagName, "DIV"); assert.equal(vertical.getAttribute("role"), "separator"); assert.equal(vertical.getAttribute("aria-orientation"), "vertical");
});

test("Button appends child, emits one action, and exposes only safe variant hooks", () => {
  const base = setup("Button"); const label = child(base.document, "Go");
  const rendered = setup("Button", { properties: { variant: "primary" }, relationships: [{ kind: "single", property: "child", child: label }] });
  assert.equal(rendered.node.tagName, "BUTTON"); assert.equal((rendered.node as HTMLButtonElement).type, "button"); assert.equal(rendered.node.textContent, "Go");
  assert.equal(rendered.node.getAttribute("data-a2ui-variant"), "primary"); rendered.node.click(); assert.deepEqual(rendered.calls, ["action"]);
  assert.equal(setup("Button", { properties: { variant: "anything" } }).node.getAttribute("data-a2ui-variant"), "default");
});

test("Button mirrors supplied checks and disables a progressively empty control", () => {
  for (const status of ["invalid", "pending", "error"] as const) assert.equal((setup("Button", { checks: { sourceComponentId: "root", scopePath: "/", checkable: true, status, checks: [] } }).node as HTMLButtonElement).disabled, true);
  const base = setup("Button"); const label = child(base.document, "Go");
  const valid = setup("Button", { checks: { sourceComponentId: "root", scopePath: "/", checkable: true, status: "valid", checks: [] }, relationships: [{ kind: "single", property: "child", child: label }] }).node as HTMLButtonElement;
  assert.equal(valid.disabled, false);
  assert.equal((setup("Button").node as HTMLButtonElement).disabled, true);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import type { A2UIComponent } from "@cylayo/weaver-core";
import { createBasicWebRuntime, RendererRegistry } from "@cylayo/weaver-web";
import { Window } from "happy-dom";
import { COOKBOOK_CATALOG_ID, cookbookCatalog } from "./catalog.js";
import { cookbookCatalogRendererRegistrations } from "./renderers.js";

const SURFACE_ID = "cookbook-renderers";
const COOKBOOK_COMPONENTS = ["Column", "Text", "Card", "Button", "DataTable", "BarChart"] as const;

test("the single registration list covers all five cookbook components exactly once", () => {
  for (const component of COOKBOOK_COMPONENTS) {
    const matches = cookbookCatalogRendererRegistrations.filter(
      (registration) => registration.catalogId === COOKBOOK_CATALOG_ID && registration.component === component,
    );
    assert.equal(matches.length, 1, `${component} must be registered exactly once under the cookbook id`);
  }
  assert.equal(cookbookCatalogRendererRegistrations.length, COOKBOOK_COMPONENTS.length, "no other registrations");
});

test("the registration list builds a RendererRegistry without throwing", () => {
  const registry = new RendererRegistry(cookbookCatalogRendererRegistrations);
  for (const component of COOKBOOK_COMPONENTS) {
    assert.equal(registry.has(COOKBOOK_CATALOG_ID, component), true, `${component} under the cookbook id`);
  }
});

test("a duplicate registration is rejected, so the single list is what keeps the registry valid", () => {
  assert.throws(() => new RendererRegistry([...cookbookCatalogRendererRegistrations, cookbookCatalogRendererRegistrations[0]!]));
});

test("the list passed as additionalRenderers creates the cookbook web runtime without throwing", () => {
  const created = createBasicWebRuntime({
    additionalCatalogs: [cookbookCatalog],
    additionalRenderers: cookbookCatalogRendererRegistrations,
  });
  assert.equal(created.ok, true, created.ok ? "" : JSON.stringify(created.error));
  if (!created.ok) return;

  const web = created.value;
  assert.equal(web.runtime.process({ version: "v0.9.1", createSurface: { surfaceId: SURFACE_ID, catalogId: COOKBOOK_CATALOG_ID } }).ok, true);
  const components: A2UIComponent[] = [
    { id: "root", component: "Column", children: ["card"] },
    { id: "card", component: "Card", child: "content" },
    { id: "content", component: "Column", children: ["title", "table", "chart"] },
    { id: "title", component: "Text", text: "Overview" },
    { id: "table", component: "DataTable", columns: [{ key: "name", header: "Name" }], rows: [{ name: "Ada" }] } as unknown as A2UIComponent,
    { id: "chart", component: "BarChart", title: "Counts", values: [{ label: "Open", value: 2 }], maxBars: 5 } as unknown as A2UIComponent,
  ];
  assert.equal(web.runtime.process({ version: "v0.9.1", updateComponents: { surfaceId: SURFACE_ID, components } }).ok, true);
  const window = new Window();
  const target = window.document.createElement("main") as unknown as Element;
  assert.equal(web.mount({ surfaceId: SURFACE_ID, target }).ok, true);
  for (const component of ["Column", "Text", "Card", "BarChart"]) {
    assert.ok(target.querySelector(`[data-a2ui-component=${component}]`) !== null, `${component} must render`);
  }
  assert.ok(target.querySelector("table") !== null, "DataTable must render as a table");
  assert.equal(target.querySelectorAll("button").length, 0, "the read-only DataTable renders no button");
});

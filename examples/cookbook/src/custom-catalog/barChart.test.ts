import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { A2UIComponent, HydratedComponentInstance, HydratedValue, JsonObject, JsonValue } from "@cylayo/weaver-core";
import { createBasicWebRuntime, type WebComponentRenderInput } from "@cylayo/weaver-web";
import { Window } from "happy-dom";
import { COOKBOOK_CATALOG_ID, COOKBOOK_MAX_BARS, cookbookCatalog } from "./catalog.js";
import { barChartModel, renderBarChart } from "./barChart.js";
import { cookbookCatalogRendererRegistrations } from "./renderers.js";

const SURFACE_ID = "cookbook-barchart";

/**
 * Renders the BarChart renderer directly, with hydrated properties supplied by the test.
 * The runtime tests below use the shipped cookbook catalog, so the same values also flow through Core.
 * This direct form isolates the renderer's own behaviour.
 */
function renderDirect(properties: Record<string, HydratedValue>): { window: Window; target: Element } {
  const window = new Window();
  const document = window.document as unknown as Document;
  const instance = { sourceComponentId: "chart", component: "BarChart", scopePath: "/", properties, relationships: [], unresolved: [] } as HydratedComponentInstance;
  const input = {
    document,
    surfaceId: SURFACE_ID,
    catalogId: COOKBOOK_CATALOG_ID,
    instance,
    properties,
    relationships: [],
    interactions: {
      writeInput: () => { throw new Error("not used"); },
      dispatchAction: () => { throw new Error("not used"); },
      getLocalState: (_key: string, fallback: JsonValue) => fallback,
      setLocalState: () => { throw new Error("not used"); },
      registerControl: () => undefined,
    },
  } as unknown as WebComponentRenderInput;
  const target = window.document.createElement("main") as unknown as Element;
  target.append(renderBarChart(input) as unknown as Node);
  return { window, target };
}

function chart(target: Element): Element {
  const element = target.querySelector("[data-a2ui-component=BarChart]");
  assert.ok(element !== null, "the BarChart must render");
  return element;
}

function bars(target: Element): Element[] {
  return [...target.querySelectorAll("[data-chart-bar]")];
}

function barChartComponent(overrides: Partial<JsonObject> = {}): A2UIComponent {
  return { id: "root", component: "BarChart", title: "By status", values: { path: "/stats/byStatus" }, maxBars: 10, ...overrides } as A2UIComponent;
}

test("the BarChart renders one bar per item and updates when the values change", () => {
  const first = renderDirect({ title: "By status", values: [{ label: "Open", value: 3 }, { label: "Closed", value: 5 }], maxBars: 10 });
  assert.equal(chart(first.target).getAttribute("data-weaver-chart-state"), "ready");
  assert.deepEqual(bars(first.target).map((bar) => bar.getAttribute("data-chart-label")), ["Open", "Closed"]);
  assert.deepEqual(bars(first.target).map((bar) => bar.getAttribute("data-chart-value")), ["3", "5"]);
  assert.deepEqual(bars(first.target).map((bar) => bar.querySelector("title")?.textContent), ["Open: 3", "Closed: 5"]);

  const next = renderDirect({ title: "By status", values: [{ label: "Open", value: 1 }, { label: "Closed", value: 4 }, { label: "New", value: 2 }], maxBars: 10 });
  assert.deepEqual(bars(next.target).map((bar) => bar.getAttribute("data-chart-label")), ["Open", "Closed", "New"]);
  assert.equal(next.target.querySelector("table[data-weaver-chart-table]")?.querySelectorAll("tbody tr").length, 3);
});

test("the BarChart renders bound data through the runtime and updates when the data model changes", () => {
  const created = createBasicWebRuntime({ additionalCatalogs: [cookbookCatalog], additionalRenderers: cookbookCatalogRendererRegistrations });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const web = created.value;
  assert.equal(web.runtime.process({ version: "v0.9.1", createSurface: { surfaceId: SURFACE_ID, catalogId: COOKBOOK_CATALOG_ID } }).ok, true);
  assert.equal(web.runtime.process({ version: "v0.9.1", updateComponents: { surfaceId: SURFACE_ID, components: [barChartComponent()] } }).ok, true);
  assert.equal(web.runtime.process({ version: "v0.9.1", updateDataModel: { surfaceId: SURFACE_ID, value: { stats: { byStatus: [{ label: "Open", value: 3 }] } } } }).ok, true);
  const window = new Window();
  const target = window.document.createElement("main") as unknown as Element;
  assert.equal(web.mount({ surfaceId: SURFACE_ID, target }).ok, true);
  assert.deepEqual(bars(target).map((bar) => bar.getAttribute("data-chart-label")), ["Open"]);
  assert.deepEqual(bars(target).map((bar) => bar.getAttribute("data-chart-value")), ["3"]);

  assert.equal(web.runtime.process({ version: "v0.9.1", updateDataModel: { surfaceId: SURFACE_ID, value: { stats: { byStatus: [{ label: "Open", value: 1 }, { label: "Done", value: 4 }] } } } }).ok, true);
  assert.deepEqual(bars(target).map((bar) => bar.getAttribute("data-chart-label")), ["Open", "Done"]);
  assert.deepEqual(bars(target).map((bar) => bar.getAttribute("data-chart-value")), ["1", "4"]);
});

test("the BarChart also accepts a literal array of {label, value} through the runtime", () => {
  const created = createBasicWebRuntime({ additionalCatalogs: [cookbookCatalog], additionalRenderers: cookbookCatalogRendererRegistrations });
  assert.ok(created.ok);
  if (!created.ok) return;
  const web = created.value;
  assert.equal(web.runtime.process({ version: "v0.9.1", createSurface: { surfaceId: SURFACE_ID, catalogId: COOKBOOK_CATALOG_ID } }).ok, true);
  assert.equal(web.runtime.process({ version: "v0.9.1", updateComponents: { surfaceId: SURFACE_ID, components: [barChartComponent({ values: [{ label: "Open", value: 2 }] })] } }).ok, true);
  const window = new Window();
  const target = window.document.createElement("main") as unknown as Element;
  assert.equal(web.mount({ surfaceId: SURFACE_ID, target }).ok, true);
  assert.deepEqual(bars(target).map((bar) => bar.getAttribute("data-chart-label")), ["Open"]);
});

test("the empty state renders with no SVG and no table", () => {
  const { target } = renderDirect({ title: "By status", values: [], maxBars: 10 });
  const element = chart(target);
  assert.equal(element.getAttribute("data-weaver-chart-state"), "empty");
  assert.equal(element.querySelector("svg") === null, true, "no svg");
  assert.equal(element.querySelector("table") === null, true, "no table");
  assert.equal(element.querySelector("[data-weaver-chart-empty]")?.textContent, "No data to chart.");
  assert.equal(element.querySelector("[data-weaver-chart-title]")?.textContent, "By status");
  assert.equal(element.getAttribute("aria-label"), "By status");
});

test("the accessible name and the fallback table are present", () => {
  const { target } = renderDirect({ title: "By status", values: [{ label: "Open", value: 3 }, { label: "Closed", value: 5 }], maxBars: 10 });
  const svg = target.querySelector("svg");
  assert.ok(svg !== null, "the svg must render");
  assert.equal(svg.getAttribute("role"), "img");
  const labelledBy = svg.getAttribute("aria-labelledby");
  assert.ok(labelledBy);
  assert.equal(target.querySelector(`#${labelledBy}`)?.textContent, "By status");
  assert.equal(svg.querySelector(":scope > title")?.textContent, "By status");

  const table = target.querySelector("table[data-weaver-chart-table]") as HTMLTableElement | null;
  assert.ok(table !== null, "the fallback table must render");
  assert.equal(table.querySelector("caption")?.textContent, "By status");
  assert.deepEqual([...table.querySelectorAll("thead th")].map((cell) => cell.textContent), ["Label", "Value"]);
  assert.deepEqual([...table.querySelectorAll("tbody tr")].map((row) => [...row.children].map((cell) => cell.textContent)), [["Open", "3"], ["Closed", "5"]]);
  assert.match(table.getAttribute("style") ?? "", /clip: rect\(0 0 0 0\)/, "the table is visually hidden, not removed");
});

test("negative and non-numeric values are clamped to zero and draw no bar", () => {
  const values = [{ label: "Refunds", value: -4 }, { label: "Open", value: 2 }, { label: "Broken", value: "many" }, "skipped"];
  const model = barChartModel({ title: "T", values: values as unknown as HydratedValue, maxBars: 10 });
  assert.deepEqual(model.bars, [{ label: "Refunds", value: 0 }, { label: "Open", value: 2 }, { label: "Broken", value: 0 }]);

  const { target } = renderDirect({ title: "T", values: values as unknown as HydratedValue, maxBars: 10 });
  assert.deepEqual(bars(target).map((bar) => bar.getAttribute("data-chart-value")), ["0", "2", "0"]);
  assert.equal(bars(target)[0]?.querySelector("path") == null, true, "a clamped bar draws no path");
  assert.equal(bars(target)[1]?.querySelector("path") == null, false, "bar 2 draws a path");
});

test("maxBars limits the drawn bars and the note says how many were left out", () => {
  const values = [{ label: "A", value: 1 }, { label: "B", value: 2 }, { label: "C", value: 3 }, { label: "D", value: 4 }];
  const { target } = renderDirect({ title: "T", values, maxBars: 2 });
  assert.deepEqual(bars(target).map((bar) => bar.getAttribute("data-chart-label")), ["A", "B"]);
  assert.equal(target.querySelector("table[data-weaver-chart-table]")?.querySelectorAll("tbody tr").length, 2);
  assert.equal(target.querySelector("[data-weaver-chart-note]")?.textContent, "Showing the first 2 of 4 items.");
});

test("maxBars is capped at the catalog bound by the renderer, and the schema rejects larger values", () => {
  const items = Array.from({ length: COOKBOOK_MAX_BARS + 10 }, (_, index) => ({ label: `L${index}`, value: index }));
  const capped = barChartModel({ title: "Many", values: items as unknown as HydratedValue, maxBars: COOKBOOK_MAX_BARS + 500 });
  assert.equal(capped.bars.length, COOKBOOK_MAX_BARS);
  assert.equal(capped.omitted, 10);
  assert.equal(barChartModel({ title: "Zero", values: items as unknown as HydratedValue, maxBars: 0 }).bars.length, 0);
  assert.equal(barChartModel({ title: "Fraction", values: items as unknown as HydratedValue, maxBars: 2.5 }).bars.length, 0);

  const created = createBasicWebRuntime({ additionalCatalogs: [cookbookCatalog], additionalRenderers: cookbookCatalogRendererRegistrations });
  assert.ok(created.ok);
  if (!created.ok) return;
  assert.equal(created.value.runtime.process({ version: "v0.9.1", createSurface: { surfaceId: SURFACE_ID, catalogId: COOKBOOK_CATALOG_ID } }).ok, true);
  const tooMany = created.value.runtime.process({ version: "v0.9.1", updateComponents: { surfaceId: SURFACE_ID, components: [barChartComponent({ maxBars: COOKBOOK_MAX_BARS + 1 })] } });
  assert.equal(tooMany.ok, false, "the catalog schema must reject maxBars above COOKBOOK_MAX_BARS");
});

test("the Column, Text and Card layout primitives render under the cookbook catalog id", () => {
  const created = createBasicWebRuntime({ additionalCatalogs: [cookbookCatalog], additionalRenderers: cookbookCatalogRendererRegistrations });
  assert.ok(created.ok);
  if (!created.ok) return;
  const web = created.value;
  assert.equal(web.runtime.process({ version: "v0.9.1", createSurface: { surfaceId: SURFACE_ID, catalogId: COOKBOOK_CATALOG_ID } }).ok, true);
  const components: A2UIComponent[] = [
    { id: "root", component: "Column", children: ["card"] },
    { id: "card", component: "Card", child: "content" },
    { id: "content", component: "Column", children: ["title", "chart"] },
    { id: "title", component: "Text", text: "Orders" },
    barChartComponent({ id: "chart", maxBars: 5 }),
  ];
  assert.equal(web.runtime.process({ version: "v0.9.1", updateComponents: { surfaceId: SURFACE_ID, components } }).ok, true);
  assert.equal(web.runtime.process({ version: "v0.9.1", updateDataModel: { surfaceId: SURFACE_ID, value: { stats: { byStatus: [] } } } }).ok, true);
  const window = new Window();
  const target = window.document.createElement("main") as unknown as Element;
  assert.equal(web.mount({ surfaceId: SURFACE_ID, target }).ok, true);
  assert.equal(target.querySelectorAll("[data-a2ui-component=Column]").length, 2);
  assert.ok(target.querySelector("[data-a2ui-component=Card]") !== null, "Card must render");
  assert.equal(target.querySelector("[data-a2ui-component=Text]")?.textContent, "Orders");
  assert.ok(target.querySelector("[data-a2ui-component=BarChart]") !== null, "BarChart must render");
});

test("the renderer uses no dependency, markup strings, or eval", () => {
  const source = readFileSync(fileURLToPath(new URL("../../src/custom-catalog/barChart.ts", import.meta.url)), "utf8");
  for (const forbidden of ["innerHTML", "outerHTML", "insertAdjacentHTML", "eval(", "new Function"]) {
    assert.equal(source.includes(forbidden), false, `barChart.ts must not use ${forbidden}`);
  }
  // Labels that look like markup are text, never parsed as elements.
  const { target } = renderDirect({ title: "<i>t</i>", values: [{ label: "<b>x</b>", value: 1 }], maxBars: 3 });
  assert.equal(target.querySelector("b") === null, true, "no b element");
  assert.equal(target.querySelector("i") === null, true, "no i element");
  assert.equal(bars(target)[0]?.getAttribute("data-chart-label"), "<b>x</b>");
});

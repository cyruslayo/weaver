import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  createA2UIV091Producer,
  type A2UIComponent,
  type A2UIServerMessage,
  type JsonObject,
} from "@cylayo/weaver-core";
import {
  createBasicCatalogRendererRegistrations,
  createBasicWebRuntime,
  RendererRegistry,
} from "@cylayo/weaver-web";
import { Window } from "happy-dom";
import { COOKBOOK_CATALOG_ID, cookbookCatalog } from "./catalog.js";
import { DATA_TABLE_COMPONENT } from "./dataTableRenderer.js";
import { cookbookCatalogRendererRegistrations } from "./renderers.js";

const SURFACE_ID = "cookbook-data-table";
const BASIC_CATALOG_ID = "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json";

const ORDERS: JsonObject[] = [
  { id: "A-1", status: "Paid", total: 1250 },
  { id: "A-2", status: "Refunded", total: 75.5 },
  { id: "A-3", status: "Paid", total: 980 },
];

function screenComponents(): A2UIComponent[] {
  return [
    { id: "root", component: "Column", children: ["card"] },
    { id: "card", component: "Card", child: "content" },
    { id: "content", component: "Column", children: ["title", "table"] },
    { id: "title", component: "Text", text: "Orders" },
    {
      id: "table",
      component: "DataTable",
      caption: "Recent orders",
      columns: [
        { key: "id", header: "Order" },
        { key: "status", header: "Status" },
        { key: "total", header: "Total" },
      ],
      rows: { path: "/orders" },
    } as unknown as A2UIComponent,
  ];
}

interface MountedTable {
  readonly target: Element;
  setOrders(orders: readonly JsonObject[]): void;
}

/** Builds a surface on the cookbook catalog, mounts it, and returns the mounted target. */
function mountTable(): MountedTable {
  const window = new Window();
  // Attached to the document so focus and click behavior match a browser.
  const target = window.document.body.appendChild(
    window.document.createElement("main"),
  ) as unknown as Element;
  const created = createBasicWebRuntime({
    additionalCatalogs: [cookbookCatalog],
    additionalRenderers: cookbookCatalogRendererRegistrations,
  });
  assert.equal(created.ok, true, "the cookbook renderers must register next to Basic");
  if (!created.ok) throw new Error("unreachable");

  const producer = createA2UIV091Producer();
  const runtime = created.value.runtime;
  const send = (message: A2UIServerMessage): void => {
    const result = runtime.process(message);
    assert.equal(result.ok, true, JSON.stringify(result));
  };
  send(producer.createSurface({ surfaceId: SURFACE_ID, catalogId: COOKBOOK_CATALOG_ID, sendDataModel: false }));
  send(producer.updateDataModel({ surfaceId: SURFACE_ID, path: "/orders", value: ORDERS }));
  send(producer.updateComponents({ surfaceId: SURFACE_ID, components: screenComponents() }));

  const mounted = created.value.mount({ surfaceId: SURFACE_ID, target });
  assert.equal(mounted.ok, true, "the cookbook surface must mount");

  return {
    target,
    setOrders(orders) {
      send(producer.updateDataModel({ surfaceId: SURFACE_ID, path: "/orders", value: [...orders] }));
    },
  };
}

function table(target: Element): HTMLTableElement {
  const found = target.querySelector("table");
  if (found === null) throw new Error("No table was rendered");
  return found as HTMLTableElement;
}

function bodyRows(target: Element): HTMLTableRowElement[] {
  return [...table(target).querySelectorAll<HTMLTableRowElement>("tbody > tr")];
}

test("the cookbook renderer list gives the cookbook catalog Text, Column, Card and DataTable", () => {
  const registry = new RendererRegistry(cookbookCatalogRendererRegistrations);
  for (const component of ["Text", "Column", "Card", DATA_TABLE_COMPONENT]) {
    assert.equal(registry.has(COOKBOOK_CATALOG_ID, component), true, `${component} under the cookbook id`);
  }
  for (const component of ["Button", "TextField", "Tabs", "Modal"]) {
    assert.equal(registry.has(COOKBOOK_CATALOG_ID, component), false, `${component} is not a cookbook renderer`);
  }
  assert.equal(registry.has(BASIC_CATALOG_ID, DATA_TABLE_COMPONENT), false, "DataTable is never added to Basic");
});

test("Text, Column and Card under the cookbook id reuse the Basic renderer functions", () => {
  const basic = createBasicCatalogRendererRegistrations({ catalogId: BASIC_CATALOG_ID });
  for (const component of ["Text", "Column", "Card"]) {
    const basicRender = basic.find((registration) => registration.component === component)?.render;
    const cookbookRender = cookbookCatalogRendererRegistrations.find(
      (registration) => registration.catalogId === COOKBOOK_CATALOG_ID && registration.component === component,
    )?.render;
    assert.ok(basicRender, `${component} exists in Basic`);
    assert.equal(cookbookRender, basicRender, `${component} is the Basic renderer, not a copy`);
  }
});

test("the table renders semantic markup from bound data, with a caption and column headers", () => {
  const { target } = mountTable();
  assert.equal(table(target).querySelector("caption")?.textContent, "Recent orders");

  const headers = [...table(target).querySelectorAll("thead th")];
  assert.deepEqual(headers.map((header) => header.textContent), ["Order", "Status", "Total"]);
  for (const header of headers) assert.equal(header.getAttribute("scope"), "col");

  assert.equal(bodyRows(target).length, ORDERS.length);
  assert.equal(bodyRows(target)[1]?.children[2]?.textContent, "75.5");
  assert.equal(target.querySelector("h1, p, h2, h3")?.textContent, "Orders", "Text renders through the reused renderer");
  assert.ok(target.querySelector('[data-a2ui-component="Card"]'), "Card renders through the reused renderer");
});

test("numeric columns are right aligned and text columns start aligned", () => {
  const { target } = mountTable();
  const [idHeader, statusHeader, totalHeader] = [...table(target).querySelectorAll<HTMLElement>("thead th")];
  assert.equal(totalHeader?.style.textAlign, "end", "the numeric column header is right aligned");
  assert.equal(idHeader?.style.textAlign, "start");
  assert.equal(statusHeader?.style.textAlign, "start");

  const firstRow = bodyRows(target)[0]!;
  assert.equal((firstRow.children[2] as HTMLElement).style.textAlign, "end", "numeric cells are right aligned");
  assert.equal((firstRow.children[0] as HTMLElement).style.textAlign, "start");
});

test("the table re-renders when updateDataModel changes the rows", () => {
  const screen = mountTable();
  assert.equal(bodyRows(screen.target).length, 3);

  screen.setOrders([{ id: "B-9", status: "Open", total: 10 }]);
  const rows = bodyRows(screen.target);
  assert.equal(rows.length, 1, "the old rows are gone");
  assert.equal(rows[0]?.children[0]?.textContent, "B-9");
  assert.doesNotMatch(screen.target.textContent ?? "", /A-1/);
});

test("the rendered table is read-only: it contains no button and no interactive control", () => {
  const { target } = mountTable();
  assert.equal(bodyRows(target).length, ORDERS.length, "rows are rendered");
  assert.equal(target.querySelectorAll("button").length, 0, "the table renders no <button>");
  assert.equal(
    table(target).querySelectorAll("a, input, select, textarea, [tabindex], [role=button]").length,
    0,
    "no focusable or interactive element is rendered inside the table",
  );
});

test("an empty row list renders one labelled empty row and no buttons", () => {
  const screen = mountTable();
  screen.setOrders([]);
  const rows = bodyRows(screen.target);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.textContent, "No rows");
  assert.equal(screen.target.querySelectorAll("button").length, 0);
});

test("a wide table scrolls inside its own wrapper, so the page never overflows", () => {
  const { target } = mountTable();
  const wrapper = target.querySelector<HTMLElement>(`[data-cookbook-component="${DATA_TABLE_COMPONENT}"]`);
  assert.ok(wrapper, "the DataTable wrapper is rendered");
  assert.equal(wrapper.style.overflowX, "auto");
  assert.equal(wrapper.style.maxWidth, "100%");
  assert.equal(wrapper.contains(table(target)), true, "the table sits inside the scrolling wrapper");
});

test("the DataTable renderer source contains no HTML-parsing, eval, or action-dispatch sinks", () => {
  const sources = [
    "../../src/custom-catalog/dataTableRenderer.ts",
    "../../src/custom-catalog/renderers.ts",
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
  for (const source of sources) {
    assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML/);
    assert.doesNotMatch(source, /\beval\s*\(|new Function\s*\(/);
  }
  const renderer = sources[0] ?? "";
  assert.doesNotMatch(renderer, /rowAction|dispatchAction|registerControl/, "the read-only table dispatches nothing");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import type { A2UIComponent, A2UIServerMessage } from "@cylayo/weaver-core";
import type { WebServerEventHandoff } from "@cylayo/weaver-web";
import { Window } from "happy-dom";
import { cookbookCatalog, COOKBOOK_CATALOG_ID } from "../custom-catalog/catalog.js";
import { mountCookbookScreen } from "../shared/harness.js";
import {
  ORDER_STATUSES,
  ORDERS_REFRESH,
  ORDERS_SURFACE_ID,
  ordersReportScreen,
  ordersSnapshot,
  type OrdersReportState,
} from "./orders-report.js";

function mount() {
  const window = new Window();
  // Attached to the document, so focus can move into the rendered controls.
  const target = window.document.body.appendChild(
    window.document.createElement("main"),
  ) as unknown as Element;
  const outbound: (readonly A2UIServerMessage[])[] = [];
  const screen = mountCookbookScreen(target, ordersReportScreen, {
    onOutbound: (messages) => outbound.push([...messages]),
  });
  return { window, target, screen, outbound, document: target.ownerDocument };
}

function event(name: string, context: unknown, surfaceId = ORDERS_SURFACE_ID): WebServerEventHandoff {
  return {
    message: {
      version: "v0.9.1",
      action: {
        name,
        surfaceId,
        sourceComponentId: "test",
        timestamp: "2030-01-01T00:00:00.000Z",
        context: context as never,
      },
    },
  };
}

function refreshClick(refreshes: unknown): WebServerEventHandoff {
  return event(ORDERS_REFRESH, { refreshes });
}

function buttonLabeled(target: Element, label: string): HTMLButtonElement {
  const button = [...target.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent === label,
  );
  if (button === undefined) throw new Error(`Button "${label}" was not rendered`);
  return button;
}

/** The DataTable wrapper, the table the custom renderer draws. */
function dataTableOf(target: Element): Element {
  const wrapper = target.querySelector('[data-cookbook-component="DataTable"]');
  if (wrapper === null) throw new Error("The DataTable was not rendered");
  return wrapper;
}

/** The chart's bars, as "label=value" strings in DOM order. Plain strings, so a failure prints readably. */
function barReadout(target: Element): string[] {
  return [...target.querySelectorAll("[data-chart-bar]")].map(
    (bar) => `${bar.getAttribute("data-chart-label")}=${bar.getAttribute("data-chart-value")}`,
  );
}

function dataModel(screen: ReturnType<typeof mount>["screen"]): OrdersReportState {
  return screen.web.runtime.getSurface(ORDERS_SURFACE_ID)
    ?.dataModel as unknown as OrdersReportState;
}

test("the orders report mounts from bound data on the custom catalog and resolves within the finite budgets", () => {
  const { target, screen } = mount();

  const resolved = screen.web.runtime.resolveSurface(ORDERS_SURFACE_ID);
  assert.equal(resolved.ok, true, "the screen must stay within the safety budgets");
  assert.equal(screen.web.runtime.getSurface(ORDERS_SURFACE_ID)?.catalogId, COOKBOOK_CATALOG_ID);

  assert.match(target.textContent ?? "", /Orders report/);
  assert.equal(dataTableOf(target).querySelectorAll("tbody tr").length, 8, "one row per order");
  assert.equal(
    dataTableOf(target).querySelector("caption")?.textContent,
    "Orders",
    "the table has its caption",
  );
  assert.equal(
    target.querySelector('[data-a2ui-component="BarChart"]') !== null,
    true,
    "the BarChart rendered",
  );
  assert.equal(
    target.querySelector('svg[role="img"]') !== null,
    true,
    "the chart is an image with an accessible name",
  );
  assert.equal(
    target.querySelector("[data-weaver-chart-table]")?.querySelectorAll("tbody tr").length,
    ORDER_STATUSES.length,
    "the chart has a fallback table with one row per status",
  );
  assert.equal(
    target.querySelector("[data-weaver-surface-attribution]")?.textContent,
    "Orders Agent",
  );
});

test("the chart bars are the order totals per status, read from the bound summary", () => {
  const { target, screen } = mount();
  const state = dataModel(screen);
  const expected = ORDER_STATUSES.map((status) => {
    const total = state.orders
      .filter((order) => order.status === status)
      .reduce((sum, order) => sum + order.total, 0);
    return `${status}=${total}`;
  });
  assert.deepEqual(barReadout(target), expected);
});

test("Refresh changes the table and the chart, and emits only updateDataModel messages", () => {
  const { target, screen, outbound } = mount();
  const beforeModel = dataModel(screen);
  const beforeTable = dataTableOf(target).textContent ?? "";
  const beforeBars = barReadout(target);
  const beforeMessages = outbound.length;

  buttonLabeled(target, "Refresh").click();

  const emitted = outbound.slice(beforeMessages).flat();
  assert.equal(emitted.length, 3, "one refresh answers with one updateDataModel per changed path");
  const paths: string[] = [];
  for (const message of emitted) {
    assert.ok("updateDataModel" in message, "the agent answers with updateDataModel");
    assert.equal("updateComponents" in message, false, "no updateComponents after the first render");
    assert.equal("createSurface" in message, false);
    paths.push((message as unknown as { updateDataModel: { path: string } }).updateDataModel.path);
  }
  assert.deepEqual(paths, ["/refreshes", "/orders", "/summary/byStatus"]);

  const afterModel = dataModel(screen);
  assert.equal(afterModel.refreshes, beforeModel.refreshes + 1);
  assert.equal(
    dataTableOf(target).querySelectorAll("tbody tr").length,
    8,
    "the table keeps one row per order",
  );
  assert.notEqual(dataTableOf(target).textContent, beforeTable, "the table values changed");
  assert.notDeepEqual(barReadout(target), beforeBars, "the chart values changed");
  assert.equal(
    target.querySelectorAll('[data-a2ui-component="BarChart"]').length,
    1,
    "the chart is not built as a second surface",
  );
});

test("each Refresh produces new data, and the same click sequence produces the same data", () => {
  assert.deepEqual(ordersSnapshot(3), ordersSnapshot(3));
  assert.notDeepEqual(ordersSnapshot(3).orders, ordersSnapshot(4).orders);

  const first = mount();
  const second = mount();
  for (const screen of [first, second]) {
    buttonLabeled(screen.target, "Refresh").click();
    buttonLabeled(screen.target, "Refresh").click();
  }
  assert.deepEqual(dataModel(first.screen), dataModel(second.screen));
  assert.equal(dataModel(first.screen).refreshes, 2);
});

// The Basic Button registers its control for focus restoration, and the cookbook catalog reuses that renderer.
test("focus stays on the Refresh button across updates", () => {
  const { target, document } = mount();

  // Boolean assertions only: a failing assert.equal on a DOM node tries to inspect it, which is very slow.
  for (let click = 0; click < 3; click++) {
    const refresh = buttonLabeled(target, "Refresh");
    refresh.focus();
    assert.ok(document.activeElement === refresh, "Refresh is focused before the click");

    refresh.click();

    const after = buttonLabeled(target, "Refresh");
    assert.ok(document.activeElement === after, `Refresh keeps focus after update ${click + 1}`);
  }
});

test("the DataTable is read-only: it renders no button or other control", () => {
  const { target } = mount();
  assert.equal(dataTableOf(target).querySelectorAll("button, input, select, textarea, a[href]").length, 0);
});

test("unknown events, other surfaces, and invalid or stale Refresh contexts are rejected before any change", () => {
  const { target, screen } = mount();
  const before = screen.getState();
  const beforeText = target.textContent;
  const beforeBars = barReadout(target);
  const current = before.refreshes;

  assert.deepEqual(
    screen.handleServerEvent(event("cookbook.orders.delete", { refreshes: current })),
    { accepted: false, reason: "EVENT_NOT_ALLOWLISTED" },
  );
  assert.deepEqual(
    screen.handleServerEvent(event("constructor", { refreshes: current })),
    { accepted: false, reason: "EVENT_NOT_ALLOWLISTED" },
  );
  assert.deepEqual(
    screen.handleServerEvent(event(ORDERS_REFRESH, { refreshes: current }, "other-surface")),
    { accepted: false, reason: "SURFACE_NOT_ALLOWED" },
  );

  // A stale count (an old click), a forged count, and the wrong types are all rejected.
  const invalid: unknown[] = [undefined, {}, [], current + 1, current - 1, "0", 1.5, null, true];
  for (const refreshes of invalid) {
    assert.deepEqual(
      screen.handleServerEvent(refreshClick(refreshes)),
      { accepted: false, reason: "INVALID_EVENT_CONTEXT" },
    );
  }
  assert.deepEqual(
    screen.handleServerEvent(event(ORDERS_REFRESH, undefined)),
    { accepted: false, reason: "INVALID_EVENT_CONTEXT" },
  );

  assert.deepEqual(screen.getState(), before);
  assert.equal(target.textContent, beforeText);
  assert.deepEqual(barReadout(target), beforeBars);
  assert.deepEqual(screen.rejectedEventNames, ["cookbook.orders.delete", "constructor"]);
});

test("a current Refresh count is accepted through the same handoff", () => {
  const { screen } = mount();
  assert.deepEqual(screen.handleServerEvent(refreshClick(0)), { accepted: true });
  assert.equal(dataModel(screen).refreshes, 1);
  assert.deepEqual(screen.handleServerEvent(refreshClick(0)), {
    accepted: false,
    reason: "INVALID_EVENT_CONTEXT",
  }, "the old count is now stale");
});

test("the screen declares only components of the cookbook catalog", () => {
  const declared = Object.keys(cookbookCatalog.schema.components as Record<string, unknown>);
  const used = ordersReportScreen.components().map((component: A2UIComponent) => component.component);
  for (const name of new Set(used)) {
    assert.equal(declared.includes(name), true, `${name} is declared by the cookbook catalog`);
  }
  assert.equal(ordersReportScreen.catalog?.catalog.catalogId, COOKBOOK_CATALOG_ID);
});

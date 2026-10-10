import { expect, test, type Page } from "@playwright/test";
import {
  expectNoHorizontalOverflow,
  openScreen,
  recordTabOrder,
  tabUntil,
  tagTabStops,
} from "./support.js";

const PATH = "/orders-report.html";
const HEADING = "Orders report";
const CHART_NAME = "Order value by status (USD)";

/** The chart's bars as "label=value" strings, in DOM order. */
async function barReadout(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-chart-bar]")).map(
      (bar) => `${bar.getAttribute("data-chart-label")}=${bar.getAttribute("data-chart-value")}`,
    ),
  );
}

/** The DataTable's text, which changes when Refresh loads new orders. */
async function tableText(page: Page): Promise<string> {
  return page.locator('[data-cookbook-component="DataTable"]').innerText();
}

test("the orders report has no horizontal page scroll", async ({ page }) => {
  await openScreen(page, PATH, HEADING);
  await expectNoHorizontalOverflow(page);
});

test("the table scrolls inside its own wrapper, and the chart fits the viewport", async ({ page }) => {
  await openScreen(page, PATH, HEADING);
  const { wrapperRight, wrapperOverflowX, chartRight, viewport } = await page.evaluate(() => {
    const wrapper = document.querySelector<HTMLElement>('[data-cookbook-component="DataTable"]');
    const chart = document.querySelector<SVGSVGElement>('svg[role="img"]');
    return {
      wrapperRight: wrapper?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
      wrapperOverflowX: wrapper ? getComputedStyle(wrapper).overflowX : "missing",
      chartRight: chart?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
      viewport: window.innerWidth,
    };
  });
  expect(wrapperOverflowX, "the table wrapper scrolls sideways").toBe("auto");
  expect(wrapperRight, "the table wrapper stays inside the viewport").toBeLessThanOrEqual(viewport);
  expect(chartRight, "the chart stays inside the viewport").toBeLessThanOrEqual(viewport);
});

test("the chart is an image with an accessible name, and it has a fallback table", async ({ page }) => {
  await openScreen(page, PATH, HEADING);
  await expect(page.getByRole("img", { name: CHART_NAME })).toBeVisible();

  // The fallback table is visually hidden, so it is checked by content, not visibility.
  const fallback = page.locator("[data-weaver-chart-table]");
  await expect(fallback).toHaveCount(1);
  await expect(fallback.locator("tbody tr")).toHaveCount(4);
  await expect(fallback.locator("tbody tr").first()).toContainText("Pending");
});

test("Tab reaches Refresh and the named table region, in DOM order, with a visible focus indicator", async ({ page }) => {
  await openScreen(page, PATH, HEADING);
  // The table is read-only, so its only stop is the scrollable region that wraps it. The chart adds none.
  await expect(page.getByRole("region", { name: "Orders" })).toBeVisible();
  const expected = await tagTabStops(page);
  expect(expected.length, "Refresh, then the table's scroll region").toBe(2);
  const { order, indicatorFailures } = await recordTabOrder(page);
  expect(order).toEqual(expected);
  expect(indicatorFailures).toEqual([]);
});

test("the keyboard activates Refresh, which updates both the table and the chart", async ({ page }) => {
  await openScreen(page, PATH, HEADING);
  const tableBefore = await tableText(page);
  const barsBefore = await barReadout(page);
  expect(barsBefore.length).toBe(4);

  await tabUntil(page, (focus) => focus.tag === "BUTTON" && focus.text === "Refresh", "Refresh");
  await page.keyboard.press("Enter");

  await expect.poll(() => tableText(page)).not.toBe(tableBefore);
  await expect.poll(() => barReadout(page)).not.toEqual(barsBefore);
  // The table keeps one row per order and the chart keeps one bar per status.
  await expect(page.locator('[data-cookbook-component="DataTable"] tbody tr')).toHaveCount(8);
  await expect(page.locator("[data-chart-bar]")).toHaveCount(4);
});

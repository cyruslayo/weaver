import { expect, test } from "@playwright/test";
import {
  describeFocus,
  expectNoHorizontalOverflow,
  kpiValue,
  openScreen,
  recordTabOrder,
  tabUntil,
  tagTabStops,
} from "./support.js";

const PATH = "/dashboard.html";
const HEADING = "Team dashboard";

test("the dashboard has no horizontal page scroll", async ({ page }) => {
  await openScreen(page, PATH, HEADING);
  await expectNoHorizontalOverflow(page);
});

test("Tab reaches every control in DOM order with a visible focus indicator", async ({ page }) => {
  await openScreen(page, PATH, HEADING);
  const expected = await tagTabStops(page);
  const { order, indicatorFailures } = await recordTabOrder(page);
  expect(order).toEqual(expected);
  expect(indicatorFailures).toEqual([]);
});

test("the keyboard filters by team and refreshes the data", async ({ page }) => {
  await openScreen(page, PATH, HEADING);
  const revenueBefore = await kpiValue(page, "Revenue");
  await expect(page.getByText("Ticket backlog")).toBeVisible();

  // The Team choice is a radio group. Tab lands on it, and the arrow keys choose the option.
  await tabUntil(page, (focus) => focus.type === "radio", "the Team choice group");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('input[type="radio"][value="sales"]')).toBeChecked();

  // Apply filter is the next stop. Enter applies the filter.
  await tabUntil(page, (focus) => focus.tag === "BUTTON" && focus.text === "Apply filter", "Apply filter");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Ticket backlog")).toBeHidden();
  await expect(page.getByText("Enterprise renewals")).toBeVisible();

  // Refresh regenerates the data. The revenue KPI must change.
  await tabUntil(page, (focus) => focus.tag === "BUTTON" && focus.text === "Refresh", "Refresh");
  await page.keyboard.press("Enter");
  await expect.poll(() => kpiValue(page, "Revenue")).not.toBe(revenueBefore);
});

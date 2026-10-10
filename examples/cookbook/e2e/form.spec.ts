import { expect, test } from "@playwright/test";
import {
  describeFocus,
  expectNoHorizontalOverflow,
  openScreen,
  recordTabOrder,
  tabUntil,
  tagTabStops,
} from "./support.js";

const PATH = "/form.html";
const HEADING = "Support request";

test("the form has no horizontal page scroll", async ({ page }) => {
  await openScreen(page, PATH, HEADING);
  await expectNoHorizontalOverflow(page);
});

test("Tab reaches every enabled control in DOM order with a visible focus indicator", async ({ page }) => {
  await openScreen(page, PATH, HEADING);
  // Submit is disabled until the form is valid, so it is not a Tab stop yet.
  await expect(page.getByRole("button", { name: "Submit request" })).toBeDisabled();
  const expected = await tagTabStops(page);
  const { order, indicatorFailures } = await recordTabOrder(page);
  expect(order).toEqual(expected);
  expect(indicatorFailures).toEqual([]);
});

test("the keyboard completes a valid support request and gets a ticket number", async ({ page }) => {
  await openScreen(page, PATH, HEADING);

  await page.keyboard.press("Tab");
  const first = await describeFocus(page);
  expect(first.tag).toBe("INPUT");
  expect(first.type).toBe("text");
  await page.keyboard.type("Ada Lovelace");

  await page.keyboard.press("Tab");
  await page.keyboard.type("ada@example.com");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Cannot sign in");
  await page.keyboard.press("Tab");
  await page.keyboard.type("AB-1234");

  await page.keyboard.press("Tab");
  expect((await describeFocus(page)).type).toBe("checkbox");
  await page.keyboard.press("Space");
  await expect(page.getByRole("checkbox", { name: "Urgent" })).toBeChecked();

  // The category radio group is one Tab stop. Space picks the focused option.
  await page.keyboard.press("Tab");
  expect((await describeFocus(page)).type).toBe("radio");
  await page.keyboard.press("Space");
  await expect(page.locator('input[type="radio"][value="billing"]')).toBeChecked();

  // Submit becomes a Tab stop once the form is valid. Date segments may take several presses.
  const submit = await tabUntil(
    page,
    (focus) => focus.tag === "BUTTON" && focus.text === "Submit request",
    "the enabled Submit button",
  );
  expect(submit.indicator).toBe(true);
  await page.keyboard.press("Enter");

  await expect(page.getByText("Ticket SR-1001 created.")).toBeVisible();
});

test("the disabled Submit button never takes keyboard focus while the order reference is invalid", async ({ page }) => {
  await openScreen(page, PATH, HEADING);
  await page.getByLabel("Name").fill("Ada Lovelace");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Summary").fill("Cannot sign in");
  await page.getByLabel("Order reference").fill("AB-12");
  await page.getByRole("checkbox", { name: "Urgent" }).check();
  await page.locator('input[type="radio"][value="billing"]').check();
  await expect(page.getByRole("button", { name: "Submit request" })).toBeDisabled();

  // Press Tab through the form and fail if the disabled Submit button ever takes focus.
  const focused: string[] = [];
  for (let press = 0; press < 25; press += 1) {
    await page.keyboard.press("Tab");
    focused.push((await describeFocus(page)).text);
  }
  expect(focused).not.toContain("Submit request");
  await expect(page.getByRole("button", { name: "Submit request" })).toBeDisabled();
});

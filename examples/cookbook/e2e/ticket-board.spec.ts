import { expect, test } from "@playwright/test";
import {
  columnCards,
  describeFocus,
  expectNoHorizontalOverflow,
  openScreen,
  recordTabOrder,
  tabUntil,
  tagTabStops,
} from "./support.js";

const PATH = "/ticket-board.html";
const HEADING = "Ticket board";

test("the ticket board has no horizontal page scroll", async ({ page }) => {
  await openScreen(page, PATH, HEADING);
  await expectNoHorizontalOverflow(page);
});

test("Tab reaches every visible card control in DOM order with a visible focus indicator", async ({ page }) => {
  await openScreen(page, PATH, HEADING);
  // The Assign dialog is closed, so its picker and confirm button are not Tab stops.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const expected = await tagTabStops(page);
  const { order, indicatorFailures } = await recordTabOrder(page);
  expect(order).toEqual(expected);
  expect(indicatorFailures).toEqual([]);
});

test("the keyboard moves, assigns and dismisses a ticket", async ({ page }) => {
  await openScreen(page, PATH, HEADING);
  expect(await columnCards(page, "Open")).toEqual(["Fix login redirect", "Document the cookbook"]);
  expect(await columnCards(page, "In progress")).toEqual(["Add keyboard focus ring"]);

  // Start moves a ticket from Open to In progress.
  await tabUntil(
    page,
    (focus) => focus.tag === "BUTTON" && focus.text === "Start" && focus.card === "Fix login redirect",
    "Start on Fix login redirect",
  );
  await page.keyboard.press("Enter");
  await expect.poll(() => columnCards(page, "In progress")).toEqual(["Add keyboard focus ring", "Fix login redirect"]);
  await expect.poll(() => columnCards(page, "Open")).toEqual(["Document the cookbook"]);

  // Assign opens a modal dialog. Focus must move into the dialog.
  await tabUntil(
    page,
    (focus) => focus.tag === "BUTTON" && focus.text === "Assign" && focus.card === "Fix login redirect",
    "Assign on Fix login redirect",
  );
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect((await describeFocus(page)).inDialog).toBe(true);

  // The Assignee choice is a radio group inside the dialog. ArrowDown picks Grace Hopper.
  await tabUntil(page, (focus) => focus.type === "radio" && focus.inDialog, "the Assignee choice group");
  await page.keyboard.press("ArrowDown");
  await expect(dialog.locator('input[type="radio"][value="grace"]')).toBeChecked();

  // Assign ticket confirms. The dialog stays open, as the Basic Modal has no data-driven close.
  await tabUntil(
    page,
    (focus) => focus.tag === "BUTTON" && focus.text === "Assign ticket" && focus.inDialog,
    "Assign ticket inside the dialog",
  );
  await page.keyboard.press("Enter");
  // Scope the check to the ticket's own card. The dialog's option list also shows the name.
  await expect(page.locator("h3", { hasText: "Fix login redirect" }).locator("xpath=..")).toContainText("Grace Hopper");

  // Escape dismisses the dialog.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow, openScreen } from "./support.js";

const PATH = "/error-demo.html";
const HEADING = "Error demo";

/** The codes of the panel's entries, in DOM order. Each entry is one bad update. */
async function entryCodes(page: Page): Promise<string[]> {
  return page.locator(".diagnostics-entry").evaluateAll((entries) =>
    entries.map((entry) => entry.getAttribute("data-code") ?? ""),
  );
}

test("the error demo has no horizontal page scroll after the three bad updates", async ({ page }) => {
  await openScreen(page, PATH, HEADING);
  await expectNoHorizontalOverflow(page);
});

test("the diagnostics panel fits inside the viewport", async ({ page }) => {
  await openScreen(page, PATH, HEADING);
  const panel = page.locator(".diagnostics-panel");
  await expect(panel).toBeVisible();
  const { right, viewport } = await panel.evaluate((el) => ({
    right: el.getBoundingClientRect().right,
    viewport: window.innerWidth,
  }));
  expect(right, `panel right edge ${right}px within viewport ${viewport}px`).toBeLessThanOrEqual(viewport);
});

test("each bad update produces exactly one entry, grouped under its frame", async ({ page }) => {
  await openScreen(page, PATH, HEADING);
  await expect(page.locator(".diagnostics-entry")).toHaveCount(3);
  expect(await entryCodes(page)).toEqual(["INVALID_JSON", "CATALOG_REGISTRY_ERROR", "SURFACE_RESOLUTION_FAILED"]);

  const frames = await page.locator(".diagnostics-frame-title").allTextContents();
  expect(frames).toEqual(["Frame 4", "Frame 5", "Frame 6"]);
  await expect(page.locator(".diagnostics-count")).toHaveText("3 entries.");
});

test("the previous surface stays visible beside the panel after every bad update", async ({ page }) => {
  await openScreen(page, PATH, HEADING);
  const surface = page.locator("#surface");
  await expect(surface.getByRole("heading", { name: HEADING, level: 1 })).toBeVisible();
  await expect(surface).toContainText("3 open tickets");
  await expect(surface).toContainText("Login fails on Safari");
  await expect(surface).toContainText("Add dark mode");
  // The 70-row list was rejected at render, so none of its rows reached the screen.
  await expect(surface).not.toContainText("Ticket 70");
  // The panel is a sibling of the surface, not inside it.
  await expect(surface.locator(".diagnostics-panel")).toHaveCount(0);
  await expect(page.locator("#diagnostics .diagnostics-panel")).toHaveCount(1);
});

test("Tab reaches the diagnostics panel by keyboard, with a visible focus indicator", async ({ page }) => {
  await openScreen(page, PATH, HEADING);
  // The surface has no interactive control, so the panel is the first and only Tab stop.
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => {
    const active = document.activeElement;
    return { isPanel: active?.classList.contains("diagnostics-panel") ?? false, tag: active?.tagName ?? "" };
  });
  expect(focused.isPanel, `the first Tab stop is the panel, not ${focused.tag}`).toBe(true);

  const outline = await page.locator(".diagnostics-panel").evaluate((el) => {
    const style = getComputedStyle(el);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(outline.style, "focus outline style").not.toBe("none");
  expect(outline.width, "focus outline width").toBeGreaterThan(0);
});

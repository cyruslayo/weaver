import { expect, test, type Page } from "@playwright/test";

// Real-browser checks for the hosted Playground (index.html). They run at 1280px and 360px,
// as the playwright.config.ts projects set them. Run with `pnpm --filter @weaver/playground e2e`.

/** Fails when the document is wider than the viewport, and reports both widths. */
async function expectNoHorizontalOverflow(page: Page, context: string): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `${context}: document scrollWidth ${scrollWidth}px exceeds viewport ${innerWidth}px`).toBeLessThanOrEqual(innerWidth);
}

async function openPlayground(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Playground", level: 1 })).toBeVisible();
  await expect(page.locator("#source")).not.toHaveValue("");
}

test.describe("playground", () => {
  test("loads the default example with no errors and no horizontal overflow", async ({ page }) => {
    await openPlayground(page);
    await expect(page.locator("#error-count")).toHaveText("0");
    await expect(page.getByRole("heading", { name: "Stays for your trip" })).toBeVisible();
    await expectNoHorizontalOverflow(page, "load");
  });

  test("switching to Order summary replaces the editor text and renders its heading", async ({ page }) => {
    await openPlayground(page);
    await page.getByRole("button", { name: /Order summary/ }).click();
    await expect(page.locator("#source")).toHaveValue(/"Order summary"/);
    await expect(page.getByRole("heading", { name: "Order summary" })).toBeVisible();
    await expectNoHorizontalOverflow(page, "order summary");
  });

  test("the broken example shows exactly one error, on line 3", async ({ page }) => {
    await openPlayground(page);
    await page.getByRole("button", { name: /Broken output/ }).click();
    await expect(page.locator("#error-count")).toHaveText("1");
    await page.getByRole("tab", { name: /Errors/ }).click();
    const panel = page.locator("#error-panel");
    await expect(panel).toContainText("INVALID_JSON");
    await expect(page.locator("#backdrop .line.is-error .line-num")).toHaveText("3");
    await expectNoHorizontalOverflow(page, "broken output");
  });

  test("Stream it replays every line and reports the finish", async ({ page }) => {
    await openPlayground(page);
    await page.getByRole("button", { name: "2×" }).click();
    await page.getByRole("button", { name: "Stream it" }).click();
    await expect(page.locator("#stream-status")).toHaveText(/Stream finished: 4 accepted, 0 errors\./, { timeout: 15_000 });
    await expect(page.locator("#source")).not.toHaveAttribute("readonly", "");
  });

  test("the Events tab uses arrow keys to move between tabs", async ({ page }) => {
    await openPlayground(page);
    await page.getByRole("tab", { name: "Events" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Data model" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#data-model")).toContainText("hotels");
  });
});

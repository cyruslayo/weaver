import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

// Real-browser checks for the trace inspector. They run at 1280px and 360px, as
// the playwright.config.ts projects set them. Run with `pnpm --filter @weaver/playground e2e`.

const PAGE = "/inspector.html";
const STEP_COUNT = 10;

async function openInspector(page: Page): Promise<void> {
  await page.goto(PAGE);
  await expect(page.getByRole("heading", { name: "Weaver trace inspector", level: 1 })).toBeVisible();
  await expect(page.locator("#step-summary")).toHaveText(`Step 1 of ${STEP_COUNT}: message, sequence 1.`);
}

/** Fails when the document is wider than the viewport, and reports both widths. */
async function expectNoHorizontalOverflow(page: Page, context: string): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `${context}: document scrollWidth ${scrollWidth}px exceeds viewport ${innerWidth}px`).toBeLessThanOrEqual(innerWidth);
}

/** Presses Tab until the element with `id` has focus. It also checks that a focus outline is visible. */
async function tabTo(page: Page, id: string, maxPresses = 60): Promise<void> {
  for (let press = 0; press < maxPresses; press += 1) {
    await page.keyboard.press("Tab");
    const active = await page.evaluate(() => document.activeElement?.id ?? "");
    if (active === id) {
      const outline = await page.locator(`#${id}`).evaluate((el) => {
        const cs = getComputedStyle(el);
        return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
      });
      expect(outline.style, `focus indicator on #${id}`).not.toBe("none");
      expect(outline.width, `focus indicator width on #${id}`).toBeGreaterThan(0);
      return;
    }
  }
  throw new Error(`Tab did not reach #${id} within ${maxPresses} presses`);
}

/**
 * Presses Tab until the focused element matches `selector`, then checks its focus outline.
 * It is the selector form of tabTo, for elements that have no id.
 */
async function tabToSelector(page: Page, selector: string, maxPresses = 80): Promise<void> {
  for (let press = 0; press < maxPresses; press += 1) {
    await page.keyboard.press("Tab");
    const hit = await page.evaluate((sel) => document.activeElement?.matches(sel) ?? false, selector);
    if (hit) {
      const outline = await page.locator(selector).first().evaluate((el) => {
        const cs = getComputedStyle(el);
        return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
      });
      expect(outline.style, `focus indicator on ${selector}`).not.toBe("none");
      expect(outline.width, `focus indicator width on ${selector}`).toBeGreaterThan(0);
      return;
    }
  }
  throw new Error(`Tab did not reach ${selector} within ${maxPresses} presses`);
}

test.describe("trace inspector", () => {
  test("has no horizontal page overflow on load and at every step", async ({ page }) => {
    await openInspector(page);
    await expectNoHorizontalOverflow(page, "load");
    for (let step = 2; step <= STEP_COUNT; step += 1) {
      await page.locator("#next").click();
      await expect(page.locator("#step-summary")).toContainText(`Step ${step} of ${STEP_COUNT}:`);
      await expectNoHorizontalOverflow(page, `step ${step}`);
    }
  });

  test("Tab reaches the step controls in order, each with a visible focus indicator", async ({ page }) => {
    await openInspector(page);
    await tabTo(page, "first");
    await tabTo(page, "previous");
    await tabTo(page, "next");
    await tabTo(page, "last");
    await tabTo(page, "step-slider");
  });

  test("keyboard shortcuts step the trace, and Enter activates Next", async ({ page }) => {
    await openInspector(page);
    await page.locator("h1").click();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#step-summary")).toContainText(`Step 2 of ${STEP_COUNT}:`);
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("#step-summary")).toContainText(`Step 1 of ${STEP_COUNT}:`);
    await page.keyboard.press("End");
    await expect(page.locator("#step-summary")).toContainText(`Step ${STEP_COUNT} of ${STEP_COUNT}:`);
    await page.keyboard.press("Home");
    await expect(page.locator("#step-summary")).toContainText(`Step 1 of ${STEP_COUNT}:`);

    await tabTo(page, "next");
    await page.keyboard.press("Enter");
    await expect(page.locator("#step-summary")).toContainText(`Step 2 of ${STEP_COUNT}:`);
  });

  test("the slider steps with the arrow keys", async ({ page }) => {
    await openInspector(page);
    await tabTo(page, "step-slider");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#step-summary")).toContainText(`Step 2 of ${STEP_COUNT}:`);
    await expect(page.locator("#step-slider")).toHaveValue("1");
    await page.keyboard.press("Home");
    await expect(page.locator("#step-summary")).toContainText(`Step 1 of ${STEP_COUNT}:`);
  });

  test("the malformed frame is flagged, and the earlier surface stays rendered", async ({ page }) => {
    await openInspector(page);
    await page.locator("#timeline").getByRole("button", { name: /^4\. frame-error/ }).click();
    await expect(page.locator("#step-summary")).toContainText("Step 4 of 10: frame-error");
    await expect(page.locator("#validity")).toHaveText("Invalid: malformed frame");
    await expect(page.locator("#error-panel")).toBeVisible();
    await expect(page.locator("#error-panel")).toContainText("INVALID_JSON");
    await expect(page.locator("#stage h1")).toHaveText("Model Draft Request");
    await expectNoHorizontalOverflow(page, "malformed frame step");
  });

  test("the malformed frame is one diagnostics entry, grouped under its frame", async ({ page }) => {
    await openInspector(page);
    await page.locator("#timeline").getByRole("button", { name: /^4\. frame-error/ }).click();
    const panel = page.locator("#error-panel .diagnostics-panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".diagnostics-entry")).toHaveCount(1);
    expect(await panel.locator(".diagnostics-entry").getAttribute("data-code")).toBe("INVALID_JSON");
    const frames = await panel.locator(".diagnostics-frame-title").allTextContents();
    expect(frames).toEqual(["Frame 4"]);
  });

  test("a rejected message is one diagnostics entry, and the last good surface stays rendered", async ({ page }) => {
    await openInspector(page);
    await page.locator("#timeline").getByRole("button", { name: /^5\. message \(error\)/ }).click();
    await expect(page.locator("#step-summary")).toContainText("Step 5 of 10:");
    await expect(page.locator("#validity")).toHaveText("Rejected");
    const panel = page.locator("#error-panel .diagnostics-panel");
    await expect(panel.locator(".diagnostics-entry")).toHaveCount(1);
    expect(await panel.locator(".diagnostics-entry").getAttribute("data-code")).toBe("CATALOG_REGISTRY_ERROR");
    await expect(page.locator("#stage h1")).toHaveText("Model Draft Request");
    await expectNoHorizontalOverflow(page, "rejected message step");
  });

  test("Tab reaches the diagnostics panel by keyboard, with a visible focus indicator", async ({ page }) => {
    await openInspector(page);
    await page.locator("#timeline").getByRole("button", { name: /^4\. frame-error/ }).click();
    await expect(page.locator("#error-panel .diagnostics-panel")).toBeVisible();
    await tabToSelector(page, "#error-panel .diagnostics-panel");
  });

  test("Button clicks in the live surface only fill the suppressed log, and nothing is sent", async ({ page }) => {
    const requests: string[] = [];
    const errors: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    page.on("pageerror", (error) => errors.push(error.message));
    await openInspector(page);
    await page.locator("#step-slider").focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#step-summary")).toContainText(`Step 3 of ${STEP_COUNT}:`);
    await expect(page.locator("#stage").getByRole("button", { name: "Create request" })).toBeVisible();

    requests.length = 0;
    await page.locator("#stage").getByRole("button", { name: "Create request" }).click();
    await expect(page.locator("#suppressed-count")).toHaveText("1 suppressed event. Nothing was sent.");
    await expect(page.locator("#suppressed-log")).toContainText("reference.createRequest (not sent)");

    await page.waitForTimeout(300);
    expect(requests, "the page must not send anything after a click").toEqual([]);
    expect(errors, "no page errors").toEqual([]);
  });

  test("stepping through the whole trace makes no requests and throws no page errors", async ({ page }) => {
    const requests: string[] = [];
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openInspector(page);
    page.on("request", (request) => requests.push(request.url()));
    for (let step = 2; step <= STEP_COUNT; step += 1) await page.locator("#next").click();
    await page.locator("#timeline").getByRole("button", { name: /^4\. frame-error/ }).click();
    await page.locator("#stage").getByRole("button", { name: "Create request" }).click();
    await expect(page.locator("#suppressed-count")).toHaveText("1 suppressed event. Nothing was sent.");
    await page.waitForTimeout(200);
    expect(requests, "stepping and clicking must not send requests").toEqual([]);
    expect(errors, "no page errors").toEqual([]);
  });

  test("trace text is shown as text, and never runs as markup", async ({ page }) => {
    await openInspector(page);
    // The committed sample, with a Text label that tries to run script. The page must render it as text.
    const sample = readFileSync(fileURLToPath(new URL("../samples/reference-request.weaver-trace.json", import.meta.url)), "utf8");
    const payload = "<img src=x onerror='window.__traceRan = 1'>Create request";
    const injected = sample.replaceAll("Create request", payload);
    expect(injected).not.toBe(sample);
    await page.locator("#trace-file").setInputFiles({ name: "injected.json", mimeType: "application/json", buffer: Buffer.from(injected) });
    await expect(page.locator("#source-status")).toContainText('Loaded file "injected.json"');
    // Step 3 holds the component message with the payload, so the live surface renders it.
    await page.locator("#timeline").getByRole("button", { name: /^3\. message/ }).click();
    await expect(page.locator("#step-summary")).toContainText("Step 3 of 10:");
    await expect(page.locator("#entry-json")).toContainText("<img src=x onerror=");
    await expect(page.locator("#stage")).toContainText("<img src=x onerror='window.__traceRan = 1'>Create request");
    const ran = await page.evaluate(() => (window as unknown as { __traceRan?: number }).__traceRan);
    expect(ran).toBeUndefined();
  });

  test("a file that is not a trace shows a readable message and keeps the current trace", async ({ page }) => {
    await openInspector(page);
    await page.locator("#trace-file").setInputFiles({
      name: "not-a-trace.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ format: "other", version: 1, truncated: false, entries: [] })),
    });
    await expect(page.locator("#load-error")).toContainText("not a weaver-trace file");
    await expect(page.locator("#source-status")).toContainText("the bundled sample");
    await expect(page.locator("#step-summary")).toContainText(`Step 1 of ${STEP_COUNT}:`);
  });
});

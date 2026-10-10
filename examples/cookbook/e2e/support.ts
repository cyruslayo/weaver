import { expect, type Page } from "@playwright/test";

/** What the focused element is, read in the page at the moment it has focus. */
export interface FocusedControl {
  readonly key: string;
  readonly text: string;
  readonly tag: string;
  readonly type: string | null;
  /** The text of the List card the control sits in, read from its single h3. */
  readonly card: string | null;
  readonly inDialog: boolean;
  readonly indicator: boolean;
}

/** Opens a screen and waits until its root heading is rendered by the Weaver runtime. */
export async function openScreen(page: Page, path: string, heading: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
}

/**
 * Fails when the document is wider than the viewport. This is the "no horizontal
 * page scroll" check from the issue, and it reports the widths so a failure is readable.
 */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `document scrollWidth ${scrollWidth}px exceeds viewport ${innerWidth}px`).toBeLessThanOrEqual(innerWidth);
}

/**
 * Tags every visible, enabled interactive control with a stable key, in DOM order.
 * A radio group is one Tab stop, keyed by its group name, because the browser
 * moves between its options with the arrow keys. Returns the keys in DOM order.
 */
export async function tagTabStops(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selector = 'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])';
    const keys: string[] = [];
    let counter = 0;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      if ((el as HTMLButtonElement).disabled) continue;
      if (el.checkVisibility && !el.checkVisibility()) continue;
      if (!el.checkVisibility && el.getClientRects().length === 0) continue;
      if (el instanceof HTMLInputElement && el.type === "radio") {
        const key = `radio:${el.name}`;
        el.dataset.e2eKey = key;
        if (!keys.includes(key)) keys.push(key);
        continue;
      }
      const key = `control:${counter++}`;
      el.dataset.e2eKey = key;
      keys.push(key);
    }
    return keys;
  });
}

/** Describes the focused element in the page, and whether it shows a visible focus indicator. */
export async function describeFocus(page: Page): Promise<FocusedControl> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (el === null || el === document.body) {
      return { key: "none", text: "", tag: "BODY", type: null, card: null, inDialog: false, indicator: false };
    }
    const cs = getComputedStyle(el);
    const indicator = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none";
    const titleOf = (start: HTMLElement): string | null => {
      let node: HTMLElement | null = start;
      for (let depth = 0; node !== null && depth < 8; depth += 1, node = node.parentElement) {
        const headings = node.querySelectorAll("h3");
        if (headings.length === 1) return headings[0]!.textContent?.trim() ?? null;
      }
      return null;
    };
    const control = el as HTMLInputElement;
    const text = (el.textContent ?? "").trim() || control.value || control.getAttribute("aria-label") || "";
    return {
      key: el.dataset.e2eKey ?? `untagged:${el.tagName}`,
      text,
      tag: el.tagName,
      type: el.getAttribute("type"),
      card: titleOf(el),
      inDialog: el.closest('[role="dialog"]') !== null,
      indicator,
    };
  });
}

/**
 * Presses Tab from the start of the page and records every control that takes focus.
 * Consecutive repeats are merged, because a date input takes focus on each of its
 * segments. Stops once focus leaves the page, or after `maxPresses`.
 *
 * The focus indicator is asserted on each control's first arrival by Tab. Later
 * presses inside a control are not checked. On a native date input, the press that
 * leaves the last segment still reports the input as focused, without the ring.
 */
export async function recordTabOrder(page: Page, maxPresses = 60): Promise<{ order: string[]; indicatorFailures: string[] }> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const order: string[] = [];
  const indicatorFailures: string[] = [];
  for (let press = 0; press < maxPresses; press += 1) {
    await page.keyboard.press("Tab");
    const focus = await describeFocus(page);
    if (focus.key === "none") break;
    if (order[order.length - 1] === focus.key) continue;
    order.push(focus.key);
    if (!focus.indicator)
      indicatorFailures.push(`${focus.key} (${focus.tag}${focus.type ? ` type=${focus.type}` : ""} "${focus.text}")`);
  }
  return { order, indicatorFailures };
}

/**
 * Presses Tab until the focused control matches. Fails with the last focus seen if
 * the control is not reached within `maxPresses`. Returns the matching control.
 */
export async function tabUntil(
  page: Page,
  matches: (focus: FocusedControl) => boolean,
  description: string,
  maxPresses = 40,
): Promise<FocusedControl> {
  let last: FocusedControl | undefined;
  for (let press = 0; press < maxPresses; press += 1) {
    await page.keyboard.press("Tab");
    last = await describeFocus(page);
    if (matches(last)) return last;
  }
  throw new Error(`Tab did not reach ${description} within ${maxPresses} presses. Last focus: ${JSON.stringify(last)}`);
}

/** The text of every card title in the column whose heading reads `columnTitle`, in DOM order. */
export async function columnCards(page: Page, columnTitle: string): Promise<string[]> {
  return page.evaluate((title) => {
    const heading = Array.from(document.querySelectorAll("h2")).find((h) => h.textContent?.trim() === title);
    if (heading === undefined || heading.parentElement === null) return [];
    return Array.from(heading.parentElement.querySelectorAll("h3")).map((h) => h.textContent?.trim() ?? "");
  }, columnTitle);
}

/** The value next to a KPI caption, for example "Revenue". */
export async function kpiValue(page: Page, caption: string): Promise<string> {
  return page.evaluate((label) => {
    const captionEl = Array.from(document.querySelectorAll("*")).find(
      (el) => el.children.length === 0 && el.textContent?.trim() === label,
    );
    return captionEl?.nextElementSibling?.textContent?.trim() ?? "";
  }, caption);
}

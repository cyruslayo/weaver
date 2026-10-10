import type { RendererRegistration, WebComponentRenderInput } from "@cylayo/weaver-web";
import type { HydratedValue } from "@cylayo/weaver-core";
import { COOKBOOK_CATALOG_ID, COOKBOOK_MAX_BARS } from "../custom-catalog/catalog.js";

/**
 * A trusted, dependency-free SVG bar chart for the cookbook catalog.
 *
 * It is built with DOM APIs only: `createElementNS` for SVG and `textContent`
 * for every label. It writes no markup strings and evaluates no code.
 *
 * Data rules (documented, and covered by tests):
 * - `values` must be an array. Items that are not objects are skipped.
 * - `label` is shown as text. A non-string label is converted with String(),
 *   and a missing label becomes "".
 * - `value` must be a finite number. Negative values are clamped to zero, so
 *   they draw no bar. Non-numeric values also become zero.
 * - `maxBars` is an integer from 1 to COOKBOOK_MAX_BARS. Only the first
 *   `maxBars` items are drawn, and the note says how many were left out.
 *   An invalid `maxBars` draws no bars. The schema rejects it first, so this
 *   only matters if the renderer is called directly.
 * - An empty list renders an empty state, with no SVG and no table.
 *
 * Colours come from the page's theme custom properties, with a fallback.
 * The Basic theme bridge applies only to the Basic catalog id, so cookbook
 * surfaces read these tokens directly from the host page.
 */

const SVG_NS = "http://www.w3.org/2000/svg";
const BAR_FILL = "var(--a2ui-color-primary, #2a78d6)";
const INK = "currentColor";

/** Viewbox geometry. The SVG scales with its container through width:100%. */
const VIEW_WIDTH = 320;
const VIEW_HEIGHT = 200;
const PLOT_LEFT = 8;
const PLOT_RIGHT = VIEW_WIDTH - 8;
const PLOT_TOP = 28;
const PLOT_BOTTOM = 160;
const BAR_GAP = 2;
const BAR_MAX_WIDTH = 48;
const BAR_RADIUS = 4;
/** Above this count, per-bar text labels would overlap. The table and the hover titles carry the values. */
const DIRECT_LABEL_LIMIT = 12;

export interface BarChartItem {
  readonly label: string;
  readonly value: number;
}

export interface BarChartModel {
  readonly title: string;
  readonly bars: readonly BarChartItem[];
  /** How many items were left out because of maxBars. */
  readonly omitted: number;
  /** How many items the data had, before maxBars. */
  readonly total: number;
}

let chartSequence = 0;

function isRecord(value: HydratedValue): value is { [key: string]: HydratedValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Maps the hydrated properties to the bars to draw. Pure, so tests can call it directly. */
export function barChartModel(properties: Readonly<Record<string, HydratedValue>>): BarChartModel {
  const title = typeof properties.title === "string" ? properties.title : "";
  const rawItems = Array.isArray(properties.values) ? properties.values : [];
  const items: BarChartItem[] = [];
  for (const raw of rawItems) {
    if (!isRecord(raw)) continue;
    const label = typeof raw.label === "string" ? raw.label : typeof raw.label === "number" ? String(raw.label) : "";
    const value = typeof raw.value === "number" && Number.isFinite(raw.value) ? Math.max(0, raw.value) : 0;
    items.push({ label, value });
  }

  const requested = properties.maxBars;
  const limit = typeof requested === "number" && Number.isInteger(requested) && requested >= 1
    ? Math.min(requested, COOKBOOK_MAX_BARS)
    : 0;
  const bars = items.slice(0, limit);
  return { title, bars, omitted: items.length - bars.length, total: items.length };
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function svgElement(document: Document, name: string): SVGElement {
  return document.createElementNS(SVG_NS, name) as SVGElement;
}

/** The table is visually hidden, but it stays in the accessibility tree and in the DOM. */
const VISUALLY_HIDDEN = "position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;";

function barPath(x: number, width: number, height: number): string {
  const top = PLOT_BOTTOM - height;
  const radius = Math.min(BAR_RADIUS, width / 2, height);
  const left = round(x);
  const right = round(x + width);
  const r = round(radius);
  return [
    `M${left} ${PLOT_BOTTOM}`,
    `V${round(top + r)}`,
    `Q${left} ${round(top)} ${round(left + r)} ${round(top)}`,
    `H${round(right - r)}`,
    `Q${right} ${round(top)} ${right} ${round(top + r)}`,
    `V${PLOT_BOTTOM}`,
    "Z",
  ].join(" ");
}

function renderSvg(document: Document, title: string, titleId: string, bars: readonly BarChartItem[]): SVGElement {
  const svg = svgElement(document, "svg");
  svg.setAttribute("viewBox", `0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-labelledby", titleId);
  svg.setAttribute("style", "display: block; width: 100%; height: auto; overflow: visible;");

  const accessibleTitle = svgElement(document, "title");
  accessibleTitle.setAttribute("id", titleId);
  accessibleTitle.textContent = title === "" ? "Bar chart" : title;
  svg.append(accessibleTitle);

  const baseline = svgElement(document, "line");
  baseline.setAttribute("x1", String(PLOT_LEFT));
  baseline.setAttribute("x2", String(PLOT_RIGHT));
  baseline.setAttribute("y1", String(PLOT_BOTTOM));
  baseline.setAttribute("y2", String(PLOT_BOTTOM));
  baseline.setAttribute("stroke", INK);
  baseline.setAttribute("stroke-opacity", "0.35");
  baseline.setAttribute("stroke-width", "1");
  svg.append(baseline);

  const max = bars.reduce((peak, bar) => Math.max(peak, bar.value), 0);
  const scale = max > 0 ? (PLOT_BOTTOM - PLOT_TOP) / max : 0;
  const slot = bars.length === 0 ? 0 : (PLOT_RIGHT - PLOT_LEFT) / bars.length;
  const width = Math.max(1, Math.min(BAR_MAX_WIDTH, slot - BAR_GAP));
  const directLabels = bars.length <= DIRECT_LABEL_LIMIT;

  bars.forEach((bar, index) => {
    const group = svgElement(document, "g");
    group.setAttribute("data-chart-bar", String(index));
    group.setAttribute("data-chart-label", bar.label);
    group.setAttribute("data-chart-value", String(bar.value));

    const hover = svgElement(document, "title");
    hover.textContent = `${bar.label}: ${formatValue(bar.value)}`;
    group.append(hover);

    const x = PLOT_LEFT + index * slot + (slot - width) / 2;
    const height = bar.value * scale;
    if (height > 0) {
      const path = svgElement(document, "path");
      path.setAttribute("d", barPath(x, width, height));
      path.setAttribute("style", `fill: ${BAR_FILL};`);
      group.append(path);
    }

    const centre = round(x + width / 2);
    if (directLabels) {
      const value = svgElement(document, "text");
      value.setAttribute("x", String(centre));
      value.setAttribute("y", String(round(PLOT_BOTTOM - height - 6)));
      value.setAttribute("text-anchor", "middle");
      value.setAttribute("font-size", "12");
      value.setAttribute("style", `fill: ${INK};`);
      value.textContent = formatValue(bar.value);
      group.append(value);

      const name = svgElement(document, "text");
      name.setAttribute("x", String(centre));
      name.setAttribute("y", String(PLOT_BOTTOM + 16));
      name.setAttribute("text-anchor", "middle");
      name.setAttribute("font-size", "11");
      name.setAttribute("style", `fill: ${INK};`);
      name.textContent = bar.label;
      group.append(name);
    }
    svg.append(group);
  });
  return svg;
}

function renderTable(document: Document, title: string, captionId: string, bars: readonly BarChartItem[]): HTMLTableElement {
  const table = document.createElement("table");
  table.setAttribute("data-weaver-chart-table", "");
  table.setAttribute("aria-labelledby", captionId);
  table.setAttribute("style", VISUALLY_HIDDEN);

  const caption = document.createElement("caption");
  caption.id = captionId;
  caption.textContent = title === "" ? "Bar chart data" : title;
  table.append(caption);

  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const heading of ["Label", "Value"]) {
    const cell = document.createElement("th");
    cell.setAttribute("scope", "col");
    cell.textContent = heading;
    headRow.append(cell);
  }
  head.append(headRow);
  table.append(head);

  const body = document.createElement("tbody");
  for (const bar of bars) {
    const row = document.createElement("tr");
    const label = document.createElement("th");
    label.setAttribute("scope", "row");
    label.textContent = bar.label;
    const value = document.createElement("td");
    value.textContent = formatValue(bar.value);
    row.append(label, value);
    body.append(row);
  }
  table.append(body);
  return table;
}

function paragraph(document: Document, text: string, attribute?: string): HTMLParagraphElement {
  const element = document.createElement("p");
  if (attribute !== undefined) element.setAttribute(attribute, "");
  element.textContent = text;
  return element;
}

/** The renderer. It is trusted host code and is registered for the cookbook catalog only. */
export function renderBarChart(input: WebComponentRenderInput): Node {
  const { document } = input;
  const model = barChartModel(input.properties);
  const sequence = ++chartSequence;
  const titleId = `weaver-barchart-title-${sequence}`;
  const captionId = `weaver-barchart-caption-${sequence}`;

  const root = document.createElement("div");
  root.setAttribute("data-a2ui-component", "BarChart");
  root.setAttribute("data-weaver-chart-state", model.bars.length === 0 ? "empty" : "ready");
  root.setAttribute("style", "display: block; min-width: 0; margin: 0 0 8px;");

  if (model.title !== "") root.append(paragraph(document, model.title, "data-weaver-chart-title"));

  if (model.bars.length === 0) {
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", model.title === "" ? "Bar chart" : model.title);
    root.append(paragraph(document, "No data to chart.", "data-weaver-chart-empty"));
    return root;
  }

  root.append(renderSvg(document, model.title, titleId, model.bars));
  root.append(renderTable(document, model.title, captionId, model.bars));
  if (model.omitted > 0) {
    root.append(paragraph(document, `Showing the first ${model.bars.length} of ${model.total} items.`, "data-weaver-chart-note"));
  }
  return root;
}

/** The registration for one BarChart entry. The cookbook catalog id is the default. */
export function createBarChartRegistration(catalogId: string = COOKBOOK_CATALOG_ID): RendererRegistration {
  return { catalogId, component: "BarChart", render: renderBarChart };
}

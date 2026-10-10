import type {
  RendererRegistration,
  WebComponentRenderer,
} from "@cylayo/weaver-web";
import { COOKBOOK_CATALOG_ID } from "./catalog.js";

/**
 * Trusted, host-owned renderer for the cookbook DataTable component.
 *
 * Every string reaches the page through textContent or an attribute. Nothing is
 * parsed as HTML. Rows and columns come from the bound data model, which the
 * host never trusts as markup.
 */

export const DATA_TABLE_COMPONENT = "DataTable";

type ColumnAlign = "start" | "center" | "end";
const COLUMN_ALIGNS: readonly ColumnAlign[] = ["start", "center", "end"];

interface DataTableColumn {
  readonly key: string;
  readonly header: string;
  readonly align?: ColumnAlign;
}

type DataTableRow = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads the columns defensively. Core has already validated them against the catalog schema. */
function readColumns(value: unknown): DataTableColumn[] {
  if (!Array.isArray(value)) return [];
  const columns: DataTableColumn[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.key !== "string" || typeof item.header !== "string") continue;
    const align = COLUMN_ALIGNS.find((candidate) => candidate === item.align);
    columns.push({
      key: item.key,
      header: item.header,
      ...(align === undefined ? {} : { align }),
    });
  }
  return columns;
}

function readRows(value: unknown): DataTableRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function cellValue(row: DataTableRow, key: string): unknown {
  return Object.hasOwn(row, key) ? row[key] : undefined;
}

/** Plain text for one cell. Objects and arrays render as an empty cell rather than as markup. */
function cellText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return "";
}

/** A column is numeric when every present value is a number and at least one exists. */
function isNumericColumn(rows: readonly DataTableRow[], key: string): boolean {
  let sawNumber = false;
  for (const row of rows) {
    const value = cellValue(row, key);
    if (typeof value === "number" && Number.isFinite(value)) sawNumber = true;
    else if (value !== undefined && value !== null) return false;
  }
  return sawNumber;
}

function alignmentOf(column: DataTableColumn, numeric: boolean): ColumnAlign {
  return column.align ?? (numeric ? "end" : "start");
}

/**
 * Read-only: the table renders no controls. Row-level actions use a List template of Cards,
 * where each row is a real template instance with its own scope.
 */
export const renderDataTable: WebComponentRenderer = ({ document, properties }) => {
  const columns = readColumns(properties.columns);
  const rows = readRows(properties.rows);
  const numeric = new Map(columns.map((column) => [column.key, isNumericColumn(rows, column.key)]));

  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-cookbook-component", DATA_TABLE_COMPONENT);
  // The wrapper scrolls sideways, so a wide table never widens the page.
  wrapper.style.maxWidth = "100%";
  wrapper.style.overflowX = "auto";

  const table = document.createElement("table");
  table.style.borderCollapse = "collapse";
  table.style.width = "100%";

  if (typeof properties.caption === "string" && properties.caption.length > 0) {
    const caption = document.createElement("caption");
    caption.style.captionSide = "top";
    caption.style.textAlign = "start";
    caption.style.fontWeight = "600";
    caption.style.padding = "4px 0";
    caption.textContent = properties.caption;
    table.append(caption);
  }

  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const column of columns) {
    const th = document.createElement("th");
    th.setAttribute("scope", "col");
    th.style.textAlign = alignmentOf(column, numeric.get(column.key) === true);
    th.style.padding = "6px 12px";
    th.style.borderBlockEnd = "1px solid currentColor";
    th.style.whiteSpace = "nowrap";
    th.textContent = column.header;
    headRow.append(th);
  }
  head.append(headRow);
  table.append(head);

  const body = document.createElement("tbody");
  if (rows.length === 0) {
    const emptyRow = document.createElement("tr");
    const empty = document.createElement("td");
    empty.colSpan = Math.max(columns.length, 1);
    empty.style.padding = "6px 12px";
    empty.textContent = "No rows";
    emptyRow.append(empty);
    body.append(emptyRow);
  }
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    columns.forEach((column) => {
      const td = document.createElement("td");
      td.style.textAlign = alignmentOf(column, numeric.get(column.key) === true);
      td.style.padding = "6px 12px";
      td.style.borderBlockEnd = "1px solid rgba(127, 127, 127, 0.35)";
      td.textContent = cellText(cellValue(row, column.key));
      tr.append(td);
    });
    body.append(tr);
  });
  table.append(body);

  wrapper.append(table);
  return wrapper;
};

/** The registration the cookbook catalog's renderer list includes. */
export const dataTableRegistration: RendererRegistration = {
  catalogId: COOKBOOK_CATALOG_ID,
  component: DATA_TABLE_COMPONENT,
  render: renderDataTable,
};

import type { A2UIComponent, JsonObject, JsonValue } from "@cylayo/weaver-core";
import type { CookbookScreenDefinition } from "../shared/harness.js";
import { cookbookCatalog } from "../custom-catalog/catalog.js";
import { cookbookCatalogRendererRegistrations } from "../custom-catalog/renderers.js";
import { createSeededRandom } from "./dashboard.js";

export const ORDERS_SURFACE_ID = "cookbook-orders-report";
export const ORDERS_REFRESH = "cookbook.orders.refresh";

export const ORDER_STATUSES = ["Pending", "Paid", "Shipped", "Refunded"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** One order row. A `type` alias, so it is assignable to the JSON data model. */
export type OrderRow = {
  readonly id: string;
  readonly customer: string;
  readonly status: OrderStatus;
  /** Whole US dollars, so the table shows the number as it is. */
  readonly total: number;
};

export type StatusTotal = { readonly label: OrderStatus; readonly value: number };

export type OrdersReportState = {
  /** The number of Refresh clicks. It is the seed of the next data set. */
  readonly refreshes: number;
  readonly orders: readonly OrderRow[];
  readonly summary: { readonly byStatus: readonly StatusTotal[] };
};

const CUSTOMERS = [
  "Northwind",
  "Contoso",
  "Globex",
  "Initech",
  "Umbrella",
  "Hooli",
  "Acme",
  "Stark Industries",
] as const;

const ORDER_COUNT = CUSTOMERS.length;
const FIRST_ORDER_NUMBER = 1040;

/**
 * Builds the whole data set for one refresh count. Pure and deterministic, so
 * the same click sequence always yields the same orders and totals.
 */
export function ordersSnapshot(refreshes: number): OrdersReportState {
  const random = createSeededRandom(refreshes);
  const orders: OrderRow[] = CUSTOMERS.slice(0, ORDER_COUNT).map((customer, index) => ({
    id: `ORD-${FIRST_ORDER_NUMBER + index}`,
    customer,
    status: ORDER_STATUSES[Math.floor(random() * ORDER_STATUSES.length)]!,
    total: 20 + Math.floor(random() * 980),
  }));
  const byStatus: StatusTotal[] = ORDER_STATUSES.map((status) => ({
    label: status,
    value: orders
      .filter((order) => order.status === status)
      .reduce((sum, order) => sum + order.total, 0),
  }));
  return { refreshes, orders, summary: { byStatus } };
}

/** The Refresh context must echo the current refresh count, so a stale or forged click is rejected. */
function isCurrentRefreshCount(value: JsonValue | undefined, current: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value === current;
}

const COLUMNS = [
  { key: "id", header: "Order" },
  { key: "customer", header: "Customer" },
  { key: "status", header: "Status" },
  { key: "total", header: "Total (USD)", align: "end" },
] as const;

function ordersComponents(): A2UIComponent[] {
  return [
    {
      id: "root",
      component: "Column",
      children: ["heading", "intro", "refreshButton", "ordersCard", "chartCard"],
    },
    { id: "heading", component: "Text", variant: "h1", text: "Orders report" },
    {
      id: "intro",
      component: "Text",
      variant: "body",
      text: "Orders and their value by status. Refresh loads the next data set, and the agent answers with data-model updates only.",
    },
    {
      id: "refreshButton",
      component: "Button",
      variant: "primary",
      child: "refreshLabel",
      action: {
        event: {
          name: ORDERS_REFRESH,
          context: { refreshes: { path: "/refreshes" } },
        },
      },
    },
    { id: "refreshLabel", component: "Text", text: "Refresh" },
    { id: "ordersCard", component: "Card", child: "orders" },
    {
      id: "orders",
      component: "DataTable",
      caption: "Orders",
      columns: COLUMNS.map((column) => ({ ...column })),
      rows: { path: "/orders" },
    } as unknown as A2UIComponent,
    { id: "chartCard", component: "Card", child: "chart" },
    {
      id: "chart",
      component: "BarChart",
      title: "Order value by status (USD)",
      values: { path: "/summary/byStatus" },
      maxBars: 10,
    } as unknown as A2UIComponent,
  ];
}

/**
 * An orders report on the cookbook catalog. The host owns the data. Refresh
 * sends only the current refresh count, and the agent answers with
 * `updateDataModel` for the three paths that changed. The component tree is
 * never resent after the first render.
 */
export const ordersReportScreen: CookbookScreenDefinition<OrdersReportState> = {
  surfaceId: ORDERS_SURFACE_ID,
  attributionName: "Orders Agent",
  initialState: ordersSnapshot(0),
  components: ordersComponents,
  catalog: {
    catalog: cookbookCatalog,
    renderers: cookbookCatalogRendererRegistrations,
  },
  actions: {
    [ORDERS_REFRESH]: {
      transition: (state, context) => {
        // Core always sends an object, but the transition still rejects a missing context instead of throwing.
        const echoed = (context as JsonObject | undefined)?.refreshes;
        if (!isCurrentRefreshCount(echoed, state.refreshes)) return undefined;
        return ordersSnapshot(state.refreshes + 1);
      },
      dataUpdates: (_previous, next) => [
        { path: "/refreshes", value: next.refreshes },
        { path: "/orders", value: next.orders.map((order) => ({ ...order })) },
        { path: "/summary/byStatus", value: next.summary.byStatus.map((item) => ({ ...item })) },
      ],
    },
  },
};

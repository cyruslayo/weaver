import type { A2UIComponent } from "@cylayo/weaver-core";
import type { CookbookScreenDefinition } from "../shared/harness.js";

export const DASHBOARD_SURFACE_ID = "cookbook-dashboard";
export const DASHBOARD_REFRESH = "cookbook.dashboard.refresh";
export const DASHBOARD_APPLY_FILTER = "cookbook.dashboard.applyFilter";

export const DASHBOARD_FILTERS = ["all", "sales", "support", "ops"] as const;
export type DashboardFilter = (typeof DASHBOARD_FILTERS)[number];

export interface DashboardItem {
  readonly name: string;
  readonly category: Exclude<DashboardFilter, "all">;
  readonly amount: number;
  readonly units: number;
}

export interface DashboardState {
  /** The number of Refresh clicks. It is the seed of the next data set. */
  readonly refreshes: number;
  /** The applied filter, as the one-element selection the ChoicePicker writes. */
  readonly filter: string[];
  readonly kpi: { readonly revenue: number; readonly orders: number; readonly averageOrder: number };
  readonly metrics: { readonly items: readonly DashboardItem[] };
}

const ITEM_TEMPLATES: readonly Omit<DashboardItem, "amount" | "units">[] = [
  { name: "Enterprise renewals", category: "sales" },
  { name: "New logos", category: "sales" },
  { name: "Ticket backlog", category: "support" },
  { name: "First response time", category: "support" },
  { name: "Deploys shipped", category: "ops" },
  { name: "Incidents closed", category: "ops" },
];

/**
 * A small deterministic generator (mulberry32). The host seeds it from the
 * refresh count, so the same click sequence always yields the same data.
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function isDashboardFilter(value: string): value is DashboardFilter {
  return (DASHBOARD_FILTERS as readonly string[]).includes(value);
}

/** Builds the whole data set for a refresh count and a filter. Pure, so it is safe to call twice. */
export function dashboardSnapshot(refreshes: number, filter: DashboardFilter): DashboardState {
  const random = createSeededRandom(refreshes);
  const all: DashboardItem[] = ITEM_TEMPLATES.map((template) => ({
    ...template,
    amount: 500 + Math.floor(random() * 9500),
    units: 10 + Math.floor(random() * 990),
  }));
  const revenue = all.reduce((sum, item) => sum + item.amount, 0);
  const orders = 100 + Math.floor(random() * 900);
  const visible = filter === "all" ? all : all.filter((item) => item.category === filter);
  return {
    refreshes,
    filter: [filter],
    kpi: {
      revenue,
      orders,
      averageOrder: Math.round((revenue / orders) * 100) / 100,
    },
    metrics: { items: visible },
  };
}

/** Accepts exactly one allowlisted filter from the trusted context. Anything else is rejected. */
function filterFromContext(context: Record<string, unknown>): DashboardFilter | undefined {
  const selection = context.filter;
  if (!Array.isArray(selection) || selection.length !== 1) return undefined;
  const [choice] = selection;
  return typeof choice === "string" && isDashboardFilter(choice) ? choice : undefined;
}

const FILTER_OPTIONS = [
  { label: "All teams", value: "all" },
  { label: "Sales", value: "sales" },
  { label: "Support", value: "support" },
  { label: "Ops", value: "ops" },
];

function kpiTile(id: string, label: string, valueText: A2UIComponent["text"]): A2UIComponent[] {
  return [
    { id, component: "Card", weight: 1, child: `${id}Body` },
    { id: `${id}Body`, component: "Column", children: [`${id}Label`, `${id}Value`] },
    { id: `${id}Label`, component: "Text", variant: "caption", text: label },
    { id: `${id}Value`, component: "Text", variant: "h3", text: valueText },
  ];
}

function dashboardComponents(): A2UIComponent[] {
  return [
    {
      id: "root",
      component: "Column",
      children: ["heading", "kpis", "controls", "items"],
    },
    { id: "heading", component: "Text", variant: "h1", text: "Team dashboard" },
    { id: "kpis", component: "Row", children: ["kpiRevenue", "kpiOrders", "kpiAverage"] },
    ...kpiTile("kpiRevenue", "Revenue", {
      call: "formatCurrency",
      args: { value: { path: "/kpi/revenue" }, currency: "USD", decimals: 0 },
      returnType: "string",
    }),
    ...kpiTile("kpiOrders", "Orders", {
      call: "formatNumber",
      args: { value: { path: "/kpi/orders" } },
      returnType: "string",
    }),
    ...kpiTile("kpiAverage", "Average order", {
      call: "formatCurrency",
      args: { value: { path: "/kpi/averageOrder" }, currency: "USD", decimals: 2 },
      returnType: "string",
    }),
    {
      id: "controls",
      component: "Row",
      children: ["filter", "applyButton", "refreshButton"],
    },
    {
      id: "filter",
      component: "ChoicePicker",
      weight: 1,
      label: "Team",
      variant: "mutuallyExclusive",
      options: FILTER_OPTIONS,
      value: { path: "/filter" },
    },
    {
      id: "applyButton",
      component: "Button",
      child: "applyLabel",
      action: {
        event: {
          name: DASHBOARD_APPLY_FILTER,
          context: { filter: { path: "/filter" } },
        },
      },
    },
    { id: "applyLabel", component: "Text", text: "Apply filter" },
    {
      id: "refreshButton",
      component: "Button",
      variant: "primary",
      child: "refreshLabel",
      action: {
        event: {
          name: DASHBOARD_REFRESH,
          context: { filter: { path: "/filter" } },
        },
      },
    },
    { id: "refreshLabel", component: "Text", text: "Refresh" },
    {
      id: "items",
      component: "List",
      children: { componentId: "itemRow", path: "/metrics/items" },
    },
    {
      id: "itemRow",
      component: "Row",
      children: ["itemName", "itemAmount", "itemUnits"],
    },
    { id: "itemName", component: "Text", text: { path: "name" } },
    {
      id: "itemAmount",
      component: "Text",
      text: {
        call: "formatCurrency",
        args: { value: { path: "amount" }, currency: "USD", decimals: 0 },
        returnType: "string",
      },
    },
    {
      id: "itemUnits",
      component: "Text",
      text: {
        call: "formatNumber",
        args: { value: { path: "units" } },
        returnType: "string",
      },
    },
  ];
}

/**
 * A KPI and list dashboard. The host owns the data. Refresh and Apply filter
 * send only the trusted filter selection, and the agent answers with
 * `updateDataModel`. The component tree is never resent after the first render.
 */
export const dashboardScreen: CookbookScreenDefinition<DashboardState> = {
  surfaceId: DASHBOARD_SURFACE_ID,
  attributionName: "Dashboard Agent",
  initialState: dashboardSnapshot(0, "all"),
  components: dashboardComponents,
  actions: {
    [DASHBOARD_REFRESH]: {
      transition: (state, context) => {
        const filter = filterFromContext(context);
        if (filter === undefined) return undefined;
        return dashboardSnapshot(state.refreshes + 1, filter);
      },
    },
    [DASHBOARD_APPLY_FILTER]: {
      transition: (state, context) => {
        const filter = filterFromContext(context);
        if (filter === undefined) return undefined;
        return dashboardSnapshot(state.refreshes, filter);
      },
    },
  },
};

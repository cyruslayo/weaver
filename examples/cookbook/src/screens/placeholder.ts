import type { A2UIComponent } from "@cylayo/weaver-core";
import type { CookbookScreenDefinition } from "../shared/harness.js";

export const PLACEHOLDER_SURFACE_ID = "cookbook-placeholder";
export const PLACEHOLDER_PING = "cookbook.placeholder.ping";

export interface PlaceholderState {
  count: number;
  countLabel: string;
}

function placeholderComponents(): A2UIComponent[] {
  return [
    { id: "root", component: "Column", children: ["card"] },
    { id: "card", component: "Card", child: "content" },
    {
      id: "content",
      component: "Column",
      children: ["heading", "intro", "ping", "count"],
    },
    { id: "heading", component: "Text", variant: "h1", text: "Cookbook placeholder" },
    {
      id: "intro",
      component: "Text",
      text: "Screens arrive in later issues. This one proves the pipeline end to end.",
    },
    {
      id: "ping",
      component: "Button",
      variant: "primary",
      child: "pingLabel",
      action: { event: { name: PLACEHOLDER_PING, context: {} } },
    },
    { id: "pingLabel", component: "Text", text: "Ping the agent" },
    { id: "count", component: "Text", text: { path: "/countLabel" } },
  ];
}

/** A smoke screen: one allowlisted action that the deterministic agent answers. */
export const placeholderScreen: CookbookScreenDefinition<PlaceholderState> = {
  surfaceId: PLACEHOLDER_SURFACE_ID,
  attributionName: "Cookbook Agent",
  initialState: { count: 0, countLabel: "Pings: 0" },
  components: placeholderComponents,
  actions: {
    [PLACEHOLDER_PING]: {
      transition: (state) => ({
        count: state.count + 1,
        countLabel: `Pings: ${state.count + 1}`,
      }),
    },
  },
};

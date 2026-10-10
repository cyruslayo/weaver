import {
  createA2UIV091Producer,
  describeWeaverError,
  type A2UIComponent,
  type WeaverErrorDescription,
} from "@cylayo/weaver-core";
import { describeWebRenderError, type WebRenderError } from "@cylayo/weaver-web";
import { renderDiagnosticsPanel } from "@weaver/shared";
import {
  encodeA2UIMessage,
  mountCookbookScreen,
  type CookbookScreen,
  type CookbookScreenDefinition,
} from "../shared/harness.js";

export const ERROR_DEMO_SURFACE_ID = "cookbook-error-demo";

export type ErrorDemoItem = { readonly name: string };

export type ErrorDemoState = {
  readonly status: string;
  readonly items: readonly ErrorDemoItem[];
};

const TICKETS: readonly ErrorDemoItem[] = [
  { name: "Login fails on Safari" },
  { name: "Invoice PDF is blank" },
  { name: "Add dark mode" },
];

/**
 * A list far longer than the cookbook's render budget. The data update is valid
 * JSON and valid A2UI, so the runtime accepts it. Rendering then exceeds
 * `maxResolvedInstances` (64), and the surface keeps its previous DOM.
 */
const TOO_MANY_ROWS: readonly ErrorDemoItem[] = Array.from({ length: 70 }, (_, index) => ({
  name: `Ticket ${index + 1}`,
}));

const producer = createA2UIV091Producer();

function errorDemoComponents(): A2UIComponent[] {
  return [
    {
      id: "root",
      component: "Column",
      children: ["heading", "intro", "status", "ticketList"],
    },
    { id: "heading", component: "Text", variant: "h1", text: "Error demo" },
    {
      id: "intro",
      component: "Text",
      variant: "body",
      text: "Three bad updates arrive in order. Each one is rejected or fails to render, and the diagnostics panel lists it. The surface on the left keeps the last good render.",
    },
    { id: "status", component: "Text", variant: "h2", text: { path: "/status" } },
    {
      id: "ticketList",
      component: "List",
      children: { componentId: "ticketName", path: "/items" },
    } as unknown as A2UIComponent,
    // A template item binds relative to its own scope, so the path has no leading slash.
    { id: "ticketName", component: "Text", text: { path: "name" } },
  ];
}

export const errorDemoScreen: CookbookScreenDefinition<ErrorDemoState> = {
  surfaceId: ERROR_DEMO_SURFACE_ID,
  attributionName: "Error Demo",
  initialState: { status: `${TICKETS.length} open tickets`, items: TICKETS },
  components: errorDemoComponents,
  actions: {},
};

/** One bad update, as the raw JSONL text an agent or proxy would send. */
export interface ErrorDemoBadUpdate {
  readonly label: string;
  readonly chunk: string;
}

/** The three bad updates, in the order they are fed. Each one is a single JSONL line. */
export function errorDemoBadUpdates(): ErrorDemoBadUpdate[] {
  // A component type that the Basic catalog does not define. Only the status line changes.
  const invalidComponents = errorDemoComponents().map((component) =>
    component.id === "status" ? ({ ...component, component: "Sparkline" } as unknown as A2UIComponent) : component,
  );
  return [
    {
      label: "A truncated frame",
      // The line stops before its closing braces, as a dropped connection would leave it.
      chunk: '{"version":"v0.9.1","updateDataModel":{"surfaceId":"' + ERROR_DEMO_SURFACE_ID + '","path":"/items"\n',
    },
    {
      label: "A component the Basic catalog does not define",
      chunk: encodeA2UIMessage(producer.updateComponents({ surfaceId: ERROR_DEMO_SURFACE_ID, components: invalidComponents })),
    },
    {
      label: "A list too long to render",
      chunk: encodeA2UIMessage(
        producer.updateDataModel({ surfaceId: ERROR_DEMO_SURFACE_ID, path: "/items", value: [...TOO_MANY_ROWS] }),
      ),
    },
  ];
}

export interface ErrorDemoRun {
  readonly screen: CookbookScreen<ErrorDemoState>;
  /** One description per bad update, in feed order. */
  readonly descriptions: readonly WeaverErrorDescription[];
}

/**
 * Mounts the screen, feeds the three bad updates through the screen's own
 * ingestion, and renders the diagnostics panel. Ingestion failures are described
 * with their frame. A render failure is attributed to the frame whose update
 * caused it, which is the only frame the runtime applied in that push.
 */
export function mountErrorDemo(surface: Element, panel: HTMLElement): ErrorDemoRun {
  const pendingRenderErrors: WebRenderError[] = [];
  const screen = mountCookbookScreen(surface, errorDemoScreen, {
    onRenderError: (error) => {
      pendingRenderErrors.push(error);
    },
  });

  const descriptions: WeaverErrorDescription[] = [];
  for (const update of errorDemoBadUpdates()) {
    const events = screen.stream.push(update.chunk);
    const renderErrors = pendingRenderErrors.splice(0);
    for (const event of events) {
      if (!event.ok) descriptions.push(describeWeaverError(event.error, { frame: event.frame }));
    }
    const frame = events.find((event) => event.ok)?.frame;
    for (const error of renderErrors) {
      // The budget failure carries no surface id, so the host adds the id of the surface it mounted.
      const described = describeWebRenderError(error);
      descriptions.push({
        ...described,
        surfaceId: described.surfaceId ?? ERROR_DEMO_SURFACE_ID,
        ...(frame === undefined ? {} : { frame }),
      });
    }
  }

  renderDiagnosticsPanel(panel, descriptions, {
    title: "Diagnostics",
    headingLevel: 2,
    emptyText: "No bad updates were recorded.",
  });
  return { screen, descriptions };
}

import type {
  A2UIComponent,
  A2UIServerMessage,
  JsonObject,
} from "@weaver/core";
import { createA2UIV091Producer } from "@weaver/core";

export const REFERENCE_SURFACE_ID = "reference-request";
export const REFERENCE_CREATE_REQUEST = "reference.createRequest";
export const REFERENCE_PRIORITIES = ["normal", "high", "urgent"] as const;
export type ReferencePriority = (typeof REFERENCE_PRIORITIES)[number];

export function isReferencePriority(
  value: unknown,
): value is ReferencePriority {
  return (
    typeof value === "string" &&
    REFERENCE_PRIORITIES.includes(value as ReferencePriority)
  );
}

export interface ReferenceAgentState {
  draft: {
    title: string;
    priority: string[];
  };
  result: {
    count: number;
    status: string;
    countLabel: string;
  };
}

export interface ReferenceAgentConfig {
  surfaceId: string;
  catalogId: string;
}

export interface ReferenceCreateRequest {
  title: string;
  priority: readonly string[];
}

export interface ReferenceAgent {
  readonly surfaceId: string;
  getState(): ReferenceAgentState;
  start(): A2UIServerMessage[];
  handleCreateRequest(request: ReferenceCreateRequest): A2UIServerMessage[];
}

const initialState = (): ReferenceAgentState => ({
  draft: { title: "", priority: ["normal"] },
  result: {
    count: 0,
    status: "Ready for a request",
    countLabel: "Submitted: 0",
  },
});

/** A tiny local application agent; a real host can replace its transition with its own orchestrator. */
export function createReferenceAgent(
  config: ReferenceAgentConfig,
): ReferenceAgent {
  const producer = createA2UIV091Producer();
  let state = initialState();

  return {
    surfaceId: config.surfaceId,
    getState: () => structuredClone(state),
    start: () => [
      producer.createSurface({
        surfaceId: config.surfaceId,
        catalogId: config.catalogId,
        sendDataModel: true,
      }),
      producer.updateComponents({
        surfaceId: config.surfaceId,
        components: referenceComponents(),
      }),
      producer.updateDataModel({
        surfaceId: config.surfaceId,
        // SAFETY: ReferenceAgentState contains only JSON-shaped strings, arrays, and numbers.
        value: state as unknown as JsonObject,
      }),
    ],
    handleCreateRequest: (request) => {
      const title = request.title.trim();
      if (title.length === 0)
        throw new Error("Reference request title is required");
      if (
        request.priority.length !== 1 ||
        !isReferencePriority(request.priority[0])
      )
        throw new Error(
          "Reference request priority must be one selected known value",
        );

      state = {
        draft: { title: "", priority: ["normal"] },
        result: {
          count: state.result.count + 1,
          status: `Created: ${title}`,
          countLabel: `Submitted: ${state.result.count + 1}`,
        },
      };
      // SAFETY: ReferenceAgentState contains only JSON-shaped strings, arrays, and numbers.
      return [
        producer.updateDataModel({
          surfaceId: config.surfaceId,
          value: state as unknown as JsonObject,
        }),
      ];
    },
  };
}

function referenceComponents(): A2UIComponent[] {
  return [
    { id: "root", component: "Column", children: ["card"] },
    { id: "card", component: "Card", child: "content" },
    {
      id: "content",
      component: "Column",
      children: [
        "heading",
        "intro",
        "title",
        "priority",
        "submit",
        "statusLabel",
        "status",
        "count",
      ],
    },
    {
      id: "heading",
      component: "Text",
      variant: "h1",
      text: "Reference Request",
    },
    {
      id: "intro",
      component: "Text",
      text: "A small producer-to-renderer round trip.",
    },
    {
      id: "title",
      component: "TextField",
      label: "Request title",
      value: { path: "/draft/title" },
    },
    {
      id: "priority",
      component: "ChoicePicker",
      label: "Priority",
      variant: "mutuallyExclusive",
      displayStyle: "chips",
      options: [
        { label: "Normal", value: "normal" },
        { label: "High", value: "high" },
        { label: "Urgent", value: "urgent" },
      ],
      value: { path: "/draft/priority" },
    },
    {
      id: "submit",
      component: "Button",
      variant: "primary",
      child: "submitLabel",
      action: {
        event: {
          name: REFERENCE_CREATE_REQUEST,
          context: {
            title: { path: "/draft/title" },
            priority: { path: "/draft/priority" },
          },
        },
      },
    },
    { id: "submitLabel", component: "Text", text: "Create request" },
    { id: "statusLabel", component: "Text", variant: "h2", text: "Status" },
    { id: "status", component: "Text", text: { path: "/result/status" } },
    { id: "count", component: "Text", text: { path: "/result/countLabel" } },
  ];
}

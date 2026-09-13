import type { JsonObject } from "@weaver/core";
import {
  createBasicWebRuntime,
  type BasicWebRuntime,
  type WebServerEventHandoff,
  type WebSurfaceMount,
} from "@weaver/web";
import {
  createReferenceAgent,
  isReferencePriority,
  REFERENCE_CREATE_REQUEST,
  REFERENCE_SURFACE_ID,
  type ReferenceAgent,
} from "./application-agent.js";
import { createAgentStream, type AgentStream } from "./agent-stream.js";

export type ReferenceEventResult =
  | { accepted: true; context: JsonObject }
  | { accepted: false; reason: string };

export interface ReferenceApplication {
  readonly web: BasicWebRuntime;
  readonly agent: ReferenceAgent;
  readonly stream: AgentStream;
  readonly surfaceId: string;
  readonly lastAcceptedContext: JsonObject | undefined;
  readonly rejectedEventNames: readonly string[];
  readonly mount: WebSurfaceMount;
  handleServerEvent(event: WebServerEventHandoff): ReferenceEventResult;
}

class ReferenceApplicationImpl implements ReferenceApplication {
  readonly surfaceId = REFERENCE_SURFACE_ID;
  lastAcceptedContext: JsonObject | undefined;
  readonly rejectedEventNames: string[] = [];
  mount!: WebSurfaceMount;

  constructor(
    readonly web: BasicWebRuntime,
    readonly agent: ReferenceAgent,
    readonly stream: AgentStream,
  ) {}

  handleServerEvent(event: WebServerEventHandoff): ReferenceEventResult {
    const action = event.message.action;
    if (action.name !== REFERENCE_CREATE_REQUEST) {
      this.rejectedEventNames.push(action.name);
      return { accepted: false, reason: "EVENT_NOT_ALLOWLISTED" };
    }
    if (action.surfaceId !== this.surfaceId) {
      return { accepted: false, reason: "SURFACE_NOT_ALLOWED" };
    }

    const title = action.context.title;
    const priority = action.context.priority;
    if (
      typeof title !== "string" ||
      title.trim().length === 0 ||
      !Array.isArray(priority) ||
      priority.length !== 1 ||
      !isReferencePriority(priority[0])
    ) {
      return { accepted: false, reason: "INVALID_EVENT_CONTEXT" };
    }

    const selectedPriority = priority[0];
    const context = { title, priority: [selectedPriority] };
    this.lastAcceptedContext = structuredClone(context);
    this.stream.send(
      this.agent.handleCreateRequest({ title, priority: [selectedPriority] }),
    );
    return { accepted: true, context };
  }
}

/** Builds the complete reference composition around one Basic Web runtime. */
export function createReferenceApplication(
  target: Element,
): ReferenceApplication {
  let handoff: (event: WebServerEventHandoff) => void = () => {
    throw new Error("Reference application event handler is not ready");
  };
  const created = createBasicWebRuntime({
    runtime: { safety: { maxResolutionDepth: 16, maxResolvedInstances: 64 } },
    rendering: {
      attributionProvider: () => ({ displayName: "Reference Agent" }),
      onServerEvent: (event) => handoff(event),
    },
  });
  if (!created.ok)
    throw new Error(
      `Reference Web runtime configuration failed: ${created.error.code}`,
    );

  const web = created.value;
  const agent = createReferenceAgent({
    surfaceId: REFERENCE_SURFACE_ID,
    catalogId: web.catalogId,
  });
  const stream = createAgentStream(web.runtime);
  const application = new ReferenceApplicationImpl(web, agent, stream);
  handoff = (event) => {
    application.handleServerEvent(event);
  };

  stream.send(agent.start());
  const mounted = web.mount({ surfaceId: REFERENCE_SURFACE_ID, target });
  if (!mounted.ok)
    throw new Error(
      `Reference application mount failed: ${mounted.error.code}`,
    );
  application.mount = mounted.value;
  return application;
}

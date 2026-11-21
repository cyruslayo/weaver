import type { A2UIFunctionResponse, JsonObject } from "./types.js";
import type {
  A2UIRendererErrorMessage,
  A2UIValidationFailedRendererMessage,
} from "./outbound/types.js";

/** renderer-to-agent action event. userMessage and metadata are optional. */
export interface A2UIRendererActionMessage {
  version: "1.0";
  action: {
    name: string;
    userMessage?: string;
    surfaceId: string;
    sourceComponentId: string;
    timestamp: string;
    context: JsonObject;
    metadata?: { extensions?: JsonObject };
  };
}

/**
 * A function call the renderer asks the agent to run. The catalogId is optional
 * on this side; the surface default applies when it is omitted.
 */
export interface A2UIRendererFunctionCall {
  "@call": string;
  catalogId?: string;
  args?: JsonObject;
}

/** renderer-to-agent callAgentFunction. Types only; Weaver does not send these yet. */
export interface A2UIRendererCallAgentFunctionMessage {
  version: "1.0";
  callAgentFunction: {
    surfaceId: string;
    functionCallId: string;
    callFunction: A2UIRendererFunctionCall;
  };
}

/** renderer-to-agent rendererFunctionResponse. Types only; Weaver does not send these yet. */
export interface A2UIRendererFunctionResponseMessage {
  version: "1.0";
  rendererFunctionResponse: A2UIFunctionResponse;
}

/** Every renderer-to-agent event message: exactly one of the four envelope keys. */
export type A2UIRendererToAgentMessage =
  | A2UIRendererActionMessage
  | A2UIRendererCallAgentFunctionMessage
  | A2UIRendererFunctionResponseMessage
  | A2UIValidationFailedRendererMessage
  | A2UIRendererErrorMessage;

/** Data-model metadata payload for a future transport adapter. */
export interface A2UIRendererDataModel {
  version: "1.0";
  surfaces: Record<string, JsonObject>;
}

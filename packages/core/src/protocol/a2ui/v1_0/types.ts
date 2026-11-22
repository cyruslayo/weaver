export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

/** The only A2UI wire version accepted or emitted by Weaver. */
export type A2UIV10WireVersion = "1.0";

export interface A2UIComponent {
  id: string;
  component: string;
  [key: string]: JsonValue;
}

/** Optional surface-level metadata. Extension keys are validated by the protocol validator. */
export interface A2UISurfaceMetadata {
  extensions?: JsonObject;
}

export interface CreateSurfaceMessage {
  version: A2UIV10WireVersion;
  createSurface: {
    surfaceId: string;
    /** Optional. The surface default catalog for components and calls that name no catalogId of their own. */
    catalogId?: string;
    sendDataModel?: boolean;
    components?: A2UIComponent[];
    dataModel?: JsonObject;
    metadata?: A2UISurfaceMetadata;
  };
}

export interface UpdateComponentsMessage {
  version: A2UIV10WireVersion;
  updateComponents: {
    surfaceId: string;
    components: A2UIComponent[];
  };
}

export interface UpdateDataModelMessage {
  version: A2UIV10WireVersion;
  updateDataModel: {
    surfaceId: string;
    path?: string;
    /** Required. A `null` value deletes the key at `path` (or resets the model for `/`). */
    value: JsonValue;
  };
}

export interface DeleteSurfaceMessage {
  version: A2UIV10WireVersion;
  deleteSurface: {
    surfaceId: string;
  };
}

/** A function call as carried by callRendererFunction; catalogId is required on the wire. */
export interface A2UIFunctionCall {
  "@call": string;
  catalogId: string;
  args?: JsonObject;
}

export interface CallRendererFunctionMessage {
  version: A2UIV10WireVersion;
  callRendererFunction: {
    surfaceId?: string;
    functionCallId: string;
    callFunction: A2UIFunctionCall;
  };
}

export interface A2UIFunctionResponse {
  functionCallId: string;
  value?: JsonValue;
  error?: { code: string; message: string };
}

export interface AgentFunctionResponseMessage {
  version: A2UIV10WireVersion;
  agentFunctionResponse: A2UIFunctionResponse;
}

/** Every agent-to-renderer message: exactly one envelope key per message. */
export type A2UIAgentMessage =
  | CreateSurfaceMessage
  | UpdateComponentsMessage
  | UpdateDataModelMessage
  | DeleteSurfaceMessage
  | CallRendererFunctionMessage
  | AgentFunctionResponseMessage;

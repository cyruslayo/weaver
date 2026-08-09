import type { JsonObject } from "./types.js";

export interface A2UIClientActionMessage {
  version: "v0.9.1";
  action: {
    name: string;
    surfaceId: string;
    sourceComponentId: string;
    timestamp: string;
    context: JsonObject;
  };
}

/** Data-model metadata payload for a future transport adapter. */
export interface A2UIClientDataModel {
  version: "v0.9.1";
  surfaces: Record<string, JsonObject>;
}

import type { JsonObject } from "./types.js";

/** Transport-neutral A2UI capability value advertised by a v0.9.1 client. */
export interface A2UIClientCapabilitiesV0_9_1 {
  "v0.9.1": {
    supportedCatalogIds: string[];
  };
}

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

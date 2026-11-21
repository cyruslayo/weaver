import type { A2UIComponent, JsonObject, JsonValue } from "../protocol/index.js";

export interface SurfaceSnapshot {
  surfaceId: string;
  catalogId: string;
  sendDataModel: boolean;
  components: Record<string, A2UIComponent>;
  dataModel: JsonValue;
}

/**
 * Input for a surface created in one step. dataModel is applied before
 * components. Either input can make the whole creation fail, in which case
 * the store is left unchanged.
 */
export interface CreateSurfaceInput {
  surfaceId: string;
  catalogId: string;
  sendDataModel?: boolean;
  dataModel?: JsonObject;
  components?: readonly A2UIComponent[];
}

export type SurfaceChange =
  | { type: "created"; surface: SurfaceSnapshot }
  | {
      type: "componentsUpdated";
      surface: SurfaceSnapshot;
      componentIds: string[];
    }
  | {
      type: "dataModelUpdated";
      surface: SurfaceSnapshot;
      /** A2UI pointer for the mutation; `/` denotes the complete model. */
      path: string;
    }
  | {
      /** A routed agent call settled, so bindings and checks that wait on it may now resolve differently. */
      type: "agentFunctionSettled";
      surface: SurfaceSnapshot;
      functionCallId: string;
    }
  | { type: "deleted"; surfaceId: string };

export type SurfaceSubscriber = (change: SurfaceChange) => void;
export type Unsubscribe = () => void;

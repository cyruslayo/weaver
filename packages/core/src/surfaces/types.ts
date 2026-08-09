import type { A2UIComponent, JsonObject, JsonValue } from "../protocol/index.js";

export interface SurfaceSnapshot {
  surfaceId: string;
  catalogId: string;
  theme?: JsonObject;
  sendDataModel: boolean;
  components: Record<string, A2UIComponent>;
  dataModel: JsonValue;
}

export interface CreateSurfaceInput {
  surfaceId: string;
  catalogId: string;
  theme?: JsonObject;
  sendDataModel?: boolean;
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
  | { type: "deleted"; surfaceId: string };

export type SurfaceSubscriber = (change: SurfaceChange) => void;
export type Unsubscribe = () => void;

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export type A2UIV091WireVersion = "v0.9" | "v0.9.1";

export interface A2UIComponent {
  id: string;
  component: string;
  [key: string]: JsonValue;
}

export interface CreateSurfaceMessage {
  version: A2UIV091WireVersion;
  createSurface: {
    surfaceId: string;
    catalogId: string;
    theme?: JsonObject;
    sendDataModel?: boolean;
  };
}

export interface UpdateComponentsMessage {
  version: A2UIV091WireVersion;
  updateComponents: {
    surfaceId: string;
    components: A2UIComponent[];
  };
}

export interface UpdateDataModelMessage {
  version: A2UIV091WireVersion;
  updateDataModel: {
    surfaceId: string;
    path?: string;
    value?: JsonValue;
  };
}

export interface DeleteSurfaceMessage {
  version: A2UIV091WireVersion;
  deleteSurface: {
    surfaceId: string;
  };
}

export type A2UIServerMessage =
  | CreateSurfaceMessage
  | UpdateComponentsMessage
  | UpdateDataModelMessage
  | DeleteSurfaceMessage;

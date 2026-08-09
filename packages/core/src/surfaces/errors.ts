import type { DataModelError } from "../data-model/index.js";

export type SurfaceStoreError =
  | { code: "SURFACE_ALREADY_EXISTS"; surfaceId: string }
  | { code: "SURFACE_NOT_FOUND"; surfaceId: string }
  | {
      code: "DUPLICATE_COMPONENT_ID";
      surfaceId: string;
      componentId: string;
    }
  | { code: "DATA_MODEL_ERROR"; dataModelError: DataModelError };

export type SurfaceStoreResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SurfaceStoreError };

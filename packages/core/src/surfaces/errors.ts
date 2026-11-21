import type { DataModelError } from "../data-model/index.js";

export type SurfaceStoreError =
  /** A createSurface targeted a live surfaceId. A state integrity error per A2UI v1.0. */
  | { code: "INTEGRITY_ERROR"; surfaceId: string }
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

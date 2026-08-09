export type SurfaceStoreError =
  | { code: "SURFACE_ALREADY_EXISTS"; surfaceId: string }
  | { code: "SURFACE_NOT_FOUND"; surfaceId: string }
  | {
      code: "DUPLICATE_COMPONENT_ID";
      surfaceId: string;
      componentId: string;
    };

export type SurfaceStoreResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SurfaceStoreError };

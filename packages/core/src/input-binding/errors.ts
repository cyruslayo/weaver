import type { CatalogRegistryError } from "../catalog/index.js";
import type { DataContextError } from "../data-context/index.js";
import type { SurfaceStoreError } from "../surfaces/index.js";
import type { InputBindingTypeMismatchDetails } from "./types.js";

export type InputBindingWriteError =
  | { code: "SURFACE_NOT_FOUND"; surfaceId: string }
  | { code: "SOURCE_COMPONENT_NOT_FOUND"; surfaceId: string; sourceComponentId: string }
  | { code: "INPUT_PROPERTY_NOT_FOUND"; sourceComponentId: string; property: string }
  | { code: "INPUT_PROPERTY_NOT_DYNAMIC"; sourceComponentId: string; property: string }
  | { code: "INPUT_PROPERTY_NOT_BOUND"; sourceComponentId: string; property: string }
  | ({ code: "INPUT_VALUE_TYPE_MISMATCH"; sourceComponentId: string; property: string } & InputBindingTypeMismatchDetails)
  | { code: "CATALOG_REGISTRY_ERROR"; cause: CatalogRegistryError }
  | { code: "BINDING_PATH_RESOLUTION_FAILED"; cause: DataContextError }
  | { code: "SURFACE_STORE_ERROR"; cause: SurfaceStoreError };

import type { CatalogRegistryError } from "../catalog/index.js";
import type { ValidationIssue } from "../protocol/index.js";
import type { SurfaceStoreError } from "../surfaces/index.js";

export type MessageProcessorError =
  | {
      code: "PROTOCOL_VALIDATION_FAILED";
      issues: ValidationIssue[];
    }
  | {
      code: "SURFACE_STORE_ERROR";
      storeError: SurfaceStoreError;
    }
  | {
      code: "CATALOG_REGISTRY_ERROR";
      catalogError: CatalogRegistryError;
    };

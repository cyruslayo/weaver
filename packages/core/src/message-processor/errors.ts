import type { CatalogRegistryError } from "../catalog/index.js";
import type { ValidationIssue } from "../protocol/index.js";
import type { SurfaceStoreError } from "../surfaces/index.js";

/**
 * Message features that are valid A2UI v1.0 but not yet executed by Weaver.
 * They are rejected with UNSUPPORTED_FEATURE rather than silently accepted.
 */
export type UnsupportedFeature =
  | "agentFunctionResponse"
  | "createSurface.catalogId";

export type MessageProcessorError =
  | {
      code: "PROTOCOL_VALIDATION_FAILED";
      issues: ValidationIssue[];
      /**
       * Present only when the failed envelope is a callRendererFunction with a
       * string functionCallId. A host uses it to send the renderer error that
       * correlates with the call.
       */
      functionCallId?: string;
    }
  | {
      code: "SURFACE_STORE_ERROR";
      storeError: SurfaceStoreError;
    }
  | {
      code: "CATALOG_REGISTRY_ERROR";
      catalogError: CatalogRegistryError;
    }
  | {
      code: "UNSUPPORTED_FEATURE";
      feature: UnsupportedFeature;
      message: string;
    };

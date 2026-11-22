import type { CatalogRegistryError } from "../catalog/index.js";
import type { ValidationIssue } from "../protocol/index.js";
import type { SurfaceStoreError } from "../surfaces/index.js";

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
      /**
       * A component, or a FunctionCall inside it, whose catalog cannot be resolved: it names
       * no catalogId and the surface has no default catalogId. Nothing is stored.
       */
      code: "CATALOG_RESOLUTION_FAILED";
      sourceComponentId: string;
      /** RFC 6901 pointer from the component to the FunctionCall; the empty string is the component. */
      path: string;
      message: string;
    };

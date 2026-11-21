import type { CatalogRegistryError } from "../catalog/index.js";
import type { ContextReconstructionFailure } from "./types.js";

export type ComponentPropertyError =
  | {
      /** A reserved envelope conflict, such as "@checks" and "checks" on one component. */
      code: "INVALID_RESERVED_KEY";
      message: string;
      sourceComponentId: string;
      key: string;
    }
  | {
      /** A component feature that Weaver does not execute yet, such as a differing @catalogId. */
      code: "UNSUPPORTED_FEATURE";
      message: string;
      sourceComponentId: string;
      feature: "@catalogId";
    }
  | {
      code: "CATALOG_PROPERTY_METADATA_FAILED";
      message: string;
      cause: CatalogRegistryError;
    }
  | {
      code: "DATA_CONTEXT_RECONSTRUCTION_FAILED";
      message: string;
      cause: ContextReconstructionFailure;
    };

export type ComponentPropertyErrorCode = ComponentPropertyError["code"];

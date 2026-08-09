import type { CatalogRegistryError } from "../catalog/index.js";
import type { ContextReconstructionFailure } from "./types.js";

export type ComponentPropertyError =
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

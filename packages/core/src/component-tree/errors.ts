import type { CatalogRegistryError } from "../catalog/index.js";

export type ComponentTreeErrorCode = "CATALOG_NOT_FOUND" | "COMPONENT_STRUCTURE_NOT_FOUND";

export interface ComponentTreeError {
  code: ComponentTreeErrorCode;
  message: string;
  catalogId: string;
  component?: string;
  cause: CatalogRegistryError;
}

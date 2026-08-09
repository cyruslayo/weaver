import type { CatalogValidationIssue } from "./types.js";

export type CatalogRegistryErrorCode =
  | "INVALID_CATALOG_SCHEMA"
  | "CATALOG_ALREADY_REGISTERED"
  | "CATALOG_NOT_FOUND"
  | "THEME_SCHEMA_NOT_FOUND"
  | "THEME_VALIDATION_FAILED"
  | "COMPONENT_NOT_ALLOWED"
  | "COMPONENT_VALIDATION_FAILED";

export interface CatalogRegistryError {
  code: CatalogRegistryErrorCode;
  message: string;
  catalogId: string;
  componentId?: string;
  component?: string;
  issues?: CatalogValidationIssue[];
}

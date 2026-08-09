import type { A2UIComponent, JsonObject } from "../protocol/index.js";
import type { CatalogRegistryError } from "./errors.js";

export interface CatalogRegistration {
  catalogId: string;
  schema: JsonObject;
}

export interface CatalogSnapshot {
  catalogId: string;
  schema: JsonObject;
}

export interface CatalogValidationIssue {
  path: string;
  message: string;
  keyword?: string;
}

export type CatalogRegistryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: CatalogRegistryError };

export type CatalogComponentValidationResult = CatalogRegistryResult<A2UIComponent>;

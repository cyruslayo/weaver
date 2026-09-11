import { cloneJson } from "../data-model/clone.js";
import type { CatalogRegistration } from "../catalog/index.js";
import {
  A2UI_V091_BASIC_CATALOG,
  A2UI_V091_BASIC_CATALOG_ID,
} from "./generated-basic-catalog.js";

/** Returns a caller-owned canonical A2UI v0.9.1 Basic Catalog registration. */
export function createBasicCatalogV091Registration(): CatalogRegistration {
  return {
    catalogId: A2UI_V091_BASIC_CATALOG_ID,
    schema: cloneJson(A2UI_V091_BASIC_CATALOG),
  };
}

export { A2UI_V091_BASIC_CATALOG_ID };

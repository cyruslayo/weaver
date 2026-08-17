import type { JsonObject, JsonValue } from "../protocol/index.js";
import type { CatalogRegistration } from "../catalog/index.js";
import { A2UI_V091_BASIC_CATALOG, A2UI_V091_BASIC_CATALOG_ID } from "./generated-basic-catalog.js";

function cloneJson<T extends JsonValue>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((entry) => cloneJson(entry)) as T;
  const result: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(value)) result[key] = cloneJson(entry);
  return result as T;
}

/** Returns a caller-owned canonical A2UI v0.9.1 Basic Catalog registration. */
export function createBasicCatalogV091Registration(): CatalogRegistration {
  return {
    catalogId: A2UI_V091_BASIC_CATALOG_ID,
    schema: cloneJson(A2UI_V091_BASIC_CATALOG),
  };
}

export { A2UI_V091_BASIC_CATALOG_ID };

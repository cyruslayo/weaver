import type { JsonObject, JsonValue } from "../protocol/index.js";
import { cloneJson } from "../data-model/clone.js";
import { A2UI_V10_COMMON_TYPES } from "./generated-common-types.js";

/** The reference the pinned common types use for "any function of the catalog". */
const UPSTREAM_ANY_FUNCTION_REF = "catalog.json#/$defs/anyFunction";
const COMMON_ANY_FUNCTION = "weaverAnyFunction";
const COMMON_FUNCTION_PREFIX = "weaverFunction_";

function rewriteAnyFunctionRefs(value: JsonValue): void {
  if (Array.isArray(value)) {
    for (const entry of value) rewriteAnyFunctionRefs(entry);
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "$ref" && child === UPSTREAM_ANY_FUNCTION_REF) {
      (value as JsonObject)[key] = `#/$defs/${COMMON_ANY_FUNCTION}`;
    } else {
      rewriteAnyFunctionRefs(child as JsonValue);
    }
  }
}

/**
 * Returns a caller-owned copy of the built-in common types resource for one
 * catalog. Its FunctionCall branch resolves to that catalog's own functions:
 * each function definition is copied into the resource and `anyFunction`
 * becomes a union of those copies (an empty catalog accepts no function).
 *
 * The copy is internal to compilation and is never returned as catalog data.
 */
export function buildCatalogCommonTypes(functions: JsonObject): JsonObject {
  const resource = cloneJson(A2UI_V10_COMMON_TYPES);
  rewriteAnyFunctionRefs(resource);
  const defs = resource.$defs as JsonObject;
  const names = Object.keys(functions);
  for (const name of names) {
    defs[`${COMMON_FUNCTION_PREFIX}${name}`] = cloneJson(functions[name] as JsonObject);
  }
  defs[COMMON_ANY_FUNCTION] =
    names.length === 0
      ? { not: {} }
      : { oneOf: names.map((name) => ({ $ref: `#/$defs/${COMMON_FUNCTION_PREFIX}${name}` })) };
  return resource;
}

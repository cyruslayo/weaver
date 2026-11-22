import type { JsonObject, JsonValue } from "../protocol/index.js";
import { cloneJson } from "../data-model/clone.js";
import { A2UI_V10_COMMON_TYPES } from "./generated-common-types.js";

/** The reference the pinned common types use for "any function of the catalog". */
const UPSTREAM_ANY_FUNCTION_REF = "catalog.json#/$defs/anyFunction";
const COMMON_ANY_FUNCTION = "weaverAnyFunction";

/**
 * The generic FunctionCall branch. A component's FunctionCall may name a function
 * of any registered catalog (its own catalogId, or the one it resolves to), so the
 * schema checks only the envelope: a string @call other than the reserved @index,
 * and args as an object. Each call is then validated against the catalog it
 * resolves to, by the message processor and the function evaluator.
 */
const GENERIC_ANY_FUNCTION: JsonValue = {
  type: "object",
  properties: {
    "@call": { type: "string", not: { const: "@index" } },
    args: { type: "object" },
  },
};

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
 * Returns a caller-owned copy of the built-in common types resource for compilation.
 * Its FunctionCall branch is the generic envelope above, so cross-catalog calls pass
 * component schema validation and are checked per call against their own catalog.
 *
 * The copy is internal to compilation and is never returned as catalog data.
 */
export function buildCatalogCommonTypes(): JsonObject {
  const resource = cloneJson(A2UI_V10_COMMON_TYPES);
  rewriteAnyFunctionRefs(resource);
  const defs = resource.$defs as JsonObject;
  defs[COMMON_ANY_FUNCTION] = cloneJson(GENERIC_ANY_FUNCTION);
  return resource;
}

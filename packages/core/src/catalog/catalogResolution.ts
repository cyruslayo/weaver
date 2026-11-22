import type { JsonObject, JsonValue } from "../protocol/index.js";

/**
 * Catalog resolution for A2UI v1.0 mixable catalogs (spec: "Mixable catalogs and
 * component resolution logic"). Resolution is strict and has no fallback to
 * rendererCapabilities:
 *
 * 1. An explicit @catalogId on a component, or catalogId on a FunctionCall.
 * 2. Otherwise the surface default catalogId.
 * 3. Otherwise undefined, which the caller reports as a resolution error.
 *
 * A FunctionCall never inherits the catalog of its enclosing component or call.
 * The one exception, formatString ${...} calls, is applied by the function
 * evaluator, not here.
 */

/** The catalog a component resolves to, or undefined when neither it nor the surface names one. */
export function componentCatalogId(
  component: JsonObject | { "@catalogId"?: string },
  surfaceCatalogId: string | undefined,
): string | undefined {
  const own = component["@catalogId"];
  return typeof own === "string" ? own : surfaceCatalogId;
}

/** The catalog a FunctionCall resolves to, or undefined when neither the call nor the surface names one. */
export function functionCallCatalogId(
  call: JsonObject | { catalogId?: JsonValue },
  surfaceCatalogId: string | undefined,
): string | undefined {
  const own = call.catalogId;
  return typeof own === "string" ? own : surfaceCatalogId;
}

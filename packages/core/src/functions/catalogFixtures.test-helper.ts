import type { JsonObject } from "../protocol/index.js";

/**
 * Builders for valid A2UI v1.0 test catalogs. Shared by the Core test suites so
 * each one declares catalogs the same way the basic catalog does: protocolVersion
 * "1.0", functions as a map keyed by name with a @call const, component schemas
 * without an `id`, and built-in common types referenced by name.
 */

export const DRAFT_2020_12 = "https://json-schema.org/draft/2020-12/schema";

/** A reference into the built-in common_types.json (not embedded in the catalog). */
export const ref = (name: string): JsonObject => ({ $ref: `common_types.json#/$defs/${name}` });

export interface FunctionSchemaOptions {
  returnType: string;
  args?: JsonObject;
  required?: string[];
  allowedCallers?: "rendererOnly" | "agentOnly" | "rendererOrAgent";
  requiresUserActivation?: boolean;
}

/** A catalog function definition. Args default to every declared argument being required. */
export function functionSchema(name: string, options: FunctionSchemaOptions): JsonObject {
  const args = options.args ?? {};
  const required = options.required ?? Object.keys(args);
  return {
    type: "object",
    returnType: options.returnType,
    ...(options.allowedCallers === undefined ? {} : { allowedCallers: options.allowedCallers }),
    ...(options.requiresUserActivation === undefined ? {} : { requiresUserActivation: options.requiresUserActivation }),
    properties: {
      "@call": { const: name },
      args: { type: "object", properties: args, required, additionalProperties: false },
    },
    required: ["@call"],
  };
}

export interface ComponentSchemaOptions {
  /** Declares the Checkable mixin, so the component may carry @checks. */
  checkable?: boolean;
  required?: string[];
}

/** A catalog component schema. It omits `id`, which is the envelope's job. */
export function componentSchema(name: string, properties: JsonObject, options: ComponentSchemaOptions = {}): JsonObject {
  const checkableProperties: JsonObject = options.checkable
    ? { "@checks": { type: "array", items: ref("CheckRule") } }
    : {};
  return {
    ...(options.checkable ? { allOf: [ref("Checkable")] } : {}),
    type: "object",
    properties: { component: { const: name }, ...checkableProperties, ...properties },
    required: ["component", ...(options.required ?? [])],
    additionalProperties: false,
  };
}

/** A complete v1.0 catalog document. */
export function catalogDocument(
  catalogId: string,
  components: JsonObject,
  functions: JsonObject = {},
  extra: JsonObject = {},
): JsonObject {
  return {
    $schema: DRAFT_2020_12,
    $id: `https://example.test/catalogs/${catalogId}.json`,
    protocolVersion: "1.0",
    catalogId,
    components,
    functions,
    $defs: { anyComponent: {}, anyFunction: {} },
    ...extra,
  };
}

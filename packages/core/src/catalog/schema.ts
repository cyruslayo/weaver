import type { JsonObject } from "../protocol/index.js";

/**
 * UAX #31 identifier pattern for component names, function names, and
 * component property names. cfworker compiles `pattern` without the `u` flag,
 * so CatalogRegistry enforces this source with `new RegExp(source, "u")`
 * rather than through the structural schema below.
 */
export const A2UI_CATALOG_IDENTIFIER_PATTERN = "^[\\p{XID_Start}_][\\p{XID_Continue}]*$";

export const A2UI_CATALOG_FUNCTION_RETURN_TYPES = [
  "string",
  "number",
  "boolean",
  "array",
  "object",
  "validationResult",
  "any",
  "void",
] as const;

export const A2UI_CATALOG_ALLOWED_CALLERS = ["rendererOnly", "agentOnly", "rendererOrAgent"] as const;

/**
 * Structural contract for an A2UI v1.0 catalog definition document, following
 * catalog_definition.json. Identifier rules, the `@call` / function-name match,
 * the `Surface` name exclusion on identifiers, and the external-reference policy
 * need the whole document and are enforced by CatalogRegistry.
 */
export const A2UI_CATALOG_SCHEMA: JsonObject = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  required: ["catalogId", "protocolVersion"],
  properties: {
    $schema: { type: "string" },
    $id: { type: "string" },
    protocolVersion: { const: "1.0" },
    title: { type: "string" },
    description: { type: "string" },
    catalogId: { type: "string" },
    instructions: { type: "string" },
    metadata: { $ref: "#/$defs/CatalogMetadata" },
    components: {
      type: "object",
      propertyNames: { not: { const: "Surface" } },
      additionalProperties: { $ref: "#/$defs/ComponentDefinition" },
    },
    functions: {
      type: "object",
      additionalProperties: { $ref: "#/$defs/FunctionDefinition" },
    },
    $defs: {
      type: "object",
      required: ["anyComponent", "anyFunction"],
      propertyNames: { not: { enum: ["theme", "primaryColor"] } },
      additionalProperties: { type: "object" },
    },
  },
  additionalProperties: false,
  $defs: {
    CatalogMetadata: {
      type: "object",
      properties: { extensions: { $ref: "#/$defs/Extensions" } },
      additionalProperties: false,
    },
    Extensions: {
      type: "object",
      additionalProperties: true,
    },
    ComponentDefinition: {
      type: "object",
      properties: {
        description: { type: "string" },
        title: { type: "string" },
        allowedParents: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
        },
        allowedChildren: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
        },
        metadata: { $ref: "#/$defs/CatalogMetadata" },
        deprecated: { type: "boolean" },
        "x-deprecated-reason": { type: "string" },
      },
      not: {
        anyOf: [{ required: ["anyOf"] }, { required: ["oneOf"] }],
      },
    },
    FunctionDefinition: {
      type: "object",
      required: ["type", "properties", "required", "returnType"],
      properties: {
        type: { const: "object" },
        title: { type: "string" },
        description: { type: "string" },
        properties: {
          type: "object",
          required: ["@call"],
          properties: {
            "@call": {
              type: "object",
              required: ["const"],
              properties: { const: { type: "string" } },
            },
            args: { type: "object" },
          },
          additionalProperties: false,
        },
        required: {
          type: "array",
          items: { type: "string" },
          contains: { const: "@call" },
        },
        returnType: { enum: [...A2UI_CATALOG_FUNCTION_RETURN_TYPES] },
        allowedCallers: { enum: [...A2UI_CATALOG_ALLOWED_CALLERS] },
        requiresUserActivation: { type: "boolean" },
      },
      unevaluatedProperties: false,
      if: {
        properties: { requiresUserActivation: { const: true } },
        required: ["requiresUserActivation"],
      },
      then: {
        properties: { allowedCallers: { enum: ["rendererOnly"] } },
      },
    },
  },
};

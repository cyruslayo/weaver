import type { JsonObject } from "../protocol/index.js";

/** Structural contract for an A2UI v0.9.1 catalog JSON Schema document. */
export const A2UI_CATALOG_SCHEMA: JsonObject = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  required: ["$schema", "catalogId", "components"],
  properties: {
    $schema: { const: "https://json-schema.org/draft/2020-12/schema" },
    $id: { type: "string" },
    catalogId: { type: "string" },
    components: {
      type: "object",
      minProperties: 1,
      additionalProperties: { type: "object" },
    },
    functions: { type: "object" },
    themes: { type: "object" },
    $defs: { type: "object" },
  },
  additionalProperties: true,
};

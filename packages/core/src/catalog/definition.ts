import type { JsonObject } from "../protocol/index.js";
import type { CatalogRegistration } from "./types.js";

/**
 * The authoring shape of an A2UI v1.0 catalog definition accepted by Core.
 *
 * `protocolVersion` is required and must be "1.0". The nested component and
 * function definitions remain ordinary JSON Schema objects. CatalogRegistry owns
 * their runtime validation and compilation; this type only describes the catalog
 * document boundary.
 */
export type A2UIV10CatalogSchema = JsonObject & {
  $schema?: string;
  $id?: string;
  protocolVersion: "1.0";
  title?: string;
  description?: string;
  catalogId: string;
  instructions?: string;
  components?: Record<string, JsonObject>;
  functions?: Record<string, JsonObject>;
  $defs?: JsonObject & {
    anyComponent: JsonObject;
    anyFunction: JsonObject;
  };
};

/** A typed catalog definition that remains assignable to CatalogRegistration. */
export type CatalogDefinition<
  TSchema extends A2UIV10CatalogSchema = A2UIV10CatalogSchema,
> = CatalogRegistration & {
  catalogId: TSchema["catalogId"];
  schema: TSchema;
};

/**
 * Associates a catalog schema with its own catalog identity without changing
 * or validating the supplied JSON Schema document.
 */
export function defineCatalog<TSchema extends A2UIV10CatalogSchema>(
  schema: TSchema,
): CatalogDefinition<TSchema> {
  return {
    catalogId: schema.catalogId,
    schema,
  };
}

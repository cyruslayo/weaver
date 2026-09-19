import type { JsonObject } from "../protocol/index.js";
import type { CatalogRegistration } from "./types.js";

/**
 * The authoring shape of an A2UI v0.9.1 catalog schema accepted by Core.
 *
 * The nested component, function, and definition schemas remain ordinary JSON
 * Schema objects. CatalogRegistry owns their runtime validation and
 * compilation; this type only describes the catalog document boundary.
 */
export type A2UIV091CatalogSchema = JsonObject & {
  $schema: "https://json-schema.org/draft/2020-12/schema";
  $id?: string;
  title?: string;
  description?: string;
  catalogId: string;
  components: Record<string, JsonObject>;
  functions?: Record<string, JsonObject>;
  $defs: JsonObject & {
    theme: JsonObject;
  };
};

/** A typed catalog definition that remains assignable to CatalogRegistration. */
export type CatalogDefinition<
  TSchema extends A2UIV091CatalogSchema = A2UIV091CatalogSchema,
> = CatalogRegistration & {
  catalogId: TSchema["catalogId"];
  schema: TSchema;
};

/**
 * Associates a catalog schema with its own catalog identity without changing
 * or validating the supplied JSON Schema document.
 */
export function defineCatalog<TSchema extends A2UIV091CatalogSchema>(
  schema: TSchema,
): CatalogDefinition<TSchema> {
  return {
    catalogId: schema.catalogId,
    schema,
  };
}

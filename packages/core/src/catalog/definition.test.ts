import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  A2UIV091CatalogSchema,
  CatalogDefinition,
  CatalogRegistration,
} from "./index.js";
import type { JsonObject } from "../protocol/index.js";
import { defineCatalog, CatalogRegistry } from "./index.js";

const schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://example.test/catalogs/labels.json",
  title: "Labels",
  description: "A small custom catalog.",
  catalogId: "https://example.test/catalogs/labels.json",
  components: {
    Label: {
      type: "object",
      properties: {
        id: { type: "string" },
        component: { const: "Label" },
        text: { $ref: "common_types.json#/$defs/Text" },
      },
      required: ["id", "component", "text"],
      additionalProperties: false,
    },
  },
  functions: {
    identity: {
      type: "object",
      properties: {
        call: { const: "identity" },
        args: { type: "object" },
        returnType: { const: "string" },
      },
      required: ["call", "args"],
      additionalProperties: false,
    },
  },
  $defs: {
    theme: {
      type: "object",
      properties: { accent: { type: "string" } },
      additionalProperties: false,
    },
    commonTypes: {
      $id: "common_types.json",
      $defs: {
        Text: { type: "string" },
      },
    },
  },
  xMetadata: {
    enabled: true,
    tags: ["custom", "test"],
  },
} satisfies A2UIV091CatalogSchema;

const definition = defineCatalog(schema);

type Equal<Left, Right> =
  (<Type>() => Type extends Left ? 1 : 2) extends
  (<Type>() => Type extends Right ? 1 : 2) ? true : false;
type Assert<Value extends true> = Value;
type _ComponentNames = Assert<Equal<keyof typeof definition.schema.components, "Label">>;
type _FunctionNames = Assert<Equal<keyof NonNullable<typeof definition.schema.functions>, "identity">>;
type _DefinitionAssignable = Assert<Equal<CatalogDefinition<typeof schema> extends CatalogRegistration ? true : false, true>>;
type _CatalogIdRelationship = Assert<Equal<typeof definition.catalogId, typeof definition.schema.catalogId>>;

// Compile-time contract checks. This branch is never executed.
if (false) {
  // @ts-expect-error catalog schemas require the Draft 2020-12 dialect marker
  defineCatalog({
    catalogId: "missing-schema",
    components: {},
    $defs: { theme: {} },
  });

  defineCatalog({
    // @ts-expect-error only Draft 2020-12 is accepted
    $schema: "https://json-schema.org/draft-07/schema",
    catalogId: "wrong-schema",
    components: {},
    $defs: { theme: {} },
  });

  // @ts-expect-error component definitions are required
  defineCatalog({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    catalogId: "missing-components",
    $defs: { theme: {} },
  });

  defineCatalog({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    catalogId: "missing-theme",
    components: {},
    // @ts-expect-error catalog schemas require $defs.theme
    $defs: {},
  });

  defineCatalog({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    catalogId: "bad-component",
    components: {
      // @ts-expect-error component definitions must be JSON objects
      Label: "not a schema",
    },
    $defs: { theme: {} },
  });

  defineCatalog({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    catalogId: "bad-function",
    components: {},
    functions: {
      // @ts-expect-error function definitions must be JSON objects
      identity: 42,
    },
    $defs: { theme: {} },
  });

  defineCatalog({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    catalogId: "bad-values",
    components: {},
    $defs: { theme: {} },
    // @ts-expect-error functions are not JSON values
    executable: () => true,
    // @ts-expect-error undefined is not a JSON value
    omitted: undefined,
  });
}

test("defines a registration from the schema identity without changing the schema", () => {
  assert.equal(definition.catalogId, schema.catalogId);
  assert.strictEqual(definition.schema, schema);

  const registration: CatalogRegistration = definition;
  assert.strictEqual(registration.schema, schema);
  assert.equal(registration.catalogId, schema.catalogId);

  assert.equal(schema.$id, "https://example.test/catalogs/labels.json");
  assert.equal(schema.title, "Labels");
  assert.equal(schema.description, "A small custom catalog.");
  assert.deepEqual(schema.xMetadata, { enabled: true, tags: ["custom", "test"] });
  assert.deepEqual(schema.$defs.commonTypes, {
    $id: "common_types.json",
    $defs: { Text: { type: "string" } },
  });
  assert.equal(
    schema.components.Label.properties?.text.$ref,
    "common_types.json#/$defs/Text",
  );
});

test("does not inject optional functions or other defaults", () => {
  const noFunctionsSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    catalogId: "https://example.test/catalogs/no-functions.json",
    components: {
      Label: { type: "object" },
    },
    $defs: { theme: { type: "object" } },
  } satisfies A2UIV091CatalogSchema;
  const noFunctions = defineCatalog(noFunctionsSchema);

  assert.equal(Object.hasOwn(noFunctions.schema, "functions"), false);
  assert.deepEqual(Object.keys(noFunctions.schema), Object.keys(noFunctionsSchema));
  assert.strictEqual(noFunctions.schema, noFunctionsSchema);
});

test("keeps valid definitions ordinary registry registrations", () => {
  const registry = new CatalogRegistry();
  const result = registry.register(definition);
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.error));
  assert.equal(
    registry.validateComponent(schema.catalogId, {
      id: "label-1",
      component: "Label",
      text: "Hello",
    }).ok,
    true,
  );
});

test("preserves unresolved references for CatalogRegistry to reject", () => {
  const unresolvedSchema = {
    ...schema,
    catalogId: "https://example.test/catalogs/unresolved.json",
    $id: "https://example.test/catalogs/unresolved.json",
    components: {
      Broken: {
        type: "object",
        properties: {
          id: { type: "string" },
          component: { const: "Broken" },
          value: { $ref: "#/$defs/does-not-exist" },
        },
      },
    },
  } satisfies A2UIV091CatalogSchema;
  const unresolved = defineCatalog(unresolvedSchema);
  assert.strictEqual(unresolved.schema, unresolvedSchema);
  assert.equal(
    unresolvedSchema.components.Broken.properties?.value.$ref,
    "#/$defs/does-not-exist",
  );

  const result = new CatalogRegistry().register(unresolved);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "INVALID_CATALOG_SCHEMA");
});

test("does not repair a malformed schema missing $defs.theme", () => {
  const malformedSchema = {
    ...schema,
    catalogId: "https://example.test/catalogs/malformed.json",
    $id: "https://example.test/catalogs/malformed.json",
    $defs: schema.$defs.commonTypes,
  } as unknown as A2UIV091CatalogSchema;
  const malformed = defineCatalog(malformedSchema);
  assert.strictEqual(malformed.schema, malformedSchema);

  const result = new CatalogRegistry().register(malformed);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "THEME_SCHEMA_NOT_FOUND");
});

test("CatalogRegistry owns its registered schema after helper construction", () => {
  const input: A2UIV091CatalogSchema = structuredClone(schema);
  const registration = defineCatalog(input);
  const registry = new CatalogRegistry();
  assert.equal(registry.register(registration).ok, true);

  input.components.Injected = { type: "object" };
  const snapshot = registry.get(input.catalogId);
  assert.ok(snapshot);
  const snapshotComponents = snapshot.schema.components as JsonObject;
  snapshotComponents.Injected = { type: "object" };

  const result = registry.validateComponent(input.catalogId, {
    id: "injected",
    component: "Injected",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "COMPONENT_NOT_ALLOWED");
});

test("returns normally serializable registration data", () => {
  const serialized = JSON.stringify(definition);
  assert.deepEqual(JSON.parse(serialized), definition);
});

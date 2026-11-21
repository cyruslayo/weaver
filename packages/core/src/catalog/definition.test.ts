import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  A2UIV10CatalogSchema,
  CatalogDefinition,
  CatalogRegistration,
} from "./index.js";
import type { JsonObject } from "../protocol/index.js";
import { defineCatalog, CatalogRegistry } from "./index.js";

const schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://example.test/catalogs/labels.json",
  protocolVersion: "1.0",
  title: "Labels",
  description: "A small custom catalog.",
  catalogId: "https://example.test/catalogs/labels.json",
  instructions: "Use Label for short text.",
  components: {
    Label: {
      type: "object",
      properties: {
        component: { const: "Label" },
        text: { $ref: "common_types.json#/$defs/DynamicString" },
      },
      required: ["component", "text"],
      additionalProperties: false,
    },
  },
  functions: {
    identity: {
      type: "object",
      returnType: "string",
      properties: {
        "@call": { const: "identity" },
        args: { type: "object" },
      },
      required: ["@call", "args"],
    },
  },
  $defs: {
    anyComponent: { oneOf: [{ $ref: "#/components/Label" }] },
    anyFunction: { oneOf: [{ $ref: "#/functions/identity" }] },
  },
} satisfies A2UIV10CatalogSchema;

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
  // @ts-expect-error catalog schemas require protocolVersion
  defineCatalog({
    catalogId: "missing-version",
    components: {},
  });

  defineCatalog({
    // @ts-expect-error only protocolVersion "1.0" is accepted
    protocolVersion: "0.9",
    catalogId: "wrong-version",
    components: {},
  });

  defineCatalog({
    protocolVersion: "1.0",
    catalogId: "no-components",
  });

  defineCatalog({
    protocolVersion: "1.0",
    catalogId: "bad-component",
    components: {
      // @ts-expect-error component definitions must be JSON objects
      Label: "not a schema",
    },
  });

  defineCatalog({
    protocolVersion: "1.0",
    catalogId: "bad-function",
    components: {},
    functions: {
      // @ts-expect-error function definitions must be JSON objects
      identity: 42,
    },
  });

  defineCatalog({
    protocolVersion: "1.0",
    catalogId: "bad-values",
    components: {},
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
  assert.equal(schema.protocolVersion, "1.0");
  assert.equal(schema.title, "Labels");
  assert.equal(schema.description, "A small custom catalog.");
  assert.equal(schema.instructions, "Use Label for short text.");
  assert.equal(
    schema.components.Label.properties?.text.$ref,
    "common_types.json#/$defs/DynamicString",
  );
});

test("does not inject optional functions or other defaults", () => {
  const minimalSchema = {
    protocolVersion: "1.0",
    catalogId: "https://example.test/catalogs/minimal.json",
    components: {
      Label: { type: "object" },
    },
  } satisfies A2UIV10CatalogSchema;
  const minimal = defineCatalog(minimalSchema);

  assert.equal(Object.hasOwn(minimal.schema, "functions"), false);
  assert.equal(Object.hasOwn(minimal.schema, "$defs"), false);
  assert.deepEqual(Object.keys(minimal.schema), Object.keys(minimalSchema));
  assert.strictEqual(minimal.schema, minimalSchema);
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
          component: { const: "Broken" },
          value: { $ref: "#/$defs/does-not-exist" },
        },
      },
    },
  } satisfies A2UIV10CatalogSchema;
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

test("does not repair a malformed schema missing protocolVersion", () => {
  const { protocolVersion: _omitted, ...withoutVersion } = schema;
  const malformedSchema = {
    ...withoutVersion,
    catalogId: "https://example.test/catalogs/malformed.json",
    $id: "https://example.test/catalogs/malformed.json",
  } as unknown as A2UIV10CatalogSchema;
  const malformed = defineCatalog(malformedSchema);
  assert.strictEqual(malformed.schema, malformedSchema);

  const result = new CatalogRegistry().register(malformed);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "INVALID_CATALOG_SCHEMA");
    assert.ok(result.error.issues?.some(({ path }) => path === "/protocolVersion"));
  }
});

test("CatalogRegistry owns its registered schema after helper construction", () => {
  const input: A2UIV10CatalogSchema = structuredClone(schema);
  const registration = defineCatalog(input);
  const registry = new CatalogRegistry();
  assert.equal(registry.register(registration).ok, true);

  input.components!.Injected = { type: "object" };
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

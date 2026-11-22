import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";

import type { JsonObject } from "../protocol/index.js";
import { CatalogRegistry } from "../catalog/index.js";
import { buildCatalogCommonTypes } from "../catalog/common-types.js";
import { A2UI_V10_BASIC_CATALOG_ID, createBasicCatalogV10Registration } from "./index.js";

const fixture = (name: string): JsonObject => JSON.parse(readFileSync(
  new URL(`../../src/protocol/a2ui/v1_0/inbound/fixtures/${name}.json`, import.meta.url),
  "utf8",
)) as JsonObject;

const CANONICAL_COMPONENTS = [
  "Text", "Image", "Icon", "Video", "AudioPlayer", "Row", "Column", "List",
  "Card", "Tabs", "Modal", "Divider", "Button", "TextField", "CheckBox",
  "ChoicePicker", "Slider", "DateTimeInput",
];
const CANONICAL_FUNCTIONS = [
  "required", "regex", "length", "numeric", "email", "formatString",
  "formatNumber", "formatCurrency", "formatDate", "pluralize", "openUrl",
  "and", "or", "not",
];

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Adds the built-in common types next to a catalog, as Core does at compile time, resolved relative to the catalog. */
function addCommonTypes(ajv: Ajv2020, schema: JsonObject): void {
  ajv.addSchema(schema);
  ajv.addSchema({
    ...buildCatalogCommonTypes(),
    $id: new URL("common_types.json", String(schema.$id)).href,
  });
}

function checkableComponentsFromPinnedFixture(): string[] {
  const rawCatalog = fixture("catalog");
  const components = isObject(rawCatalog.components) ? rawCatalog.components : {};
  const names: string[] = [];
  for (const [name, schema] of Object.entries(components)) {
    if (!isObject(schema) || !Array.isArray(schema.allOf)) continue;
    if (schema.allOf.some((member) =>
      isObject(member) &&
      member.$ref === "common_types.json#/$defs/Checkable"
    )) names.push(name);
  }
  return names;
}

/** Mirrors the registry's envelope split: ComponentCommon keys are validated at the message level. */
function catalogOwnedBody(value: JsonObject): JsonObject {
  const body: JsonObject = { ...value };
  delete body.id;
  return body;
}

test("canonical Basic Catalog registration preserves the v1.0 identity and sets", () => {
  const registration = createBasicCatalogV10Registration();
  assert.equal(A2UI_V10_BASIC_CATALOG_ID, "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json");
  assert.equal(registration.catalogId, A2UI_V10_BASIC_CATALOG_ID);
  assert.equal(registration.schema.catalogId, A2UI_V10_BASIC_CATALOG_ID);
  assert.equal(registration.schema.protocolVersion, "1.0");
  assert.match(String(registration.schema.instructions), /Catalog Guidelines/);
  assert.deepEqual(Object.keys(registration.schema.components as JsonObject).sort(), [...CANONICAL_COMPONENTS].sort());
  assert.equal(Object.keys(registration.schema.components as JsonObject).length, 18);
  assert.deepEqual(Object.keys(registration.schema.functions as JsonObject).sort(), [...CANONICAL_FUNCTIONS].sort());
  assert.equal(Object.keys(registration.schema.functions as JsonObject).length, 14);
});

test("canonical Basic Catalog validates against the pinned catalog_definition.json", () => {
  const definition = fixture("catalog_definition");
  const common = fixture("common_types");
  const ajv = new Ajv2020({ strict: false, validateFormats: false });
  ajv.addSchema(common);
  const validate = ajv.compile(definition);

  const pinned = fixture("catalog");
  assert.equal(validate(pinned), true, JSON.stringify(validate.errors));
  const generated = createBasicCatalogV10Registration().schema;
  assert.equal(validate(generated), true, JSON.stringify(validate.errors));

  const withoutVersion = { ...generated };
  delete withoutVersion.protocolVersion;
  assert.equal(validate(withoutVersion), true, "catalog_definition permits omitted protocolVersion; Core rejects it separately");
});

test("canonical Basic Catalog registration succeeds and exposes critical runtime metadata", () => {
  const registry = new CatalogRegistry();
  const result = registry.register(createBasicCatalogV10Registration());
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.error));

  // ComponentId / Child / ChildList structural discovery must exclude the component's own id.
  const row = registry.getComponentStructureLocations(A2UI_V10_BASIC_CATALOG_ID, "Row");
  assert.deepEqual(row, { ok: true, value: [
    { path: [{ kind: "property", name: "children" }], kind: "list" },
  ] });
  const card = registry.getComponentStructureLocations(A2UI_V10_BASIC_CATALOG_ID, "Card");
  assert.deepEqual(card, { ok: true, value: [
    { path: [{ kind: "property", name: "child" }], kind: "single" },
  ] });
  const cardStructure = registry.getComponentStructure(A2UI_V10_BASIC_CATALOG_ID, "Card");
  assert.deepEqual(cardStructure, { ok: true, value: { singleChildFields: ["child"], childListFields: [] } });

  // Action metadata for the canonical action-bearing component.
  assert.deepEqual(registry.getActionProperties(A2UI_V10_BASIC_CATALOG_ID, "Button"), { ok: true, value: ["action"] });

  // Dynamic* metadata discovery.
  const text = registry.getDynamicProperties(A2UI_V10_BASIC_CATALOG_ID, "Text");
  assert.deepEqual(text, { ok: true, value: [{ property: "text", valueKind: "dynamicString" }] });
  const slider = registry.getDynamicProperties(A2UI_V10_BASIC_CATALOG_ID, "Slider");
  assert.ok(slider.ok && slider.value.some(({ property, valueKind }) => property === "value" && valueKind === "dynamicNumber"));
  const date = registry.getDynamicValueLocations(A2UI_V10_BASIC_CATALOG_ID, "DateTimeInput");
  assert.ok(date.ok && date.value.some(({ path }) => {
    const leaf = path.at(-1);
    return leaf?.kind === "property" && leaf.name === "min";
  }));

  // Function descriptor metadata from the canonical catalog.
  const openUrl = registry.getFunctionDefinition(A2UI_V10_BASIC_CATALOG_ID, "openUrl");
  assert.deepEqual(openUrl.ok && {
    returnType: openUrl.value.returnType,
    allowedCallers: openUrl.value.allowedCallers,
    requiresUserActivation: openUrl.value.requiresUserActivation,
  }, { returnType: "void", allowedCallers: "rendererOnly", requiresUserActivation: true });
  const formatDate = registry.getFunctionDefinition(A2UI_V10_BASIC_CATALOG_ID, "formatDate");
  assert.deepEqual(formatDate.ok && formatDate.value.returnType, "string");
  const required = registry.getFunctionDefinition(A2UI_V10_BASIC_CATALOG_ID, "required");
  assert.deepEqual(required.ok && required.value.returnType, "validationResult");

  // Component envelope and catalog-owned validation.
  assert.equal(registry.validateComponent(A2UI_V10_BASIC_CATALOG_ID, { id: "t", component: "Text", text: "hi" }).ok, true);
  assert.equal(registry.validateComponent(A2UI_V10_BASIC_CATALOG_ID, { id: "t", component: "Text", text: "hi", "@accessibility": { label: "Hi" } }).ok, true);
});

test("canonical checkable component set is derived from the pinned fixture and detected", () => {
  const expected = checkableComponentsFromPinnedFixture();
  assert.deepEqual(expected, ["Button", "TextField", "CheckBox", "ChoicePicker", "Slider", "DateTimeInput"]);

  const registry = new CatalogRegistry();
  assert.equal(registry.register(createBasicCatalogV10Registration()).ok, true);

  for (const name of expected) {
    assert.equal(registry.isComponentCheckable(A2UI_V10_BASIC_CATALOG_ID, name), true, `${name} should be checkable`);
  }
  assert.equal(registry.isComponentCheckable(A2UI_V10_BASIC_CATALOG_ID, "Text"), false);
});

test("canonical factory returns caller-owned, non-shared registration data", () => {
  const first = createBasicCatalogV10Registration();
  const second = createBasicCatalogV10Registration();
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.notEqual(first.schema, second.schema);
  assert.notEqual(first.schema.components, second.schema.components);

  (first.schema.components as JsonObject).Injected = { type: "object" };
  const third = createBasicCatalogV10Registration();
  assert.equal((third.schema.components as JsonObject).Injected, undefined);
  assert.equal((second.schema.components as JsonObject).Injected, undefined);

  const registry = new CatalogRegistry();
  assert.equal(registry.register(second).ok, true);
  assert.equal(registry.validateComponent(A2UI_V10_BASIC_CATALOG_ID, { id: "x", component: "Injected" }).ok, false);
});

test("representative semantic-parity checks agree with the pinned canonical schema", () => {
  const rawCatalog = fixture("catalog");
  const common = fixture("common_types");
  const mappedRaw = structuredClone(rawCatalog);
  mappedRaw.$id = "https://a2ui.org/specification/v1_0/catalog.json";
  const rawAjv = new Ajv2020({ strict: false, validateFormats: false });
  rawAjv.addSchema(common);
  rawAjv.addSchema(mappedRaw);

  const registration = createBasicCatalogV10Registration();
  const normalizedAjv = new Ajv2020({ strict: false, validateFormats: false });
  addCommonTypes(normalizedAjv, registration.schema);

  const rawComponent = (name: string) => `https://a2ui.org/specification/v1_0/catalog.json#/components/${name}`;
  const normalizedComponent = (name: string) => `${registration.schema.$id}#/components/${name}`;

  const valid = [
    { id: "text", component: "Text", text: "hello" },
    { id: "button", component: "Button", child: "text", action: { event: { name: "go" } } },
    { id: "slider", component: "Slider", max: 10, value: { "@path": "/v" } },
  ];
  const invalid = [
    { id: "text", component: "Text", text: 42 },
    { id: "button", component: "Button", child: "text" },
    { id: "slider", component: "Slider", max: "ten", value: 3 },
  ];

  for (const value of [...valid, ...invalid]) {
    const component = value.component as string;
    const rawValid = rawAjv.validate(rawComponent(component), value);
    const normalizedValid = normalizedAjv.validate(normalizedComponent(component), catalogOwnedBody(value as unknown as JsonObject));
    assert.equal(normalizedValid, rawValid, `parity mismatch for ${component}`);
  }
});

test("Weaver closes component schemas where the upstream catalog leaves extra properties open", () => {
  const registration = createBasicCatalogV10Registration();
  const normalizedAjv = new Ajv2020({ strict: false, validateFormats: false });
  addCommonTypes(normalizedAjv, registration.schema);
  const withExtra = { component: "Text", text: "hello", extra: true };
  assert.equal(normalizedAjv.validate(`${registration.schema.$id}#/components/Text`, withExtra), false);
});

test("normalization parity covers the FunctionCall anyFunction restriction", () => {
  const rawCatalog = fixture("catalog");
  const common = fixture("common_types");
  const mappedRaw = structuredClone(rawCatalog);
  mappedRaw.$id = "https://a2ui.org/specification/v1_0/catalog.json";
  const rawAjv = new Ajv2020({ strict: false, validateFormats: false });
  rawAjv.addSchema(common);
  rawAjv.addSchema(mappedRaw);

  const registration = createBasicCatalogV10Registration();
  const normalizedAjv = new Ajv2020({ strict: false, validateFormats: false });
  addCommonTypes(normalizedAjv, registration.schema);

  const rawComponent = "https://a2ui.org/specification/v1_0/catalog.json#/components/Text";
  const normalizedComponent = `${registration.schema.$id}#/components/Text`;

  const cases: Array<{ name: string; call: JsonObject; valid: boolean }> = [
    { name: "valid declared function", call: { "@call": "formatString", args: { value: "hello" } }, valid: true },
    // The generic envelope accepts any function; its arguments are checked per call by the catalog registry.
    { name: "known function with invalid args", call: { "@call": "regex", args: { value: "x" } }, valid: true },
    { name: "declaration-only returnType on the wire", call: { "@call": "formatString", args: { value: "hello" }, returnType: "string" }, valid: false },
  ];

  for (const { name, call, valid } of cases) {
    const component = { id: "text", component: "Text", text: call };
    const rawValid = rawAjv.validate(rawComponent, catalogOwnedBody(component));
    const normalizedValid = normalizedAjv.validate(normalizedComponent, catalogOwnedBody(component));
    assert.equal(normalizedValid, valid, `${name}: normalized validation`);
    if (name !== "declaration-only returnType on the wire" && name !== "known function with invalid args") assert.equal(normalizedValid, rawValid, `${name}: parity mismatch`);
  }
});

test("generated Basic Catalog carries a generation and modification notice", () => {
  const source = readFileSync(
    new URL("../../src/basic-catalog/generated-basic-catalog.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /@generated by scripts\/generate-basic-catalog\.mjs/);
  assert.match(source, /a2ui-project\/a2ui/);
  assert.match(source, /5ff1b05f02d39f969b52a942e78e864ef3ac01fa/);
  assert.match(source, /catalogs\/basic\/v1\/catalog\.json/);
  assert.match(source, /normalized\/modified for Weaver/);
  assert.match(source, /packages\/core\/THIRD_PARTY_LICENSES\.txt/);
  assert.doesNotMatch(source, /TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";

import type { JsonObject } from "../protocol/index.js";
import { CatalogRegistry } from "../catalog/index.js";
import { A2UI_V091_BASIC_CATALOG_ID, createBasicCatalogV091Registration } from "./index.js";

const fixture = (name: string): JsonObject => JSON.parse(readFileSync(
  new URL(`../../src/protocol/a2ui/v0_9_1/inbound/fixtures/${name}.json`, import.meta.url),
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

function checkableComponentsFromPinnedFixture(): string[] {
  const rawCatalog = fixture("catalog");
  const components = isObject(rawCatalog.components) ? rawCatalog.components : {};
  const names: string[] = [];
  for (const [name, schema] of Object.entries(components)) {
    if (!isObject(schema) || !Array.isArray(schema.allOf)) continue;
    if (schema.allOf.some((member) =>
      isObject(member) &&
      member.$ref === "https://a2ui.org/specification/v0_9/common_types.json#/$defs/Checkable"
    )) names.push(name);
  }
  return names;
}

test("canonical Basic Catalog registration preserves the canonical identity and sets", () => {
  const registration = createBasicCatalogV091Registration();
  assert.equal(A2UI_V091_BASIC_CATALOG_ID, "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json");
  assert.equal(registration.catalogId, A2UI_V091_BASIC_CATALOG_ID);
  assert.equal(registration.schema.catalogId, A2UI_V091_BASIC_CATALOG_ID);
  assert.deepEqual(Object.keys(registration.schema.components as JsonObject).sort(), [...CANONICAL_COMPONENTS].sort());
  assert.equal(Object.keys(registration.schema.components as JsonObject).length, 18);
  assert.deepEqual(Object.keys(registration.schema.functions as JsonObject).sort(), [...CANONICAL_FUNCTIONS].sort());
  assert.equal(Object.keys(registration.schema.functions as JsonObject).length, 14);
});

test("canonical Basic Catalog registration succeeds and exposes critical runtime metadata", () => {
  const registry = new CatalogRegistry();
  const result = registry.register(createBasicCatalogV091Registration());
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.error));

  // ComponentId / ChildList structural discovery must exclude the component's own id.
  const row = registry.getComponentStructureLocations(A2UI_V091_BASIC_CATALOG_ID, "Row");
  assert.deepEqual(row, { ok: true, value: [
    { path: [{ kind: "property", name: "children" }], kind: "list" },
  ] });
  const card = registry.getComponentStructureLocations(A2UI_V091_BASIC_CATALOG_ID, "Card");
  assert.deepEqual(card, { ok: true, value: [
    { path: [{ kind: "property", name: "child" }], kind: "single" },
  ] });

  // Action metadata for the canonical action-bearing component.
  assert.deepEqual(registry.getActionProperties(A2UI_V091_BASIC_CATALOG_ID, "Button"), { ok: true, value: ["action"] });

  // Dynamic* metadata discovery.
  const text = registry.getDynamicProperties(A2UI_V091_BASIC_CATALOG_ID, "Text");
  assert.deepEqual(text, { ok: true, value: [{ property: "text", valueKind: "dynamicString" }] });
  const slider = registry.getDynamicProperties(A2UI_V091_BASIC_CATALOG_ID, "Slider");
  assert.ok(slider.ok && slider.value.some(({ property, valueKind }) => property === "value" && valueKind === "dynamicNumber"));
  const date = registry.getDynamicValueLocations(A2UI_V091_BASIC_CATALOG_ID, "DateTimeInput");
  assert.ok(date.ok && date.value.some(({ path }) => {
    const leaf = path.at(-1);
    return leaf?.kind === "property" && leaf.name === "min";
  }));

  assert.equal(registry.validateTheme(A2UI_V091_BASIC_CATALOG_ID, { primaryColor: "#123456" }).ok, true);
  assert.equal(registry.validateTheme(A2UI_V091_BASIC_CATALOG_ID, { primaryColor: "red" }).ok, false);
});

test("canonical checkable component set is derived from the pinned fixture and detected", () => {
  const expected = checkableComponentsFromPinnedFixture();
  assert.deepEqual(expected, ["Button", "TextField", "CheckBox", "ChoicePicker", "Slider", "DateTimeInput"]);

  const registry = new CatalogRegistry();
  assert.equal(registry.register(createBasicCatalogV091Registration()).ok, true);

  for (const name of expected) {
    assert.equal(registry.isComponentCheckable(A2UI_V091_BASIC_CATALOG_ID, name), true, `${name} should be checkable`);
  }
  assert.equal(registry.isComponentCheckable(A2UI_V091_BASIC_CATALOG_ID, "Text"), false);
});

test("canonical factory returns caller-owned, non-shared registration data", () => {
  const first = createBasicCatalogV091Registration();
  const second = createBasicCatalogV091Registration();
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.notEqual(first.schema, second.schema);
  assert.notEqual(first.schema.components, second.schema.components);

  (first.schema.components as JsonObject).Injected = { type: "object" };
  const third = createBasicCatalogV091Registration();
  assert.equal((third.schema.components as JsonObject).Injected, undefined);
  assert.equal((second.schema.components as JsonObject).Injected, undefined);

  const registry = new CatalogRegistry();
  assert.equal(registry.register(second).ok, true);
  assert.equal(registry.validateComponent(A2UI_V091_BASIC_CATALOG_ID, { id: "x", component: "Injected" }).ok, false);
});

test("representative semantic-parity checks agree with the pinned canonical schema", () => {
  const rawCatalog = fixture("catalog");
  const common = fixture("common_types");
  const mappedRaw = structuredClone(rawCatalog);
  mappedRaw.$id = "https://a2ui.org/specification/v0_9/catalog.json";
  const rawAjv = new Ajv2020({ strict: false, validateFormats: false });
  rawAjv.addSchema(common);
  rawAjv.addSchema(mappedRaw);

  const registration = createBasicCatalogV091Registration();
  const normalizedAjv = new Ajv2020({ strict: false, validateFormats: false });
  normalizedAjv.addSchema(registration.schema);

  const rawComponent = (name: string) => `https://a2ui.org/specification/v0_9/catalog.json#/components/${name}`;
  const normalizedComponent = (name: string) => `${registration.schema.$id}#/components/${name}`;

  const valid = [
    { id: "text", component: "Text", text: "hello" },
    { id: "button", component: "Button", child: "text", action: { event: { name: "go" } } },
    { id: "slider", component: "Slider", max: 10, value: { path: "/v" } },
  ];
  const invalid = [
    { id: "text", component: "Text", text: 42 },
    { id: "button", component: "Button", child: "text" },
    { id: "slider", component: "Slider", max: "ten", value: 3 },
    { id: "text", component: "Text", text: "hello", extra: true },
  ];

  for (const value of [...valid, ...invalid]) {
    const component = value.component as string;
    const rawValid = rawAjv.validate(rawComponent(component), value);
    const normalizedValid = normalizedAjv.validate(normalizedComponent(component), value);
    assert.equal(normalizedValid, rawValid, `parity mismatch for ${component}`);
  }
});

test("normalization parity covers the FunctionCall anyFunction restriction", () => {
  const rawCatalog = fixture("catalog");
  const common = fixture("common_types");
  const mappedRaw = structuredClone(rawCatalog);
  mappedRaw.$id = "https://a2ui.org/specification/v0_9/catalog.json";
  const rawAjv = new Ajv2020({ strict: false, validateFormats: false });
  rawAjv.addSchema(common);
  rawAjv.addSchema(mappedRaw);

  const registration = createBasicCatalogV091Registration();
  const normalizedAjv = new Ajv2020({ strict: false, validateFormats: false });
  normalizedAjv.addSchema(registration.schema);

  const rawComponent = `https://a2ui.org/specification/v0_9/catalog.json#/components/Text`;
  const normalizedComponent = `${registration.schema.$id}#/components/Text`;

  const cases: Array<{ name: string; call: JsonObject }> = [
    { name: "valid declared function", call: { call: "formatString", args: { value: "hello" }, returnType: "string" } },
    { name: "unknown function", call: { call: "__not_a_basic_function__", returnType: "string" } },
    { name: "known function with invalid args", call: { call: "regex", args: { value: "x" }, returnType: "string" } },
  ];

  for (const { name, call } of cases) {
    const component = { id: "text", component: "Text", text: call };
    const rawValid = rawAjv.validate(rawComponent, component);
    const normalizedValid = normalizedAjv.validate(normalizedComponent, component);
    assert.equal(normalizedValid, rawValid, `${name}: parity mismatch`);
    if (name === "valid declared function") assert.equal(normalizedValid, true);
    else assert.equal(normalizedValid, false);
  }
});

test("generated Basic Catalog carries a generation and modification notice", () => {
  const source = readFileSync(
    new URL("../../src/basic-catalog/generated-basic-catalog.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /@generated by scripts\/generate-basic-catalog\.mjs/);
  assert.match(source, /a2ui-project\/a2ui/);
  assert.match(source, /ec97cb0d7499932e67003ffe5b709a3db7e7033a/);
  assert.match(source, /normalized\/modified for Weaver/);
  assert.match(source, /packages\/core\/THIRD_PARTY_LICENSES\.txt/);
  assert.doesNotMatch(source, /TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION/);
});

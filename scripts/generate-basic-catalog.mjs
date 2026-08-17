#!/usr/bin/env node

// Deterministic generator for the canonical A2UI v0.9.1 Basic Catalog.
//
// It reads the pinned official fixtures (exact upstream copies) and produces the
// Weaver-normalized production representation consumed by @weaver/core:
//
//   packages/core/src/protocol/a2ui/v0_9_1/inbound/fixtures/catalog.json
//   packages/core/src/protocol/a2ui/v0_9_1/inbound/fixtures/common_types.json
//        -> this generator
//        -> packages/core/src/basic-catalog/generated-basic-catalog.ts
//
// Run with --check to fail when the committed output is stale relative to the
// pinned inputs. The transformation is intentionally small and dependency-free.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = path.join(root, "packages", "core", "src", "protocol", "a2ui", "v0_9_1", "inbound", "fixtures");
const output = path.join(root, "packages", "core", "src", "basic-catalog", "generated-basic-catalog.ts");

const CATALOG_ID = "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json";
const ABS_COMMON_PREFIX = "https://a2ui.org/specification/v0_9/common_types.json#/$defs/";
const LOCAL_COMMON_PREFIX = "common_types.json#/$defs/";

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)]));
  return value;
}

function rewriteRef(value, localToCommon) {
  if (typeof value !== "string") return value;
  if (value.startsWith(ABS_COMMON_PREFIX)) return LOCAL_COMMON_PREFIX + value.slice(ABS_COMMON_PREFIX.length);
  if (localToCommon && value.startsWith("#/$defs/")) return LOCAL_COMMON_PREFIX + value.slice("#/$defs/".length);
  return value;
}

function rewriteCommonRefs(value, localToCommon = false) {
  if (Array.isArray(value)) return value.map((entry) => rewriteCommonRefs(entry, localToCommon));
  if (!isPlainObject(value)) return value;
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = key === "$ref" ? rewriteRef(entry, localToCommon) : rewriteCommonRefs(entry, localToCommon);
  }
  return result;
}

function resolveCommonDef(ref, commonDefs, catalogDefs) {
  if (ref.startsWith(ABS_COMMON_PREFIX)) return commonDefs[ref.slice(ABS_COMMON_PREFIX.length)];
  if (ref.startsWith(LOCAL_COMMON_PREFIX)) return commonDefs[ref.slice(LOCAL_COMMON_PREFIX.length)];
  if (ref.startsWith("#/$defs/")) return catalogDefs[ref.slice("#/$defs/".length)];
  return undefined;
}

function isCheckableRef(ref) {
  return ref === `${LOCAL_COMMON_PREFIX}Checkable` || ref === `${ABS_COMMON_PREFIX}Checkable`;
}

function mergeInto(target, source, localToCommon) {
  if (isPlainObject(source.properties)) {
    for (const [name, schema] of Object.entries(source.properties)) {
      target.properties[name] = rewriteCommonRefs(clone(schema), localToCommon);
    }
  }
  if (Array.isArray(source.required)) {
    for (const name of source.required) {
      if (!target.required.includes(name)) target.required.push(name);
    }
  }
}

function flattenComponent(source, commonDefs, catalogDefs) {
  const flattened = { type: "object", properties: {}, required: [] };
  let checkable = false;
  const members = Array.isArray(source.allOf) ? source.allOf : [];

  for (const member of members) {
    if (!isPlainObject(member)) continue;
    if (typeof member.$ref === "string") {
      const ref = member.$ref;
      if (isCheckableRef(ref)) {
        checkable = true;
        const checkableDef = commonDefs.Checkable;
        if (isPlainObject(checkableDef)) mergeInto(flattened, checkableDef, true);
        continue;
      }
      const resolved = resolveCommonDef(ref, commonDefs, catalogDefs);
      if (isPlainObject(resolved)) mergeInto(flattened, resolved, ref.startsWith("#/$defs/") ? false : true);
      continue;
    }
    mergeInto(flattened, member, true);
  }

  // The component's own `id` (from ComponentCommon) must stay non-structural;
  // literalize only that property. Other ComponentId refs (child/trigger/content,
  // nested list items) remain `$ref` so Weaver's structural discovery works.
  if (isPlainObject(flattened.properties.id) && flattened.properties.id.$ref === `${LOCAL_COMMON_PREFIX}ComponentId`) {
    flattened.properties.id = { type: "string" };
  }

  flattened.additionalProperties = false;
  if (checkable) flattened.allOf = [{ $ref: `${LOCAL_COMMON_PREFIX}Checkable` }];
  return flattened;
}

function normalize(catalog, common) {
  if (catalog.catalogId !== CATALOG_ID) {
    throw new Error(`Unexpected canonical catalogId: ${catalog.catalogId}`);
  }

  const commonDefs = common.$defs;
  const catalogDefs = catalog.$defs;

  const merged = {
    ...(catalog.$schema === undefined ? {} : { $schema: catalog.$schema }),
    $id: catalog.$id,
    ...(catalog.title === undefined ? {} : { title: catalog.title }),
    ...(catalog.description === undefined ? {} : { description: catalog.description }),
    catalogId: catalog.catalogId,
    components: {},
    functions: {},
    $defs: {},
  };

  for (const [name, component] of Object.entries(catalog.components)) {
    merged.components[name] = flattenComponent(component, commonDefs, catalogDefs);
  }

  for (const [name, fn] of Object.entries(catalog.functions)) {
    merged.functions[name] = rewriteCommonRefs(clone(fn));
  }

  for (const [name, def] of Object.entries(catalogDefs)) {
    merged.$defs[name] = rewriteCommonRefs(clone(def));
  }

  const inlinedCommonDefs = rewriteCommonRefs(clone(commonDefs), true);

  // Preserve the canonical FunctionCall anyFunction restriction. The pinned
  // FunctionCall references catalog.json#/$defs/anyFunction, which does not
  // survive CatalogRegistry's per-component root $id replacement. Build a
  // self-contained basic_functions resource instead.
  const functionNames = Object.keys(merged.functions);
  const basicFunctions = { $id: "basic_functions.json", $defs: {} };
  for (const [name, fn] of Object.entries(merged.functions)) {
    basicFunctions.$defs[name] = clone(fn);
  }
  basicFunctions.$defs.anyFunction = {
    oneOf: functionNames.map((name) => ({ $ref: `#/$defs/${name}` })),
  };

  const functionCall = inlinedCommonDefs.FunctionCall;
  if (isPlainObject(functionCall)) {
    functionCall.oneOf = [{ $ref: "basic_functions.json#/$defs/anyFunction" }];
  }

  merged.$defs.commonTypes = { $id: "common_types.json", $defs: inlinedCommonDefs };
  merged.$defs.basicFunctions = basicFunctions;
  return merged;
}

function assertCanonicalSets(catalog) {
  const components = Object.keys(catalog.components);
  const functions = Object.keys(catalog.functions);
  const expectedComponents = [
    "Text", "Image", "Icon", "Video", "AudioPlayer", "Row", "Column", "List",
    "Card", "Tabs", "Modal", "Divider", "Button", "TextField", "CheckBox",
    "ChoicePicker", "Slider", "DateTimeInput",
  ];
  const expectedFunctions = [
    "required", "regex", "length", "numeric", "email", "formatString",
    "formatNumber", "formatCurrency", "formatDate", "pluralize", "openUrl",
    "and", "or", "not",
  ];
  if (components.length !== expectedComponents.length || expectedComponents.some((name) => !components.includes(name))) {
    throw new Error(`Canonical component set mismatch: ${JSON.stringify(components)}`);
  }
  if (functions.length !== expectedFunctions.length || expectedFunctions.some((name) => !functions.includes(name))) {
    throw new Error(`Canonical function set mismatch: ${JSON.stringify(functions)}`);
  }
}

function generate() {
  const catalog = JSON.parse(readFileSync(path.join(fixtures, "catalog.json"), "utf8"));
  const common = JSON.parse(readFileSync(path.join(fixtures, "common_types.json"), "utf8"));
  assertCanonicalSets(catalog);
  const normalized = normalize(catalog, common);

  const json = JSON.stringify(normalized, null, 2);
  const header = [
    "// @generated by scripts/generate-basic-catalog.mjs. Do not edit this file directly;",
    "// edit scripts/generate-basic-catalog.mjs and regenerate.",
    "//",
    "// Portions are derived from the A2UI v0.9.1 schemas:",
    "//   a2ui-project/a2ui",
    "//   commit ec97cb0d7499932e67003ffe5b709a3db7e7033a",
    "//   specification/v0_9_1/json/common_types.json",
    "//   specification/v0_9_1/catalogs/basic/catalog.json",
    "//",
    "// This representation has been normalized/modified for Weaver and is not an",
    "// exact copy. Redistribution terms for the upstream material are in",
    "// packages/core/THIRD_PARTY_LICENSES.txt.",
    "",
    'import type { JsonObject } from "../protocol/index.js";',
    "",
    `export const A2UI_V091_BASIC_CATALOG_ID = ${JSON.stringify(CATALOG_ID)};`,
    "",
    "export const A2UI_V091_BASIC_CATALOG: JsonObject =",
    json,
    ";",
    "",
  ].join("\n");

  return header;
}

const header = generate();
if (process.argv.includes("--check")) {
  const current = readFileSync(output, "utf8");
  if (current !== header) {
    process.stderr.write("Basic Catalog generated output is stale; run scripts/generate-basic-catalog.mjs\n");
    process.exit(1);
  }
  process.stdout.write("Basic Catalog generated output is up to date.\n");
} else {
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, header);
  process.stdout.write(`Wrote ${path.relative(root, output)}\n`);
}

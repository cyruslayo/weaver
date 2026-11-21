#!/usr/bin/env node

// Deterministic generator for the canonical A2UI v1.0 Basic Catalog.
//
// It reads the pinned official fixtures (exact upstream copies at
// a2ui-project/a2ui@5ff1b05f02d39f969b52a942e78e864ef3ac01fa) and produces the
// Weaver-normalized production representation consumed by @cylayo/weaver-core:
//
//   packages/core/src/protocol/a2ui/v1_0/inbound/fixtures/catalog.json
//   packages/core/src/protocol/a2ui/v1_0/inbound/fixtures/common_types.json
//        -> this generator
//        -> packages/core/src/basic-catalog/generated-basic-catalog.ts
//
// The v1.0 upstream catalog already uses relative `common_types.json#/$defs/...`
// references and explicit component properties. The transformation therefore
// only flattens each component's `allOf` (Checkable mixin) and drops the upstream
// commonTypes. Core resolves common_types.json itself (see
// scripts/generate-common-types.mjs). Every other reference is a hard error.
//
// Run with --check to fail when the committed output is stale relative to the
// pinned inputs. The transformation is intentionally small and dependency-free.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = path.join(root, "packages", "core", "src", "protocol", "a2ui", "v1_0", "inbound", "fixtures");
const output = path.join(root, "packages", "core", "src", "basic-catalog", "generated-basic-catalog.ts");

const CATALOG_ID = "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json";
const PROTOCOL_VERSION = "1.0";
const UPSTREAM_COMMIT = "5ff1b05f02d39f969b52a942e78e864ef3ac01fa";
const ABS_COMMON_PREFIX = "https://a2ui.org/specification/v1_0/common_types.json#";
const COMMON_PREFIX = "common_types.json#/$defs/";
const CHECKABLE_REF = `${COMMON_PREFIX}Checkable`;
const CATALOG_METADATA_KEYS = ["$schema", "$id", "protocolVersion", "title", "description", "catalogId", "instructions", "metadata"];

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)]));
  return value;
}

/**
 * Returns a copy whose `$ref` values are all in the supported form. Absolute v1.0
 * common-types URIs become the relative form. The upstream anyFunction reference
 * is redirected to the embedded basic_functions resource. Anything else is an error.
 */
function rewriteRefs(value) {
  if (Array.isArray(value)) return value.map(rewriteRefs);
  if (!isPlainObject(value)) return value;
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = key === "$ref" ? rewriteRef(entry) : rewriteRefs(entry);
  }
  return result;
}

function rewriteRef(ref) {
  if (typeof ref !== "string") throw new Error(`Unexpected $ref value: ${JSON.stringify(ref)}`);
  if (ref.startsWith(ABS_COMMON_PREFIX)) return `common_types.json#${ref.slice(ABS_COMMON_PREFIX.length)}`;
  if (ref.startsWith("#/") || ref.startsWith(COMMON_PREFIX)) return ref;
  throw new Error(`Unsupported $ref in pinned Basic Catalog: ${ref}`);
}

/**
 * Rewrites a local `#/$defs/X` reference that belongs to the common-types
 * resource into `common_types.json#/$defs/X`. Mixin members copied from that
 * resource would otherwise resolve against the catalog root, where those names
 * do not exist.
 */
function localCommonRefs(value) {
  if (Array.isArray(value)) return value.map(localCommonRefs);
  if (!isPlainObject(value)) return value;
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "$ref" && typeof entry === "string" && entry.startsWith("#/$defs/")) {
      result[key] = `${COMMON_PREFIX}${entry.slice("#/$defs/".length)}`;
    } else {
      result[key] = localCommonRefs(entry);
    }
  }
  return result;
}

/** Copies a component schema's properties and required names into the flattened target. */
function mergeSchema(target, source, fromCommonTypes = false) {
  if (isPlainObject(source.properties)) {
    for (const [name, schema] of Object.entries(source.properties)) {
      const copied = fromCommonTypes ? localCommonRefs(clone(schema)) : clone(schema);
      target.properties[name] = rewriteRefs(copied);
    }
  }
  if (Array.isArray(source.required)) {
    for (const name of source.required) {
      if (!target.required.includes(name)) target.required.push(name);
    }
  }
}

/**
 * Flattens one upstream component into a single object schema. The component's
 * own top-level properties are merged first, then each `allOf` member. The only
 * supported `$ref` member is the Checkable mixin, which is also kept as a
 * `$ref` so the registry can recognize checkable components.
 */
function flattenComponent(name, source, commonDefs) {
  const flattened = { type: "object", properties: {}, required: [] };
  if (typeof source.description === "string") flattened.description = source.description;
  mergeSchema(flattened, source);

  let checkable = false;
  const members = Array.isArray(source.allOf) ? source.allOf : [];
  for (const member of members) {
    if (!isPlainObject(member)) throw new Error(`Component ${name} has a non-object allOf member`);
    if (member.$ref === CHECKABLE_REF) {
      checkable = true;
      mergeSchema(flattened, commonDefs.Checkable, true);
      continue;
    }
    if (typeof member.$ref === "string") throw new Error(`Component ${name} has an unsupported allOf $ref: ${member.$ref}`);
    mergeSchema(flattened, member);
  }

  flattened.additionalProperties = false;
  if (checkable) flattened.allOf = [{ $ref: CHECKABLE_REF }];
  return rewriteRefs(flattened);
}

function normalize(catalog, common) {
  if (catalog.catalogId !== CATALOG_ID) {
    throw new Error(`Unexpected canonical catalogId: ${catalog.catalogId}`);
  }
  if (catalog.protocolVersion !== PROTOCOL_VERSION) {
    throw new Error(`Unexpected canonical protocolVersion: ${catalog.protocolVersion}`);
  }

  const commonDefs = common.$defs;
  const catalogDefs = catalog.$defs;

  const merged = {};
  for (const key of CATALOG_METADATA_KEYS) {
    if (catalog[key] !== undefined) merged[key] = clone(catalog[key]);
  }
  merged.components = {};
  merged.functions = {};
  merged.$defs = {};

  for (const [name, component] of Object.entries(catalog.components)) {
    merged.components[name] = flattenComponent(name, component, commonDefs);
  }

  for (const [name, fn] of Object.entries(catalog.functions)) {
    merged.functions[name] = rewriteRefs(clone(fn));
  }

  for (const [name, def] of Object.entries(catalogDefs)) {
    merged.$defs[name] = rewriteRefs(clone(def));
  }

  // The common types (including FunctionCall) are built into Core from the pinned
  // common_types.json (catalog/generated-common-types.ts). The generated catalog
  // therefore embeds no commonTypes resource; every reference it makes is local
  // or to that built-in document.
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
  let catalog;
  let common;
  try {
    catalog = JSON.parse(readFileSync(path.join(fixtures, "catalog.json"), "utf8"));
    common = JSON.parse(readFileSync(path.join(fixtures, "common_types.json"), "utf8"));
  } catch (error) {
    throw new Error(`Could not read Basic Catalog fixtures: ${error instanceof Error ? error.message : String(error)}`);
  }
  assertCanonicalSets(catalog);
  const normalized = normalize(catalog, common);

  const json = JSON.stringify(normalized, null, 2);
  const header = [
    "// @generated by scripts/generate-basic-catalog.mjs. Do not edit this file directly;",
    "// edit scripts/generate-basic-catalog.mjs and regenerate.",
    "//",
    "// Portions are derived from the A2UI v1.0 schemas:",
    "//   a2ui-project/a2ui",
    `//   commit ${UPSTREAM_COMMIT}`,
    "//   specification/v1_0/json/common_types.json",
    "//   catalogs/basic/v1/catalog.json",
    "//",
    "// This representation has been normalized/modified for Weaver and is not an",
    "// exact copy. Redistribution terms for the upstream material are in",
    "// packages/core/THIRD_PARTY_LICENSES.txt.",
    "",
    'import type { JsonObject } from "../protocol/index.js";',
    "",
    `export const A2UI_V10_BASIC_CATALOG_ID = ${JSON.stringify(CATALOG_ID)};`,
    "",
    "export const A2UI_V10_BASIC_CATALOG: JsonObject =",
    json,
    ";",
    "",
  ].join("\n");

  return header;
}

const header = generate();
if (process.argv.includes("--check")) {
  const current = readFileSync(output, "utf8");
  if (current.replace(/\r\n/g, "\n") !== header) {
    process.stderr.write("Basic Catalog generated output is stale; run scripts/generate-basic-catalog.mjs\n");
    process.exit(1);
  }
  process.stdout.write("Basic Catalog generated output is up to date.\n");
} else {
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, header);
  process.stdout.write(`Wrote ${path.relative(root, output)}\n`);
}

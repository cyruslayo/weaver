import assert from "node:assert/strict";
import { test } from "node:test";

import * as core from "./index.js";
import {
  A2UI_V10_BASIC_CATALOG_ID,
  WEAVER_CORE_VERSION,
  createBasicCatalogV10Registration,
  createWeaverRuntime,
} from "./index.js";

/** Runtime exports that the v1.0 surface must provide. Types are checked by tsc. */
const V10_RUNTIME_EXPORTS = [
  "A2UI_V10_BASIC_CATALOG_ID",
  "A2UI_V10_BASIC_PROMPT_EXAMPLES",
  "createA2UIV10Producer",
  "createA2UIV10StreamIngestion",
  "createBasicCatalogV10Registration",
  "generateA2UIV10Prompt",
  "validateA2UIAgentMessage",
  "buildA2UIRendererCapabilities",
  "buildA2UIGenericRendererErrorMessage",
  "buildA2UIValidationFailedRendererMessage",
  "mapA2UIValidationFailure",
  "describeWeaverError",
  "createWeaverTraceRecorder",
  "parseWeaverTrace",
  "replayWeaverTrace",
];

test("exports the Weaver runtime facade", () => {
  assert.equal(WEAVER_CORE_VERSION, "0.4.0");
  assert.deepEqual(createWeaverRuntime({ catalogs: [] }).ok, true);
});

test("exports the canonical A2UI v1.0 Basic Catalog registration helper", () => {
  assert.equal(
    A2UI_V10_BASIC_CATALOG_ID,
    "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json",
  );
  assert.equal(createBasicCatalogV10Registration().catalogId, A2UI_V10_BASIC_CATALOG_ID);
});

test("exports the v1.0 names that Weaver supports", () => {
  const exported = new Set(Object.keys(core));
  for (const name of V10_RUNTIME_EXPORTS) {
    assert.ok(exported.has(name), `${name} is exported`);
  }
});

test("no v0.9.1 names are exported", () => {
  for (const name of Object.keys(core)) {
    assert.doesNotMatch(name, /V091|V_091|v091|0_9|0\.9/, `${name} is not a v0.9.1 name`);
  }
});

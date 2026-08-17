import assert from "node:assert/strict";
import { test } from "node:test";

import { A2UI_V091_BASIC_CATALOG_ID, WEAVER_CORE_VERSION, createWeaverRuntime } from "./index.js";

test("exports the Weaver runtime facade", () => {
  assert.equal(WEAVER_CORE_VERSION, "0.1.2");
  assert.deepEqual(createWeaverRuntime({ catalogs: [] }).ok, true);
});

test("exports the canonical Basic Catalog registration helper", () => {
  assert.equal(A2UI_V091_BASIC_CATALOG_ID, "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json");
});

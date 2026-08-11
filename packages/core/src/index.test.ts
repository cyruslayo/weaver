import assert from "node:assert/strict";
import { test } from "node:test";

import { WEAVER_CORE_VERSION, createWeaverRuntime } from "./index.js";

test("exports the Weaver runtime facade", () => {
  assert.equal(WEAVER_CORE_VERSION, "0.1.1");
  assert.deepEqual(createWeaverRuntime({ catalogs: [] }).ok, true);
});

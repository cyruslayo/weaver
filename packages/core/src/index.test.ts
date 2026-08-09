import assert from "node:assert/strict";
import { test } from "node:test";

import { createWeaverRuntime } from "./index.js";

test("creates a ready Weaver runtime", () => {
  assert.equal(createWeaverRuntime().status, "ready");
});

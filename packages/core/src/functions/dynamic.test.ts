import assert from "node:assert/strict";
import { test } from "node:test";
import { coerceDynamicBoolean, isDataBinding, isFunctionCall, unescapeLiteralDynamicValue } from "./dynamic.js";

test("a DataBinding is exactly one @path key holding a string", () => {
  assert.equal(isDataBinding({ "@path": "/user/name" }), true);
  assert.equal(isDataBinding({ "@path": "name" }), true);
  assert.equal(isDataBinding({ "@path": "" }), true);
  assert.equal(isDataBinding({ path: "/user/name" }), false, "the legacy path key is literal");
  assert.equal(isDataBinding({ "@path": "/x", extra: 1 }), false);
  assert.equal(isDataBinding({ "@path": 4 }), false);
  assert.equal(isDataBinding(["@path"]), false);
  assert.equal(isDataBinding(null), false);
});

test("a FunctionCall has an @call string, optional object args, and optional catalogId", () => {
  assert.equal(isFunctionCall({ "@call": "echo", args: { value: "x" } }), true);
  assert.equal(isFunctionCall({ "@call": "@index" }), true, "args are optional");
  assert.equal(isFunctionCall({ "@call": "echo", catalogId: "basic" }), true);
  assert.equal(isFunctionCall({ call: "echo", args: {} }), false, "the legacy call key is literal");
  assert.equal(isFunctionCall({ "@call": "echo", args: [] }), false);
  assert.equal(isFunctionCall({ "@call": "echo", returnType: "string" }), false, "declaration keys are not wire keys");
  assert.equal(isFunctionCall({ "@call": 1 }), false);
});

test("unescape turns @@ keys into single-@ literals and rejects any other reserved key", () => {
  assert.deepEqual(unescapeLiteralDynamicValue({ "@@path": "/static/file", "@@type": "Resource" }), {
    ok: true,
    value: { "@path": "/static/file", "@type": "Resource" },
  });
  assert.deepEqual(unescapeLiteralDynamicValue({ "@@": "pair" }), { ok: true, value: { "@": "pair" } });
  assert.deepEqual(unescapeLiteralDynamicValue({ path: "/var/log", call: "audit" }), { ok: true, value: { path: "/var/log", call: "audit" } });
  for (const key of ["@if", "@", "@metadata", "@path"]) {
    assert.deepEqual(unescapeLiteralDynamicValue({ [key]: true }), {
      ok: false,
      error: { code: "INVALID_RESERVED_KEY", key, path: "" },
    }, key);
  }
});

test("unescape applies the same rules inside nested literal objects and arrays", () => {
  assert.deepEqual(unescapeLiteralDynamicValue({ outer: { "@@path": "x" }, list: [{ "@@type": "y" }] }), {
    ok: true,
    value: { outer: { "@path": "x" }, list: [{ "@type": "y" }] },
  });
  assert.deepEqual(unescapeLiteralDynamicValue({ outer: { "@if": 1 } }), {
    ok: false,
    error: { code: "INVALID_RESERVED_KEY", key: "@if", path: "/outer" },
  });
});

test("DynamicBoolean coercion follows the spec table for every resolved value", () => {
  // boolean: unchanged
  assert.equal(coerceDynamicBoolean(true), true);
  assert.equal(coerceDynamicBoolean(false), false);
  // ValidationResult: its valid property
  assert.equal(coerceDynamicBoolean({ valid: true }), true);
  assert.equal(coerceDynamicBoolean({ valid: false, message: "no", severity: "error" }), false);
  // strings: "true"/"false" in any case; everything else is false
  assert.equal(coerceDynamicBoolean("true"), true);
  assert.equal(coerceDynamicBoolean("TRUE"), true);
  assert.equal(coerceDynamicBoolean("False"), false);
  assert.equal(coerceDynamicBoolean(""), false);
  assert.equal(coerceDynamicBoolean("hello"), false);
  assert.equal(coerceDynamicBoolean("1"), false);
  // numbers: 0 is false, any other number is true
  assert.equal(coerceDynamicBoolean(0), false);
  assert.equal(coerceDynamicBoolean(-0), false);
  assert.equal(coerceDynamicBoolean(1), true);
  assert.equal(coerceDynamicBoolean(-2.5), true);
  // null or absent, other objects, and arrays are false
  assert.equal(coerceDynamicBoolean(null), false);
  assert.equal(coerceDynamicBoolean(undefined), false);
  assert.equal(coerceDynamicBoolean({ other: true }), false);
  assert.equal(coerceDynamicBoolean([true]), false);
});

import assert from "node:assert/strict";
import { test } from "node:test";

import { invalidA2UIFixtures, validA2UIFixtures } from "./fixtures.js";
import type { A2UIServerMessage } from "./types.js";
import { validateA2UIServerMessage } from "./validation.js";

for (const [name, fixture] of Object.entries(validA2UIFixtures)) {
  test(`accepts valid ${name}`, () => assert.equal(validateA2UIServerMessage(fixture).ok, true));
}

for (const [name, fixture] of Object.entries(invalidA2UIFixtures)) {
  test(`rejects invalid ${name}`, () => assert.equal(validateA2UIServerMessage(fixture).ok, false));
}

test("accepts the v0.9.1 protocol family and preserves the wire version", () => {
  for (const version of ["v0.9", "v0.9.1"] as const) {
    const input = { version, deleteSurface: { surfaceId: "main" } };
    const result = validateA2UIServerMessage(input);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.version, version);
  }
});

test("rejects versions outside the v0.9.1 protocol family", () => {
  for (const version of ["v0.8", "v0.8.1", "v1.0"]) {
    assert.equal(validateA2UIServerMessage({ version, deleteSurface: { surfaceId: "main" } }).ok, false);
  }
});

test("accepts empty identifier strings as structurally valid", () => {
  const messages = [
    { version: "v0.9.1", createSurface: { surfaceId: "", catalogId: "" } },
    { version: "v0.9.1", updateComponents: { surfaceId: "", components: [{ id: "", component: "" }] } },
    { version: "v0.9.1", updateDataModel: { surfaceId: "", path: "", value: null } },
    { version: "v0.9.1", deleteSurface: { surfaceId: "" } },
  ];

  for (const message of messages) {
    assert.equal(validateA2UIServerMessage(message).ok, true);
  }
});

test("rejects all legacy Weaver message names", () => {
  for (const key of ["beginRendering", "surfaceUpdate", "dataModelUpdate", "streamComplete"]) {
    assert.equal(validateA2UIServerMessage({ version: "v0.9.1", [key]: {} }).ok, false);
  }
});

test("preserves omitted value separately from null", () => {
  const omitted = validateA2UIServerMessage(validA2UIFixtures.updateDataModelOmittedValue);
  const withNull = validateA2UIServerMessage(validA2UIFixtures.updateDataModelNullValue);
  assert.equal(omitted.ok, true);
  assert.equal(withNull.ok, true);
  if (omitted.ok && "updateDataModel" in omitted.value) assert.equal("value" in omitted.value.updateDataModel, false);
  if (withNull.ok && "updateDataModel" in withNull.value) assert.equal(withNull.value.updateDataModel.value, null);
});

test("does not mutate input", () => {
  const input = structuredClone(validA2UIFixtures.updateComponents);
  const before = structuredClone(input);
  validateA2UIServerMessage(input);
  assert.deepEqual(input, before);
});

test("rejects JavaScript values that are not representable in JSON", () => {
  for (const value of [new Date(), Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(
      validateA2UIServerMessage({ version: "v0.9.1", updateDataModel: { surfaceId: "main", value } }).ok,
      false,
    );
  }
});

test("rejects an empty component update", () => {
  assert.equal(
    validateA2UIServerMessage({ version: "v0.9.1", updateComponents: { surfaceId: "main", components: [] } }).ok,
    false,
  );
});

function typeNarrowing(message: A2UIServerMessage): string {
  if ("createSurface" in message) return message.createSurface.surfaceId;
  if ("updateComponents" in message) return message.updateComponents.surfaceId;
  if ("updateDataModel" in message) return message.updateDataModel.surfaceId;
  return message.deleteSurface.surfaceId;
}

test("supports discriminated union narrowing", () => {
  assert.equal(typeNarrowing(validA2UIFixtures.createSurface), "main");
});

import assert from "node:assert/strict";
import { test } from "node:test";

import { invalidA2UIFixtures, validA2UIFixtures } from "./fixtures.js";
import { formatAjvErrors, validatePinnedAgentMessage } from "./pinnedSchemas.test-helper.js";
import type { A2UIAgentMessage } from "./types.js";
import { validateA2UIAgentMessage } from "./validation.js";

/**
 * Invalid fixtures that the pinned upstream schema also rejects. Weaver-only
 * rules (identifier syntax, reserved Surface component, empty ids, and values
 * that are not JSON) are checked by Weaver's validator alone, because the
 * upstream schema types component ids as plain strings.
 */
const WEAVER_ONLY_REJECTIONS = new Set([
  "componentHyphenId",
  "componentDigitLeadId",
  "componentEmptyId",
  "nonJsonPropertyValue",
  "createSurfaceSurfaceComponent",
  "updateComponentsSurfaceComponent",
]);

for (const [name, fixture] of Object.entries(validA2UIFixtures)) {
  test(`accepts valid ${name} and matches the pinned schema`, () => {
    assert.equal(validateA2UIAgentMessage(fixture).ok, true);
    assert.equal(validatePinnedAgentMessage(fixture), true, formatAjvErrors(validatePinnedAgentMessage.errors));
  });
}

for (const [name, fixture] of Object.entries(invalidA2UIFixtures)) {
  test(`rejects invalid ${name}`, () => {
    assert.equal(validateA2UIAgentMessage(fixture).ok, false);
    if (!WEAVER_ONLY_REJECTIONS.has(name)) {
      assert.equal(validatePinnedAgentMessage(fixture), false, `pinned schema should reject ${name}`);
    }
  });
}

test("rejects every v0.9 and v0.9.1 wire version and accepts only 1.0", () => {
  for (const version of ["v0.9", "v0.9.1", "v1.0", "1", "1.0.0", ""]) {
    const result = validateA2UIAgentMessage({ version, deleteSurface: { surfaceId: "main" } });
    assert.equal(result.ok, false, `version ${JSON.stringify(version)} must be rejected`);
    if (!result.ok) assert.equal(result.issues[0]?.path, "/version");
  }
  const accepted = validateA2UIAgentMessage({ version: "1.0", deleteSurface: { surfaceId: "main" } });
  assert.equal(accepted.ok, true);
  if (accepted.ok) assert.equal(accepted.value.version, "1.0");
});

test("rejects the theme property on createSurface (v1.0 is strict)", () => {
  const result = validateA2UIAgentMessage(invalidA2UIFixtures.createSurfaceTheme);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issues[0]?.path, "/createSurface/theme");
});

test("rejects a missing updateDataModel value with a path to value", () => {
  const result = validateA2UIAgentMessage(invalidA2UIFixtures.updateDataModelMissingValue);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issues[0]?.path, "/updateDataModel/value");
});

test("accepts an explicit null updateDataModel value as the deletion sentinel", () => {
  const result = validateA2UIAgentMessage(validA2UIFixtures.updateDataModelNullValue);
  assert.equal(result.ok, true);
  if (result.ok && "updateDataModel" in result.value) assert.equal(result.value.updateDataModel.value, null);
});

test("accepts identifiers that match the XID rule and rejects those that do not", () => {
  const withId = (id: string) => ({
    version: "1.0",
    updateComponents: { surfaceId: "main", components: [{ id, component: "Text", text: "x" }] },
  });
  for (const id of ["root", "_private", "title_2", "ünïcode", "a"]) {
    assert.equal(validateA2UIAgentMessage(withId(id)).ok, true, `${id} should be accepted`);
  }
  for (const id of ["user-card", "1st_item", "", "has space", "a.b"]) {
    assert.equal(validateA2UIAgentMessage(withId(id)).ok, false, `${id} should be rejected`);
  }
});

test("rejects the implicit Surface component in both createSurface and updateComponents", () => {
  for (const key of ["createSurface", "updateComponents"] as const) {
    const input = key === "createSurface"
      ? { version: "1.0", createSurface: { surfaceId: "main", components: [{ id: "root", component: "Surface" }] } }
      : { version: "1.0", updateComponents: { surfaceId: "main", components: [{ id: "root", component: "Surface" }] } };
    const result = validateA2UIAgentMessage(input);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.issues[0]?.path ?? "", /\/component$/);
  }
});

test("validates createSurface extensions keys as Unicode identifiers", () => {
  const ok = validateA2UIAgentMessage({ version: "1.0", createSurface: { surfaceId: "main", metadata: { extensions: { vendor_x: 1 } } } });
  assert.equal(ok.ok, true);
  const bad = validateA2UIAgentMessage(invalidA2UIFixtures.createSurfaceBadExtensionKey);
  assert.equal(bad.ok, false);
});

test("validates callRendererFunction and agentFunctionResponse shapes", () => {
  assert.equal(validateA2UIAgentMessage(validA2UIFixtures.callRendererFunction).ok, true);
  assert.equal(validateA2UIAgentMessage(validA2UIFixtures.agentFunctionResponse).ok, true);
  assert.equal(validateA2UIAgentMessage(invalidA2UIFixtures.callRendererFunctionMissingCatalogId).ok, false);
  assert.equal(validateA2UIAgentMessage(invalidA2UIFixtures.agentFunctionResponseBothValueAndError).ok, false);
  assert.equal(validateA2UIAgentMessage(invalidA2UIFixtures.agentFunctionResponseNeither).ok, false);
});

test("rejects all legacy Weaver message names", () => {
  for (const key of ["beginRendering", "surfaceUpdate", "dataModelUpdate", "streamComplete"]) {
    assert.equal(validateA2UIAgentMessage({ version: "1.0", [key]: {} }).ok, false);
  }
});

test("accepts empty surface identifiers as structurally valid strings", () => {
  // Surface ids are opaque strings at the protocol level; uniqueness is enforced by the runtime.
  assert.equal(validateA2UIAgentMessage({ version: "1.0", deleteSurface: { surfaceId: "" } }).ok, true);
});

test("does not mutate input", () => {
  const input = structuredClone(validA2UIFixtures.updateComponents);
  const before = structuredClone(input);
  validateA2UIAgentMessage(input);
  assert.deepEqual(input, before);
});

test("rejects JavaScript values that are not representable in JSON", () => {
  for (const value of [new Date(), Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(
      validateA2UIAgentMessage({ version: "1.0", updateDataModel: { surfaceId: "main", value } }).ok,
      false,
    );
  }
});

test("rejects an empty component update and an empty createSurface component list", () => {
  assert.equal(
    validateA2UIAgentMessage({ version: "1.0", updateComponents: { surfaceId: "main", components: [] } }).ok,
    false,
  );
  assert.equal(
    validateA2UIAgentMessage(invalidA2UIFixtures.createSurfaceEmptyComponents).ok,
    false,
  );
});

function typeNarrowing(message: A2UIAgentMessage): string {
  if ("createSurface" in message) return message.createSurface.surfaceId;
  if ("updateComponents" in message) return message.updateComponents.surfaceId;
  if ("updateDataModel" in message) return message.updateDataModel.surfaceId;
  if ("deleteSurface" in message) return message.deleteSurface.surfaceId;
  if ("callRendererFunction" in message) return message.callRendererFunction.functionCallId;
  return message.agentFunctionResponse.functionCallId;
}

test("supports discriminated union narrowing across all six envelope keys", () => {
  assert.equal(typeNarrowing(validA2UIFixtures.createSurface), "main");
  assert.equal(typeNarrowing(validA2UIFixtures.callRendererFunction), "call-1");
  assert.equal(typeNarrowing(validA2UIFixtures.agentFunctionResponse), "call-1");
});

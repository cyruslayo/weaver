import assert from "node:assert/strict";
import test from "node:test";
import { createWeaverRuntime } from "../../../../runtime/index.js";
import type { JsonObject } from "../types.js";
import {
  formatAjvErrors,
  validatePinnedRendererCapabilities,
  validatePinnedRendererDataModel,
  validatePinnedRendererEvent,
} from "../pinnedSchemas.test-helper.js";
import {
  buildA2UIGenericRendererErrorMessage,
  buildA2UIRendererCapabilities,
  buildA2UIValidationFailedRendererMessage,
  mapA2UIValidationFailure,
} from "./index.js";

function assertPinnedEvent(message: unknown): void {
  assert.equal(validatePinnedRendererEvent(message), true, formatAjvErrors(validatePinnedRendererEvent.errors));
}

function catalog(catalogId: string): JsonObject {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    catalogId,
    components: {
      Text: {
        type: "object",
        properties: { component: { const: "Text" }, text: { type: "string" } },
        required: ["component", "text"],
        additionalProperties: false,
      },
    },
    functions: {},
    protocolVersion: "1.0",
    $defs: { anyComponent: { type: "object" }, anyFunction: { type: "object" } },
  };
}

const create = (surfaceId = "form") => ({
  version: "1.0",
  createSurface: { surfaceId, catalogId: "catalog-a" },
});

function runtime() {
  const made = createWeaverRuntime({ catalogs: [{ catalogId: "catalog-a", schema: catalog("catalog-a") }] });
  assert.ok(made.ok);
  return made.value;
}

test("capability builder emits the exact ordered, defensive v1.0 file shape", () => {
  const ids = ["catalog-a", "catalog-b"];
  const capabilities = buildA2UIRendererCapabilities({ supportedCatalogIds: ids });
  assert.deepEqual(capabilities, { "1.0": { supportedCatalogIds: ids } });
  assert.equal("v0.9" in capabilities, false);
  assert.equal("inlineCatalogs" in capabilities["1.0"], false);
  capabilities["1.0"].supportedCatalogIds.push("changed");
  assert.deepEqual(ids, ["catalog-a", "catalog-b"]);
  const empty = buildA2UIRendererCapabilities({ supportedCatalogIds: [] });
  assert.equal(validatePinnedRendererCapabilities(empty), true, formatAjvErrors(validatePinnedRendererCapabilities.errors));
});

test("runtime capabilities preserve registration order, support empty runtimes, and own output", () => {
  const made = createWeaverRuntime({ catalogs: [
    { catalogId: "catalog-b", schema: catalog("catalog-b") },
    { catalogId: "catalog-a", schema: catalog("catalog-a") },
  ] });
  assert.ok(made.ok);
  const output = made.value.getRendererCapabilities();
  assert.deepEqual(output, { "1.0": { supportedCatalogIds: ["catalog-b", "catalog-a"] } });
  output["1.0"].supportedCatalogIds.push("bad");
  assert.deepEqual(made.value.getRendererCapabilities()["1.0"].supportedCatalogIds, ["catalog-b", "catalog-a"]);
  const empty = createWeaverRuntime();
  assert.ok(empty.ok);
  assert.deepEqual(empty.value.getRendererCapabilities(), { "1.0": { supportedCatalogIds: [] } });
  assert.equal(validatePinnedRendererCapabilities(made.value.getRendererCapabilities()), true);
});

test("validation-error builder emits the exact v1.0 error shape and accepts the upstream codes", () => {
  const expectedError = { code: "VALIDATION_FAILED", surfaceId: "form", path: "/updateComponents/components/0/text", message: "Expected string" };
  const built = buildA2UIValidationFailedRendererMessage({ surfaceId: "form", path: "/updateComponents/components/0/text", message: "Expected string" });
  assert.deepEqual(built, { version: "1.0", error: expectedError });
  assertPinnedEvent(built);
  const unallowed = buildA2UIValidationFailedRendererMessage({ surfaceId: "form", path: "/x", message: "m", code: "UNALLOWED_CHILD" });
  assert.equal(unallowed.error.code, "UNALLOWED_CHILD");
  assertPinnedEvent(unallowed);
  assert.throws(() => buildA2UIValidationFailedRendererMessage({ surfaceId: "", path: "/", message: "bad" }), TypeError);
});

test("generic error builder requires exactly one of surfaceId or functionCallId", () => {
  const onSurface = buildA2UIGenericRendererErrorMessage({ code: "RENDER_FAILED", message: "boom", surfaceId: "main" });
  assert.deepEqual(onSurface, { version: "1.0", error: { code: "RENDER_FAILED", message: "boom", surfaceId: "main" } });
  assertPinnedEvent(onSurface);
  const onCall = buildA2UIGenericRendererErrorMessage({ code: "FUNCTION_FAILED", message: "boom", functionCallId: "call-1" });
  assertPinnedEvent(onCall);
  assert.throws(() => buildA2UIGenericRendererErrorMessage({ code: "X", message: "m" }), TypeError);
  assert.throws(() => buildA2UIGenericRendererErrorMessage({ code: "X", message: "m", surfaceId: "a", functionCallId: "b" }), TypeError);
  assert.throws(() => buildA2UIGenericRendererErrorMessage({ code: "VALIDATION_FAILED", message: "m", surfaceId: "a" }), TypeError);
});

test("maps protocol issues deterministically, extracts identity, supports fallback, and owns output", () => {
  const rt = runtime();
  const malformed = { version: "bad", updateComponents: { surfaceId: "form", components: "bad", extra: true } };
  const result = rt.process(malformed);
  const mapped = mapA2UIValidationFailure({ result, input: malformed });
  assert.ok(mapped.ok);
  assert.equal(mapped.value.error.path, "/version");
  assert.equal(mapped.value.error.message, 'Expected version "1.0"');
  mapped.value.error.message = "changed";
  assert.equal(!result.ok && result.error.code === "PROTOCOL_VALIDATION_FAILED" && result.error.issues[0]?.message, 'Expected version "1.0"');

  const missing = { version: "bad" };
  assert.deepEqual(mapA2UIValidationFailure({ result: rt.process(missing), input: missing }), { ok: false, error: { code: "VALIDATION_ERROR_SURFACE_ID_REQUIRED" } });
  const fallback = mapA2UIValidationFailure({ result: rt.process(missing), input: missing, surfaceId: "trusted-route" });
  assert.ok(fallback.ok);
  assert.equal(fallback.value.error.surfaceId, "trusted-route");
  assertPinnedEvent(fallback.value);
});

test("maps component and catalog validation with normalized paths, and theme as an unexpected protocol property", () => {
  const rt = runtime();
  assert.ok(rt.process(create()).ok);
  const cases = [
    { input: { version: "1.0", updateComponents: { surfaceId: "form", components: [{ id: "root", component: "Text", text: 4 }] } }, pathIncludes: "/updateComponents/components/0/text" },
    { input: { version: "1.0", updateComponents: { surfaceId: "form", components: [{ id: "root", component: "Unknown" }] } }, pathIncludes: "/updateComponents/components/0" },
  ];
  for (const entry of cases) {
    const mapped = mapA2UIValidationFailure({ result: rt.process(entry.input), input: entry.input });
    assert.ok(mapped.ok);
    assert.equal(mapped.value.error.code, "VALIDATION_FAILED");
    assert.equal(mapped.value.error.path, entry.pathIncludes);
    assert.equal(Object.keys(mapped.value.error).sort().join(","), "code,message,path,surfaceId");
  }

  const themed = runtime();
  const badTheme = { version: "1.0", createSurface: { surfaceId: "theme-surface", catalogId: "catalog-a", theme: { primaryColor: "red" } } };
  const mappedTheme = mapA2UIValidationFailure({ result: themed.process(badTheme), input: badTheme });
  assert.ok(mappedTheme.ok);
  assert.equal(mappedTheme.value.error.path, "/createSurface/theme");
});

test("does not classify lifecycle errors as validation failures", () => {
  const rt = runtime();
  const input = { version: "1.0", updateComponents: { surfaceId: "missing", components: [{ id: "root", component: "Text", text: "ok" }] } };
  assert.deepEqual(mapA2UIValidationFailure({ result: rt.process(input), input }), { ok: false, error: { code: "NOT_A_VALIDATION_FAILURE" } });
});

test("renderer action and renderer data-model shapes are valid against the pinned schema", () => {
  const action = {
    version: "1.0",
    action: {
      name: "submit",
      surfaceId: "form",
      sourceComponentId: "button",
      timestamp: "2025-01-02T03:04:05.000Z",
      context: {},
    },
  };
  const withOptional = {
    version: "1.0",
    action: { ...action.action, userMessage: "Submitted", metadata: { extensions: { vendor_x: 1 } } },
  };
  const dataModel = { version: "1.0", surfaces: { form: {} } };
  assert.deepEqual(Object.keys(action), ["version", "action"]);
  assertPinnedEvent(action);
  assertPinnedEvent(withOptional);
  assert.equal(validatePinnedRendererDataModel(dataModel), true, formatAjvErrors(validatePinnedRendererDataModel.errors));
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";
import { createWeaverRuntime } from "../../../../runtime/index.js";
import type { JsonObject } from "../types.js";
import {
  buildA2UIClientCapabilities,
  buildA2UIValidationFailedClientMessage,
  mapA2UIValidationFailure,
} from "./index.js";

const fixture = (name: string): object => JSON.parse(readFileSync(
  new URL(`../../../../../src/protocol/a2ui/v0_9_1/outbound/fixtures/${name}.json`, import.meta.url),
  "utf8",
));
const ajv = new Ajv2020({ strict: false, validateFormats: false });
const validateCapabilities = ajv.compile(fixture("client_capabilities"));
const validateClientMessage = ajv.compile(fixture("client_to_server"));
const validateDataModel = ajv.compile(fixture("client_data_model"));

function catalog(catalogId: string): JsonObject {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    catalogId,
    components: {
      Text: {
        type: "object",
        properties: { id: { type: "string" }, component: { const: "Text" }, text: { type: "string" } },
        required: ["id", "component", "text"],
        additionalProperties: false,
      },
    },
    functions: {},
    $defs: {
      theme: {
        type: "object",
        properties: { primaryColor: { type: "string", pattern: "^#" } },
        additionalProperties: false,
      },
    },
  };
}

const create = (surfaceId = "form", theme?: unknown) => ({
  version: "v0.9.1",
  createSurface: { surfaceId, catalogId: "catalog-a", ...(theme === undefined ? {} : { theme }) },
});

function runtime() {
  const made = createWeaverRuntime({ catalogs: [{ catalogId: "catalog-a", schema: catalog("catalog-a") }] });
  assert.ok(made.ok);
  return made.value;
}

test("capability builder emits the exact ordered, defensive v0.9 file shape", () => {
  const ids = ["catalog-a", "catalog-b"];
  const capabilities = buildA2UIClientCapabilities({ supportedCatalogIds: ids });
  assert.deepEqual(capabilities, { "v0.9": { supportedCatalogIds: ids } });
  assert.equal("v0.9.1" in capabilities, false);
  assert.equal("inlineCatalogs" in capabilities["v0.9"], false);
  capabilities["v0.9"].supportedCatalogIds.push("changed");
  assert.deepEqual(ids, ["catalog-a", "catalog-b"]);
  assert.equal(validateCapabilities(buildA2UIClientCapabilities({ supportedCatalogIds: [] })), true, JSON.stringify(validateCapabilities.errors));
});

test("runtime capabilities preserve registration order, support empty runtimes, and own output", () => {
  const made = createWeaverRuntime({ catalogs: [
    { catalogId: "catalog-b", schema: catalog("catalog-b") },
    { catalogId: "catalog-a", schema: catalog("catalog-a") },
  ] });
  assert.ok(made.ok);
  const output = made.value.getClientCapabilities();
  assert.deepEqual(output, { "v0.9": { supportedCatalogIds: ["catalog-b", "catalog-a"] } });
  output["v0.9"].supportedCatalogIds.push("bad");
  assert.deepEqual(made.value.getClientCapabilities()["v0.9"].supportedCatalogIds, ["catalog-b", "catalog-a"]);
  const empty = createWeaverRuntime(); assert.ok(empty.ok);
  assert.deepEqual(empty.value.getClientCapabilities(), { "v0.9": { supportedCatalogIds: [] } });
  assert.equal(validateCapabilities(made.value.getClientCapabilities()), true, JSON.stringify(validateCapabilities.errors));
});

test("validation-error builder emits exact default and compatible wire versions", () => {
  const expectedError = { code: "VALIDATION_FAILED", surfaceId: "form", path: "/components/0/text", message: "Expected string" };
  const current = buildA2UIValidationFailedClientMessage({ surfaceId: "form", path: "/components/0/text", message: "Expected string" });
  const compatible = buildA2UIValidationFailedClientMessage({ surfaceId: "form", path: "/components/0/text", message: "Expected string", version: "v0.9" });
  assert.deepEqual(current, { version: "v0.9.1", error: expectedError });
  assert.deepEqual(compatible, { version: "v0.9", error: expectedError });
  assert.equal(validateClientMessage(current), true, JSON.stringify(validateClientMessage.errors));
  assert.equal(validateClientMessage(compatible), true, JSON.stringify(validateClientMessage.errors));
  assert.throws(() => buildA2UIValidationFailedClientMessage({ surfaceId: "", path: "/", message: "bad" }), TypeError);
});

test("maps protocol issues deterministically, extracts identity, supports fallback, and owns output", () => {
  const rt = runtime();
  const malformed = { version: "bad", updateComponents: { surfaceId: "form", components: "bad", extra: true } };
  const result = rt.process(malformed);
  const mapped = mapA2UIValidationFailure({ result, input: malformed });
  assert.ok(mapped.ok);
  assert.equal(mapped.value.error.path, "/version");
  assert.equal(mapped.value.error.message, "Expected v0.9 or v0.9.1");
  mapped.value.error.message = "changed";
  assert.equal(!result.ok && result.error.code === "PROTOCOL_VALIDATION_FAILED" && result.error.issues[0]?.message, "Expected v0.9 or v0.9.1");

  const missing = { version: "bad" };
  assert.deepEqual(mapA2UIValidationFailure({ result: rt.process(missing), input: missing }), { ok: false, error: { code: "VALIDATION_ERROR_SURFACE_ID_REQUIRED" } });
  const fallback = mapA2UIValidationFailure({ result: rt.process(missing), input: missing, surfaceId: "trusted-route" });
  assert.ok(fallback.ok);
  assert.equal(fallback.value.error.surfaceId, "trusted-route");
  assert.equal(validateClientMessage(fallback.value), true, JSON.stringify(validateClientMessage.errors));
});

test("maps component, component-allowlist, and theme validation with normalized paths", () => {
  const rt = runtime();
  assert.ok(rt.process(create()).ok);
  const cases = [
    { input: { version: "v0.9.1", updateComponents: { surfaceId: "form", components: [{ id: "root", component: "Text", text: 4 }] } }, pathIncludes: "/updateComponents/components/0/text" },
    { input: { version: "v0.9.1", updateComponents: { surfaceId: "form", components: [{ id: "root", component: "Unknown" }] } }, pathIncludes: "/updateComponents/components/0" },
  ];
  for (const entry of cases) {
    const mapped = mapA2UIValidationFailure({ result: rt.process(entry.input), input: entry.input });
    assert.ok(mapped.ok);
    assert.equal(mapped.value.error.code, "VALIDATION_FAILED");
    assert.equal(mapped.value.error.path, entry.pathIncludes);
    assert.equal(Object.keys(mapped.value.error).sort().join(","), "code,message,path,surfaceId");
  }

  const themed = runtime();
  const badTheme = create("theme-surface", { primaryColor: "red" });
  const mappedTheme = mapA2UIValidationFailure({ result: themed.process(badTheme), input: badTheme });
  assert.ok(mappedTheme.ok);
  assert.equal(mappedTheme.value.error.path, "/createSurface/theme/primaryColor");
});

test("does not classify lifecycle errors as validation failures", () => {
  const rt = runtime();
  const input = { version: "v0.9.1", updateComponents: { surfaceId: "missing", components: [{ id: "root", component: "Text", text: "ok" }] } };
  assert.deepEqual(mapA2UIValidationFailure({ result: rt.process(input), input }), { ok: false, error: { code: "NOT_A_VALIDATION_FAILURE" } });
});

test("existing action and client-data-model shapes remain official-schema valid", () => {
  const action = { version: "v0.9.1", action: { name: "submit", surfaceId: "form", sourceComponentId: "button", timestamp: "2025-01-02T03:04:05.000Z", context: {} } };
  const dataModel = { version: "v0.9.1", surfaces: { form: {} } };
  assert.deepEqual(Object.keys(action), ["version", "action"]);
  assert.deepEqual(Object.keys(dataModel), ["version", "surfaces"]);
  assert.equal(validateClientMessage(action), true, JSON.stringify(validateClientMessage.errors));
  assert.equal(validateDataModel(dataModel), true, JSON.stringify(validateDataModel.errors));
});

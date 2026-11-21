import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createWeaverRuntime } from "../../../../runtime/index.js";
import type { JsonObject } from "../types.js";
import { formatAjvErrors, validatePinnedAgentMessage } from "../pinnedSchemas.test-helper.js";

const catalogFixture = JSON.parse(readFileSync(
  new URL("../../../../../src/protocol/a2ui/v1_0/inbound/fixtures/catalog.json", import.meta.url),
  "utf8",
)) as JsonObject;
const CATALOG_ID = String(catalogFixture.catalogId);

/**
 * A minimal catalog for the Basic components used below. Its $refs resolve to the
 * built-in common_types.json, which is pinned upstream and not embedded here.
 */
function weaverCatalog(): JsonObject {
  const ref = (name: string): JsonObject => ({ $ref: `common_types.json#/$defs/${name}` });
  const component = (name: string, properties: JsonObject): JsonObject => ({
    type: "object",
    properties: { component: { const: name }, ...properties },
    required: ["component"],
    additionalProperties: false,
  });
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    protocolVersion: "1.0",
    catalogId: CATALOG_ID,
    components: {
      Text: component("Text", { text: ref("DynamicString") }),
      Row: component("Row", { children: ref("ChildList") }),
      TextField: component("TextField", { label: ref("DynamicString"), value: ref("DynamicString") }),
      Button: component("Button", { child: ref("ComponentId"), action: ref("Action") }),
    },
    functions: {},
    $defs: {
      anyComponent: { type: "object" },
      anyFunction: { type: "object" },
    },
  };
}

function runtime() {
  const made = createWeaverRuntime({ catalogs: [{ catalogId: CATALOG_ID, schema: weaverCatalog() }] });
  assert.ok(made.ok, made.ok ? undefined : JSON.stringify(made.error));
  return made.value;
}

const create = {
  version: "1.0",
  createSurface: { surfaceId: "gate", catalogId: CATALOG_ID, sendDataModel: true },
};

const updateComponents = {
  version: "1.0",
  updateComponents: {
    surfaceId: "gate",
    components: [
      { id: "root", component: "Row", children: ["title", "field", "submit"] },
      { id: "title", component: "Text", text: "Conformance" },
      { id: "field", component: "TextField", label: "Name", value: { "@path": "/name" } },
      { id: "button_label", component: "Text", text: "Submit" },
      {
        id: "submit",
        component: "Button",
        child: "button_label",
        action: { event: { name: "submit", context: { name: { "@path": "/name" } } } },
      },
    ],
  },
};

function assertPinned(message: unknown): void {
  assert.equal(validatePinnedAgentMessage(message), true, formatAjvErrors(validatePinnedAgentMessage.errors));
}

test("official createSurface and representative Basic updateComponents pass both gates", () => {
  const rt = runtime();
  for (const message of [create, updateComponents]) {
    assertPinned(message);
    assert.ok(rt.process(message).ok);
  }
  const resolved = rt.resolveSurface("gate");
  assert.ok(resolved.ok);
  assert.equal(resolved.value.tree.ready, true);
});

test("official root, path, and null data updates pass both gates and null deletes the key", () => {
  const rt = runtime();
  assert.ok(rt.process(create).ok);
  const updates = [
    { version: "1.0", updateDataModel: { surfaceId: "gate", value: { name: "Ada", nullable: "before" } } },
    { version: "1.0", updateDataModel: { surfaceId: "gate", path: "/nullable", value: null } },
    { version: "1.0", updateDataModel: { surfaceId: "gate", path: "/nested/value", value: 4 } },
  ];
  for (const message of updates) {
    assertPinned(message);
    assert.ok(rt.process(message).ok);
  }
  assert.deepEqual(rt.getSurface("gate")?.dataModel, { name: "Ada", nested: { value: 4 } });
});

test("deleteSurface passes both gates", () => {
  const rt = runtime();
  assert.ok(rt.process(create).ok);
  const remove = { version: "1.0", deleteSurface: { surfaceId: "gate" } };
  assertPinned(remove);
  assert.ok(rt.process(remove).ok);
  assert.equal(rt.getSurface("gate"), undefined);
});

test("v0.9 and v0.9.1 messages are rejected by the pinned schema and by the runtime", () => {
  for (const version of ["v0.9", "v0.9.1"]) {
    const message = { ...create, version };
    assert.equal(validatePinnedAgentMessage(message), false, `pinned schema must reject ${version}`);
    assert.equal(runtime().process(message).ok, false, `runtime must reject ${version}`);
  }
});

test("theme on createSurface is rejected by the pinned schema and by the runtime", () => {
  const message = { version: "1.0", createSurface: { surfaceId: "gate", catalogId: CATALOG_ID, theme: { primaryColor: "#123456" } } };
  assert.equal(validatePinnedAgentMessage(message), false);
  assert.equal(runtime().process(message).ok, false);
});

test("a missing updateDataModel value is rejected by the pinned schema and by the runtime", () => {
  const rt = runtime();
  assert.ok(rt.process(create).ok);
  const message = { version: "1.0", updateDataModel: { surfaceId: "gate", path: "/name" } };
  assert.equal(validatePinnedAgentMessage(message), false);
  assert.equal(rt.process(message).ok, false);
});

test("official and Weaver validators both reject multiple discriminators", () => {
  const invalid = { version: "1.0", createSurface: create.createSurface, deleteSurface: { surfaceId: "gate" } };
  assert.equal(validatePinnedAgentMessage(invalid), false);
  assert.equal(runtime().process(invalid).ok, false);
});

test("catalog-aware Weaver validation rejects an invalid Basic property", () => {
  const invalid = { version: "1.0", updateComponents: { surfaceId: "gate", components: [{ id: "root", component: "Text", text: 42 }] } };
  const rt = runtime();
  assert.ok(rt.process(create).ok);
  assert.equal(rt.process(invalid).ok, false);
});

test("a callRendererFunction message is valid A2UI but reports UNSUPPORTED_FEATURE at runtime", () => {
  const rt = runtime();
  const message = {
    version: "1.0",
    callRendererFunction: {
      functionCallId: "call-1",
      callFunction: { "@call": "formatDate", catalogId: CATALOG_ID, args: { value: "2026-01-01T00:00:00Z", format: "yyyy" } },
    },
  };
  assertPinned(message);
  const result = rt.process(message);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error.code, "UNSUPPORTED_FEATURE");
});

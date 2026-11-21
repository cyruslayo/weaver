import assert from "node:assert/strict";
import test from "node:test";
import {
  createBasicCatalogV10Registration,
  createWeaverRuntime,
  validateA2UIAgentMessage,
} from "../../../index.js";
import { createA2UIV10Producer } from "./producer.js";
import { formatAjvErrors, validatePinnedAgentMessage } from "./pinnedSchemas.test-helper.js";

const producer = createA2UIV10Producer();
const CATALOG_ID = "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json";

function basicRuntime() {
  const created = createWeaverRuntime({ catalogs: [createBasicCatalogV10Registration()] });
  assert.ok(created.ok, created.ok ? undefined : JSON.stringify(created.error));
  return created.value;
}

function assertPinned(message: unknown): void {
  assert.equal(validatePinnedAgentMessage(message), true, formatAjvErrors(validatePinnedAgentMessage.errors));
}

test("produces exact v1.0 lifecycle wire shapes that match the pinned schema", () => {
  const components = [{ id: "root", component: "Text", text: "Hello" }];
  const created = producer.createSurface({ surfaceId: "main", catalogId: CATALOG_ID, sendDataModel: false });
  assert.deepEqual(created, {
    version: "1.0",
    createSurface: { surfaceId: "main", catalogId: CATALOG_ID, sendDataModel: false },
  });
  assertPinned(created);

  const updated = producer.updateComponents({ surfaceId: "main", components });
  assert.deepEqual(updated, { version: "1.0", updateComponents: { surfaceId: "main", components } });
  assertPinned(updated);

  const data = producer.updateDataModel({ surfaceId: "main", path: "/name", value: "Ada" });
  assert.deepEqual(data, { version: "1.0", updateDataModel: { surfaceId: "main", path: "/name", value: "Ada" } });
  assertPinned(data);

  const deleted = producer.deleteSurface({ surfaceId: "main" });
  assert.deepEqual(deleted, { version: "1.0", deleteSurface: { surfaceId: "main" } });
  assertPinned(deleted);
});

test("createSurface can carry components, a data model, and metadata inline", () => {
  const message = producer.createSurface({
    surfaceId: "main",
    catalogId: CATALOG_ID,
    components: [{ id: "root", component: "Text", text: "Hello" }],
    dataModel: { title: "Hello" },
    metadata: { extensions: { vendor_x: true } },
  });
  assert.deepEqual(message.createSurface.dataModel, { title: "Hello" });
  assert.deepEqual(message.createSurface.metadata, { extensions: { vendor_x: true } });
  assertPinned(message);
});

test("createSurface omits catalogId when it is not supplied", () => {
  const message = producer.createSurface({ surfaceId: "main" });
  assert.deepEqual(message, { version: "1.0", createSurface: { surfaceId: "main" } });
  assertPinned(message);
});

test("updateDataModel keeps an explicit null value as the deletion sentinel", () => {
  const message = producer.updateDataModel({ surfaceId: "main", path: "/name", value: null });
  assert.deepEqual(message.updateDataModel, { surfaceId: "main", path: "/name", value: null });
  assert.equal("value" in message.updateDataModel, true);
  assertPinned(message);
});

test("updateDataModel rejects a missing value at runtime", () => {
  const input = { surfaceId: "main", path: "/name" } as unknown as Parameters<typeof producer.updateDataModel>[0];
  assert.throws(() => producer.updateDataModel(input), TypeError);
});

test("producer types reject theme and a missing updateDataModel value at compile time", () => {
  // Compile-time only: these calls are never executed, so the runtime is not exercised.
  const compileOnly = () => {
    // @ts-expect-error theme is not part of A2UI v1.0 createSurface
    producer.createSurface({ surfaceId: "main", catalogId: CATALOG_ID, theme: { primaryColor: "#123456" } });
    // @ts-expect-error updateDataModel requires value
    producer.updateDataModel({ surfaceId: "main", path: "/name" });
  };
  assert.equal(typeof compileOnly, "function");
});

test("producer refuses identifiers that the protocol rejects", () => {
  assert.throws(
    () => producer.updateComponents({ surfaceId: "main", components: [{ id: "user-card", component: "Text" }] }),
    TypeError,
  );
  assert.throws(
    () => producer.updateComponents({ surfaceId: "main", components: [{ id: "1st_item", component: "Text" }] }),
    TypeError,
  );
  assert.throws(
    () => producer.updateComponents({ surfaceId: "main", components: [{ id: "root", component: "Surface" }] }),
    TypeError,
  );
});

test("producer output is owned and does not alias caller input", () => {
  const components = [{ id: "root", component: "Text", text: "Hello" }];
  const message = producer.updateComponents({ surfaceId: "main", components });
  components[0].text = "Changed";
  assert.equal(message.updateComponents.components[0]?.text, "Hello");
});

test("producer rejects non-JSON input and cycles", () => {
  assert.throws(() => producer.updateDataModel({ surfaceId: "main", value: Number.NaN }), TypeError);
  const cyclic: Record<string, unknown> = { name: "loop" };
  cyclic.self = cyclic;
  assert.throws(() => producer.updateDataModel({ surfaceId: "main", value: cyclic as never }), TypeError);
});

test("producer output is accepted by the Weaver validator and the runtime rejects theme-free createSurface without catalog", () => {
  const runtime = basicRuntime();
  const message = producer.createSurface({ surfaceId: "main" });
  assert.equal(validateA2UIAgentMessage(message).ok, true);
  const result = runtime.process(message);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error.code, "UNSUPPORTED_FEATURE");
});

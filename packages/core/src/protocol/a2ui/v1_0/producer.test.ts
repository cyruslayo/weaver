import assert from "node:assert/strict";
import test from "node:test";
import {
  A2UI_V091_BASIC_CATALOG_ID,
  createBasicCatalogV091Registration,
  createWeaverRuntime,
  validateA2UIServerMessage,
} from "../../../index.js";
import { createA2UIV091Producer } from "./producer.js";

const producer = createA2UIV091Producer();

function basicRuntime() {
  const created = createWeaverRuntime({ catalogs: [createBasicCatalogV091Registration()] });
  assert.ok(created.ok, created.ok ? undefined : JSON.stringify(created.error));
  return created.value;
}

test("produces exact v0.9.1 lifecycle wire shapes", () => {
  const theme = { primaryColor: "#123456" };
  const components = [{ id: "root", component: "Text", text: "Hello" }];
  assert.deepEqual(producer.createSurface({
    surfaceId: "main",
    catalogId: "catalog-a",
    theme,
    sendDataModel: false,
  }), {
    version: "v0.9.1",
    createSurface: {
      surfaceId: "main",
      catalogId: "catalog-a",
      theme,
      sendDataModel: false,
    },
  });
  assert.deepEqual(producer.updateComponents({ surfaceId: "main", components }), {
    version: "v0.9.1",
    updateComponents: { surfaceId: "main", components },
  });
  assert.deepEqual(producer.updateDataModel({ surfaceId: "main", path: "/name", value: "Ada" }), {
    version: "v0.9.1",
    updateDataModel: { surfaceId: "main", path: "/name", value: "Ada" },
  });
  assert.deepEqual(producer.updateDataModel({ surfaceId: "main" }), {
    version: "v0.9.1",
    updateDataModel: { surfaceId: "main" },
  });
  assert.deepEqual(producer.updateDataModel({ surfaceId: "main", value: null }), {
    version: "v0.9.1",
    updateDataModel: { surfaceId: "main", value: null },
  });
  assert.deepEqual(producer.deleteSurface({ surfaceId: "main" }), {
    version: "v0.9.1",
    deleteSurface: { surfaceId: "main" },
  });
});

test("owns nested producer input and does not mutate caller data", () => {
  const input = {
    surfaceId: "main",
    components: [{ id: "root", component: "Text", text: { value: "Hello" } }],
  };
  const message = producer.updateComponents(input);
  input.components[0].text.value = "changed";
  assert.deepEqual(message.updateComponents.components[0]?.text, { value: "Hello" });
  message.updateComponents.components[0]!.text = { value: "message-only" };
  assert.deepEqual(input.components[0].text, { value: "changed" });

  const theme = { primaryColor: "#123456" };
  const created = producer.createSurface({ surfaceId: "main", catalogId: "catalog-a", theme });
  theme.primaryColor = "changed";
  assert.deepEqual(created.createSurface.theme, { primaryColor: "#123456" });
});

test("supports independent surfaces and validates every produced protocol envelope", () => {
  const messages = [
    producer.createSurface({ surfaceId: "one", catalogId: "catalog-a" }),
    producer.createSurface({ surfaceId: "two", catalogId: "catalog-b" }),
    producer.updateComponents({ surfaceId: "one", components: [{ id: "root", component: "Text", text: "One" }] }),
    producer.updateComponents({ surfaceId: "two", components: [{ id: "root", component: "Text", text: "Two" }] }),
    producer.updateDataModel({ surfaceId: "one", value: {} }),
    producer.deleteSurface({ surfaceId: "two" }),
  ];
  for (const message of messages) assert.deepEqual(validateA2UIServerMessage(message), { ok: true, value: message });
});

test("rejects invalid runtime caller values without repairing them", () => {
  assert.throws(() => producer.createSurface(null as never), /createSurface producer input must be an object/);
  assert.throws(() => producer.updateComponents({ surfaceId: "main", components: [] }), TypeError);
  assert.throws(() => producer.updateDataModel({ surfaceId: "main", value: undefined }), TypeError);
  assert.throws(() => producer.updateComponents({
    surfaceId: "main",
    components: [{ id: "root", component: "Text", text: "ok", invalid: Number.NaN }],
  }), TypeError);
  const cyclic: { value?: unknown } = {};
  cyclic.value = cyclic;
  assert.throws(() => producer.createSurface({ surfaceId: "main", catalogId: "catalog-a", theme: cyclic as never }), TypeError);

  const protoTheme = JSON.parse('{"__proto__":{"polluted":true}}');
  const message = producer.createSurface({ surfaceId: "main", catalogId: "catalog-a", theme: protoTheme });
  assert.equal(Object.prototype.hasOwnProperty.call(message.createSurface.theme, "__proto__"), true);
  assert.deepEqual(message.createSurface.theme?.["__proto__"], { polluted: true });
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
});

test("produces canonical Basic messages accepted by a Basic-configured runtime", () => {
  const runtime = basicRuntime();
  const messages = [
    producer.createSurface({ surfaceId: "basic", catalogId: A2UI_V091_BASIC_CATALOG_ID }),
    producer.updateComponents({ surfaceId: "basic", components: [
      { id: "root", component: "Text", text: "Hello from the producer" },
    ] }),
  ];
  for (const message of messages) assert.equal(runtime.process(message).ok, true);
  const resolved = runtime.resolveSurface("basic");
  assert.equal(resolved.ok, true);
  if (resolved.ok) assert.equal(resolved.value.tree.root?.component, "Text");
});

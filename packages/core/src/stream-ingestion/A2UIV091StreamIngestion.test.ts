import assert from "node:assert/strict";
import test from "node:test";
import {
  A2UI_V091_BASIC_CATALOG_ID,
  createA2UIV091Producer,
  createBasicCatalogV091Registration,
  createWeaverRuntime,
  type A2UIServerMessage,
} from "../index.js";
import { createA2UIV091StreamIngestion, type A2UIV091StreamIngestionEvent } from "./index.js";

const producer = createA2UIV091Producer();

function basicRuntime() {
  const created = createWeaverRuntime({ catalogs: [createBasicCatalogV091Registration()] });
  assert.ok(created.ok, created.ok ? undefined : JSON.stringify(created.error));
  return created.value;
}

function frame(message: A2UIServerMessage): string {
  return `${JSON.stringify(message)}\n`;
}

function success(event: A2UIV091StreamIngestionEvent) {
  assert.equal(event.ok, true, event.ok ? undefined : JSON.stringify(event.error));
  return event.value;
}

function failure(event: A2UIV091StreamIngestionEvent, code: string) {
  assert.equal(event.ok, false);
  if (event.ok) throw new Error("expected ingestion failure");
  assert.equal(event.error.code, code);
  return event;
}

function lifecycleMessages(surfaceId = "main"): A2UIServerMessage[] {
  return [
    producer.createSurface({ surfaceId, catalogId: A2UI_V091_BASIC_CATALOG_ID }),
    producer.updateComponents({
      surfaceId,
      components: [{ id: "root", component: "Text", text: "Hello" }],
    }),
    producer.updateDataModel({ surfaceId, path: "/name", value: "Ada" }),
  ];
}

test("applies one valid frame and preserves its frame identity", () => {
  const runtime = basicRuntime();
  const ingestion = createA2UIV091StreamIngestion({ runtime });
  const events = ingestion.push(frame(lifecycleMessages("single")[0]!));
  assert.equal(events.length, 1);
  assert.equal(events[0]?.frame, 1);
  assert.equal(success(events[0]!).operation, "surfaceCreated");
  assert.ok(runtime.getSurface("single"));
});

test("applies multiple progressive frames in one push", () => {
  const runtime = basicRuntime();
  const ingestion = createA2UIV091StreamIngestion({ runtime });
  const events = ingestion.push(lifecycleMessages("many").map(frame).join(""));
  assert.deepEqual(events.map((event) => event.ok ? event.value.operation : event.error.code), [
    "surfaceCreated",
    "componentsUpdated",
    "dataModelUpdated",
  ]);
  assert.deepEqual(runtime.getSurface("many")?.dataModel, { name: "Ada" });
});

test("buffers arbitrary chunk boundaries and composes Task60 producer output", () => {
  const runtime = basicRuntime();
  const ingestion = createA2UIV091StreamIngestion({ runtime });
  const serialized = lifecycleMessages("split").map(frame).join("");
  const events: A2UIV091StreamIngestionEvent[] = [];
  for (let offset = 0; offset < serialized.length; offset += 3) {
    events.push(...ingestion.push(serialized.slice(offset, offset + 3)));
  }
  assert.deepEqual(events.map((event) => event.ok ? event.value.operation : event.error.code), [
    "surfaceCreated",
    "componentsUpdated",
    "dataModelUpdated",
  ]);
  const surface = runtime.getSurface("split");
  assert.deepEqual(surface?.dataModel, { name: "Ada" });
  assert.equal(surface?.components.root?.text, "Hello");
});

test("supports CRLF framing and multiple inconvenient boundaries", () => {
  const runtime = basicRuntime();
  const ingestion = createA2UIV091StreamIngestion({ runtime });
  const serialized = lifecycleMessages("crlf").map((message) => `${JSON.stringify(message)}\r\n`).join("");
  const events = ingestion.push(serialized.slice(0, 17));
  events.push(...ingestion.push(serialized.slice(17)));
  assert.equal(events.length, 3);
  assert.ok(events.every((event) => event.ok));
  assert.ok(runtime.getSurface("crlf"));
});

test("reports malformed JSON and recovers for a later valid frame", () => {
  const runtime = basicRuntime();
  const ingestion = createA2UIV091StreamIngestion({ runtime });
  const events = ingestion.push(`{"version":"v0.9.1",}\n${frame(lifecycleMessages("recover")[0]!)}`);
  assert.equal(failure(events[0]!, "INVALID_JSON").frame, 1);
  assert.equal(success(events[1]!).operation, "surfaceCreated");
  assert.ok(runtime.getSurface("recover"));
});

test("rejects Markdown fences and trailing commas without repair", () => {
  const runtime = basicRuntime();
  const ingestion = createA2UIV091StreamIngestion({ runtime });
  const create = frame(lifecycleMessages("fenced")[0]!);
  const fenced = `\`\`\`json\n${create}\`\`\`\n`;
  const fencedEvents = ingestion.push(fenced);
  assert.equal(failure(fencedEvents[0]!, "INVALID_JSON").frame, 1);
  assert.equal(success(fencedEvents[1]!).operation, "surfaceCreated");
  assert.equal(failure(fencedEvents[2]!, "INVALID_JSON").frame, 3);

  const trailingRuntime = basicRuntime();
  const trailing = createA2UIV091StreamIngestion({ runtime: trailingRuntime });
  const trailingEvents = trailing.push('{"version":"v0.9.1","createSurface":{},}\n');
  failure(trailingEvents[0]!, "INVALID_JSON");
  assert.equal(trailingRuntime.getSurface("fenced"), undefined);
});

test("uses the configured decoder frame limit and recovers after an oversized frame", () => {
  const runtime = basicRuntime();
  const ingestion = createA2UIV091StreamIngestion({ runtime, maxFrameCharacters: 200 });
  const events = ingestion.push(`${"x".repeat(201)}\n${frame(lifecycleMessages("after-large")[0]!)}`);
  const oversized = failure(events[0]!, "FRAME_TOO_LARGE");
  assert.equal(oversized.frame, 1);
  assert.equal(success(events[1]!).operation, "surfaceCreated");
  if (!oversized.ok && oversized.error.code === "FRAME_TOO_LARGE") {
    assert.equal(oversized.error.maxFrameCharacters, 200);
  }
});

test("distinguishes protocol, catalog, and runtime lifecycle failures", () => {
  const runtime = basicRuntime();
  const ingestion = createA2UIV091StreamIngestion({ runtime });
  const protocol = ingestion.push('{"version":"v0.9.1","unknown":{}}\n')[0]!;
  failure(protocol, "PROTOCOL_VALIDATION_FAILED");

  const catalog = ingestion.push(frame({
    version: "v0.9.1",
    createSurface: { surfaceId: "untrusted-catalog", catalogId: "missing" },
  }))[0]!;
  failure(catalog, "CATALOG_REGISTRY_ERROR");

  const lifecycle = ingestion.push(frame({
    version: "v0.9.1",
    updateComponents: { surfaceId: "missing-surface", components: [{ id: "root", component: "Text", text: "x" }] },
  }))[0]!;
  failure(lifecycle, "SURFACE_STORE_ERROR");
});

test("rejects invalid Basic components without mutating the active surface", () => {
  const runtime = basicRuntime();
  const ingestion = createA2UIV091StreamIngestion({ runtime });
  assert.equal(success(ingestion.push(frame(lifecycleMessages("catalog")[0]!))[0]!).operation, "surfaceCreated");
  const before = runtime.getSurface("catalog");
  const invalid = ingestion.push(frame({
    version: "v0.9.1",
    updateComponents: { surfaceId: "catalog", components: [{ id: "bad", component: "Text", text: 42 as never }] },
  }))[0]!;
  failure(invalid, "CATALOG_REGISTRY_ERROR");
  assert.deepEqual(runtime.getSurface("catalog"), before);
});

test("finish processes a valid unterminated frame and reports an invalid final frame", () => {
  const validRuntime = basicRuntime();
  const valid = createA2UIV091StreamIngestion({ runtime: validRuntime });
  assert.deepEqual(valid.push(JSON.stringify(lifecycleMessages("final")[0]!)), []);
  const finalEvent = valid.finish()[0]!;
  assert.equal(finalEvent.frame, 1);
  assert.equal(success(finalEvent).operation, "surfaceCreated");

  const invalidRuntime = basicRuntime();
  const invalid = createA2UIV091StreamIngestion({ runtime: invalidRuntime });
  invalid.push('{"version":"v0.9.1",');
  const invalidEvent = invalid.finish()[0]!;
  failure(invalidEvent, "INVALID_JSON");
  assert.equal(invalidRuntime.getSurface("final"), undefined);
});

test("reset clears decoder state without changing runtime state", () => {
  const runtime = basicRuntime();
  const ingestion = createA2UIV091StreamIngestion({ runtime });
  ingestion.push('{"version":"v0.9.1","createSurface":');
  ingestion.reset();
  assert.deepEqual(ingestion.finish(), []);
  assert.equal(runtime.getSurface("reset"), undefined);

  const event = ingestion.push(frame(lifecycleMessages("reset")[0]!))[0]!;
  assert.equal(event.frame, 1);
  assert.equal(success(event).operation, "surfaceCreated");
  ingestion.reset();
  assert.ok(runtime.getSurface("reset"));
});

test("independent ingestion instances do not share framing state", () => {
  const firstRuntime = basicRuntime();
  const secondRuntime = basicRuntime();
  const first = createA2UIV091StreamIngestion({ runtime: firstRuntime });
  const second = createA2UIV091StreamIngestion({ runtime: secondRuntime });
  first.push('{"version":"v0.9.1","createSurface":');
  const secondEvent = second.push(frame(lifecycleMessages("second")[0]!))[0]!;
  assert.equal(secondEvent.frame, 1);
  assert.equal(success(secondEvent).operation, "surfaceCreated");
  assert.equal(first.finish().length, 1);
  assert.equal(firstRuntime.getSurface("second"), undefined);
  assert.ok(secondRuntime.getSurface("second"));
});

test("snapshots the supplied runtime reference at creation", () => {
  const originalRuntime = basicRuntime();
  const replacementRuntime = basicRuntime();
  const config = { runtime: originalRuntime };
  const ingestion = createA2UIV091StreamIngestion(config);
  config.runtime = replacementRuntime;

  const event = ingestion.push(frame(lifecycleMessages("snapshotted")[0]!))[0]!;
  assert.equal(success(event).operation, "surfaceCreated");
  assert.ok(originalRuntime.getSurface("snapshotted"));
  assert.equal(replacementRuntime.getSurface("snapshotted"), undefined);
});

test("malformed and protocol-invalid frames never mutate runtime state", () => {
  const runtime = basicRuntime();
  const ingestion = createA2UIV091StreamIngestion({ runtime });
  const events = ingestion.push('{"version":"v0.9.1",}\n{"version":"v0.9.1","bad":true}\n');
  assert.deepEqual(events.map((event) => event.ok ? event.value.operation : event.error.code), [
    "INVALID_JSON",
    "PROTOCOL_VALIDATION_FAILED",
  ]);
  assert.deepEqual(runtime.getSurface("main"), undefined);
});

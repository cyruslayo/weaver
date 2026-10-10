import assert from "node:assert/strict";
import { test } from "node:test";
import {
  A2UI_V091_BASIC_CATALOG_ID,
  createA2UIV091Producer,
  createBasicCatalogV091Registration,
  createA2UIV091StreamIngestion,
  createWeaverRuntime,
  type A2UIV091StreamIngestionEvent,
  type WeaverRuntime,
  type WeaverRuntimeEvent,
} from "../index.js";
import { createWeaverTraceRecorder } from "./createWeaverTraceRecorder.js";
import { parseWeaverTrace } from "./parseWeaverTrace.js";
import type { WeaverTraceRecorder } from "./types.js";

const producer = createA2UIV091Producer();
const frame = (message: unknown): string => `${JSON.stringify(message)}\n`;

function steppingClock(): () => Date {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 9, 10, 0, 0, tick++));
}

function basicRuntime(observer?: (event: WeaverRuntimeEvent) => void): WeaverRuntime {
  const created = createWeaverRuntime({
    catalogs: [createBasicCatalogV091Registration()],
    observer,
  });
  assert.ok(created.ok, created.ok ? undefined : JSON.stringify(created.error));
  return created.value;
}

/**
 * Runs a session through ingestion and the runtime, one chunk at a time, and
 * records each chunk right after it is pushed. Returns the recorder and runtime.
 */
function mixedSession(options: { now?: () => Date; maxEntries?: number } = {}) {
  const recorder = createWeaverTraceRecorder({ now: options.now, maxEntries: options.maxEntries });
  const runtime = basicRuntime(recorder.observer);
  const ingestion = createA2UIV091StreamIngestion({ runtime });

  const push = (chunk: string) => {
    const events: A2UIV091StreamIngestionEvent[] = ingestion.push(chunk);
    recorder.recordIngestion(events, chunk);
    return events;
  };

  // 1. A valid frame: createSurface.
  push(frame(producer.createSurface({ surfaceId: "main", catalogId: A2UI_V091_BASIC_CATALOG_ID })));
  // 2. One malformed JSONL frame. It never reaches the runtime.
  push('{"version":"v0.9.1",}\n');
  // 3. One catalog-invalid message: Text.text must be a string.
  push(frame({
    version: "v0.9.1",
    updateComponents: { surfaceId: "main", components: [{ id: "root", component: "Text", text: 42 }] },
  }));
  // 4. A valid components update with a bindable field and a button.
  push(frame(producer.updateComponents({
    surfaceId: "main",
    components: [
      { id: "root", component: "Column", children: ["name", "submit"] },
      { id: "name", component: "TextField", value: { path: "/name" }, label: "Name" },
      { id: "submit", component: "Button", child: "label", action: { event: { name: "submit", context: {} } } },
      { id: "label", component: "Text", text: "Submit" },
    ],
  })));
  // 5. A valid data model update.
  push(frame(producer.updateDataModel({ surfaceId: "main", path: "/name", value: "Ada" })));
  // 6. One input, written directly on the runtime.
  const input = runtime.writeInput({
    surfaceId: "main",
    sourceComponentId: "name",
    scopePath: "/",
    property: "value",
    value: "Grace",
  });
  assert.equal(input.ok, true);
  // 7. One action.
  const action = runtime.dispatchAction({
    surfaceId: "main",
    sourceComponentId: "submit",
    scopePath: "/",
    actionProperty: "action",
  });
  assert.equal(action.ok, true);

  return { recorder, runtime };
}

test("a mixed session is recorded in order with the correct kinds", () => {
  const { recorder } = mixedSession({ now: steppingClock() });
  const { entries, truncated } = recorder.getTrace();

  assert.equal(truncated, false);
  assert.deepEqual(entries.map((entry) => entry.kind), [
    "message",
    "frame-error",
    "message",
    "message",
    "message",
    "input",
    "action",
  ]);
  assert.deepEqual(entries.map((entry) => entry.seq), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(entries.map((entry) => entry.at), [
    "2026-10-10T00:00:00.000Z",
    "2026-10-10T00:00:01.000Z",
    "2026-10-10T00:00:02.000Z",
    "2026-10-10T00:00:03.000Z",
    "2026-10-10T00:00:04.000Z",
    "2026-10-10T00:00:05.000Z",
    "2026-10-10T00:00:06.000Z",
  ]);
});

test("runtime results are recorded with their outcomes, and valid stream frames are not counted twice", () => {
  const { recorder } = mixedSession();
  const [created, malformed, invalid, components, data, input, action] = recorder.getTrace().entries;

  assert.deepEqual(created?.outcome, { ok: true, summary: { operation: "surfaceCreated", surfaceId: "main" } });
  assert.equal(created?.input && typeof created.input === "object" && "createSurface" in created.input, true);

  assert.equal(malformed?.outcome.ok, false);
  assert.deepEqual(malformed?.outcome.ok === false && malformed.outcome.error, { code: "INVALID_JSON", frame: 2 });

  assert.equal(invalid?.outcome.ok, false);
  assert.equal(invalid?.outcome.ok === false && (invalid.outcome.error as { code: string }).code, "CATALOG_REGISTRY_ERROR");
  assert.deepEqual(invalid?.input, {
    version: "v0.9.1",
    updateComponents: { surfaceId: "main", components: [{ id: "root", component: "Text", text: 42 }] },
  });

  assert.deepEqual(components?.outcome, { ok: true, summary: { operation: "componentsUpdated", surfaceId: "main" } });
  assert.deepEqual(data?.outcome, { ok: true, summary: { operation: "dataModelUpdated", surfaceId: "main" } });
  assert.deepEqual(input?.input, {
    surfaceId: "main",
    sourceComponentId: "name",
    scopePath: "/",
    property: "value",
    value: "Grace",
  });
  assert.deepEqual(input?.outcome, {
    ok: true,
    summary: { surfaceId: "main", sourceComponentId: "name", property: "value", path: "/name" },
  });
  assert.equal(action?.outcome.ok, true);
  assert.equal(action?.outcome.ok === true && (action.outcome.summary as { kind: string }).kind, "serverEvent");
  assert.deepEqual(action?.input, {
    surfaceId: "main",
    sourceComponentId: "submit",
    scopePath: "/",
    actionProperty: "action",
  });

  // Four runtime messages were processed, so exactly four message entries exist.
  assert.equal(recorder.getTrace().entries.filter((entry) => entry.kind === "message").length, 4);
});

test("a frame-error entry carries the pushed chunk, and no input key when no chunk is given", () => {
  const recorder = createWeaverTraceRecorder();
  const runtime = basicRuntime(recorder.observer);
  const ingestion = createA2UIV091StreamIngestion({ runtime });
  const chunk = "not json\n";
  recorder.recordIngestion(ingestion.push(chunk), chunk);
  recorder.recordIngestion(ingestion.push("still not json\n"));

  const [withChunk, withoutChunk] = recorder.getTrace().entries;
  assert.equal(withChunk?.input, chunk);
  assert.equal(withoutChunk?.kind, "frame-error");
  assert.equal("input" in (withoutChunk ?? {}), false);
});

test("recordIngestion records only JSONL decode failures, never runtime results", () => {
  const recorder = createWeaverTraceRecorder();
  const events: A2UIV091StreamIngestionEvent[] = [
    { ok: false, frame: 1, error: { code: "PROTOCOL_VALIDATION_FAILED", issues: [] } },
    { ok: false, frame: 2, error: { code: "FRAME_TOO_LARGE", frame: 2, maxFrameCharacters: 10 } },
    {
      ok: true,
      frame: 3,
      value: {
        operation: "surfaceDeleted",
        surfaceId: "gone",
      },
    },
  ];
  recorder.recordIngestion(events, "chunk");

  const { entries } = recorder.getTrace();
  assert.deepEqual(entries.map((entry) => entry.kind), ["frame-error"]);
  assert.deepEqual(entries[0]?.outcome, {
    ok: false,
    error: { code: "FRAME_TOO_LARGE", frame: 2, maxFrameCharacters: 10 },
  });
});

test("getTrace is a JSON round trip that parseWeaverTrace accepts", () => {
  const { recorder } = mixedSession();
  const trace = recorder.getTrace();

  const roundTripped = JSON.parse(JSON.stringify(trace));
  assert.deepEqual(roundTripped, trace);

  const parsed = parseWeaverTrace(roundTripped);
  assert.equal(parsed.ok, true, parsed.ok ? undefined : JSON.stringify(parsed.error));
  if (parsed.ok) assert.deepEqual(parsed.value, trace);
});

test("getTrace returns a defensive copy, and later host mutations do not change recorded entries", () => {
  const recorder = createWeaverTraceRecorder();
  const runtime = basicRuntime(recorder.observer);
  const value = producer.createSurface({ surfaceId: "copy", catalogId: A2UI_V091_BASIC_CATALOG_ID });
  runtime.process(value);
  (value as unknown as { createSurface: { surfaceId: string } }).createSurface.surfaceId = "mutated";

  const snapshot = JSON.parse(JSON.stringify(recorder.getTrace()));
  const copy = recorder.getTrace();
  copy.entries.length = 0;
  copy.entries.push({ seq: 99, at: "2000-01-01T00:00:00.000Z", kind: "message", outcome: { ok: true, summary: null } });
  assert.deepEqual(recorder.getTrace(), snapshot);
  assert.equal(snapshot.entries[0].input.createSurface.surfaceId, "copy");
});

test("values that cannot be serialized are recorded as a marker instead of throwing", () => {
  const recorder = createWeaverTraceRecorder();
  const runtime = basicRuntime(recorder.observer);
  const cyclic: Record<string, unknown> = { version: "bad" };
  cyclic.self = cyclic;
  assert.equal(runtime.process(cyclic).ok, false);

  const trace = recorder.getTrace();
  assert.equal(trace.entries.length, 1);
  assert.equal(parseWeaverTrace(trace).ok, true);
});

test("the bound keeps the newest entries, sets truncated, and leaves seq gaps visible", () => {
  const recorder = createWeaverTraceRecorder({ maxEntries: 3, now: steppingClock() });
  for (let index = 0; index < 5; index += 1) recorder.observer(failedMessage(index));

  const trace = recorder.getTrace();
  assert.equal(trace.truncated, true);
  assert.deepEqual(trace.entries.map((entry) => entry.seq), [3, 4, 5]);
  assert.deepEqual(trace.entries.map((entry) => entry.input), [{ n: 2 }, { n: 3 }, { n: 4 }]);
  assert.equal(parseWeaverTrace(trace).ok, true);
});

test("the default bound is 5000 entries", () => {
  const recorder = createWeaverTraceRecorder();
  for (let index = 0; index < 5001; index += 1) recorder.observer(failedMessage(index));

  const trace = recorder.getTrace();
  assert.equal(trace.truncated, true);
  assert.equal(trace.entries.length, 5000);
  assert.equal(trace.entries[0]?.seq, 2);
  assert.equal(trace.entries[4999]?.seq, 5001);
});

test("maxEntries must be a positive safe integer", () => {
  for (const maxEntries of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createWeaverTraceRecorder({ maxEntries }), RangeError, `maxEntries ${maxEntries}`);
  }
  assert.doesNotThrow(() => createWeaverTraceRecorder({ maxEntries: 1 }));
});

test("clear empties the trace, clears truncated, and restarts seq at 1", () => {
  const recorder = createWeaverTraceRecorder({ maxEntries: 2 });
  for (let index = 0; index < 3; index += 1) recorder.observer(failedMessage(index));
  assert.equal(recorder.getTrace().truncated, true);

  recorder.clear();
  assert.deepEqual(recorder.getTrace(), { format: "weaver-trace", version: 1, truncated: false, entries: [] });

  recorder.observer(failedMessage(9));
  assert.deepEqual(recorder.getTrace().entries.map((entry) => entry.seq), [1]);
});

test("the recorder object exposes exactly the documented surface", () => {
  const recorder: WeaverTraceRecorder = createWeaverTraceRecorder();
  assert.deepEqual(Object.keys(recorder).sort(), ["clear", "getTrace", "observer", "recordIngestion"]);
  assert.equal(typeof recorder.observer, "function");
});

function failedMessage(index: number): WeaverRuntimeEvent {
  return {
    kind: "message",
    input: { n: index },
    result: { ok: false, error: { code: "PROTOCOL_VALIDATION_FAILED", issues: [] } },
  };
}

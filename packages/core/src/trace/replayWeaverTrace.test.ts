import assert from "node:assert/strict";
import { test } from "node:test";
import {
  A2UI_V091_BASIC_CATALOG_ID,
  createA2UIV091Producer,
  createBasicCatalogV091Registration,
  createA2UIV091StreamIngestion,
  createWeaverRuntime,
  type A2UIV091StreamIngestionEvent,
  type FunctionRegistration,
  type WeaverRuntime,
  type WeaverRuntimeObserver,
} from "../index.js";
import { createWeaverTraceRecorder } from "./createWeaverTraceRecorder.js";
import { parseWeaverTrace } from "./parseWeaverTrace.js";
import {
  replayWeaverTrace,
  WEAVER_TRACE_REPLAY_INVALID_INPUT,
} from "./replayWeaverTrace.js";
import type { WeaverTrace } from "./types.js";
import { WEAVER_TRACE_FORMAT, WEAVER_TRACE_VERSION } from "./types.js";

const producer = createA2UIV091Producer();
const frame = (message: unknown): string => `${JSON.stringify(message)}\n`;
const EXTRA_CATALOG_ID = "urn:weaver:test:extra";

function steppingClock(): () => Date {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 9, 10, 0, 0, tick++));
}

function basicCatalog() {
  return createBasicCatalogV091Registration();
}

/** A copy of the Basic catalog under another id, so one trace can use two catalogs. */
function extraCatalog() {
  const basic = basicCatalog();
  return {
    catalogId: EXTRA_CATALOG_ID,
    schema: { ...basic.schema, catalogId: EXTRA_CATALOG_ID },
  };
}

function runtimeWith(options: {
  catalogs?: ReturnType<typeof basicCatalog>[];
  functions?: FunctionRegistration[];
  observer?: WeaverRuntimeObserver;
} = {}): WeaverRuntime {
  const created = createWeaverRuntime({
    catalogs: options.catalogs ?? [basicCatalog()],
    ...(options.functions === undefined ? {} : { functions: options.functions }),
    ...(options.observer === undefined ? {} : { observer: options.observer }),
  });
  assert.ok(created.ok, created.ok ? undefined : JSON.stringify(created.error));
  return created.value;
}

/** The round trip a host would store and reload: JSON out, then validated back in. */
function storedTrace(trace: WeaverTrace): WeaverTrace {
  const parsed = parseWeaverTrace(JSON.parse(JSON.stringify(trace)));
  assert.equal(parsed.ok, true, parsed.ok ? undefined : JSON.stringify(parsed.error));
  if (!parsed.ok) throw new Error("unreachable");
  return parsed.value;
}

/**
 * The mixed session from the recorder tests: a valid surface, one malformed
 * frame, one catalog-invalid message, a components update, a data update, an
 * input and an action. Returns the recorder and the original runtime.
 */
function mixedSession() {
  const recorder = createWeaverTraceRecorder({ now: steppingClock() });
  const runtime = runtimeWith({ observer: recorder.observer });
  const ingestion = createA2UIV091StreamIngestion({ runtime });
  const push = (chunk: string) => {
    const events: A2UIV091StreamIngestionEvent[] = ingestion.push(chunk);
    recorder.recordIngestion(events, chunk);
  };

  push(frame(producer.createSurface({ surfaceId: "main", catalogId: A2UI_V091_BASIC_CATALOG_ID })));
  push('{"version":"v0.9.1",}\n');
  push(frame({
    version: "v0.9.1",
    updateComponents: { surfaceId: "main", components: [{ id: "root", component: "Text", text: 42 }] },
  }));
  push(frame(producer.updateComponents({
    surfaceId: "main",
    components: [
      { id: "root", component: "Column", children: ["name", "submit"] },
      { id: "name", component: "TextField", value: { path: "/name" }, label: "Name" },
      { id: "submit", component: "Button", child: "label", action: { event: { name: "submit", context: {} } } },
      { id: "label", component: "Text", text: "Submit" },
    ],
  })));
  push(frame(producer.updateDataModel({ surfaceId: "main", path: "/name", value: "Ada" })));
  assert.equal(runtime.writeInput({
    surfaceId: "main", sourceComponentId: "name", scopePath: "/", property: "value", value: "Grace",
  }).ok, true);
  assert.equal(runtime.dispatchAction({
    surfaceId: "main", sourceComponentId: "submit", scopePath: "/", actionProperty: "action",
  }).ok, true);

  return { recorder, runtime };
}

test("recording a mixed session and replaying it into an identical runtime has no divergence and equal surfaces", () => {
  const { recorder, runtime: original } = mixedSession();
  const trace = storedTrace(recorder.getTrace());
  const before = structuredClone(trace);

  const replay = replayWeaverTrace(trace, { runtime: runtimeWith() });

  assert.deepEqual(replay.steps.map((step) => step.kind), [
    "message", "frame-error", "message", "message", "message", "input", "action",
  ]);
  assert.deepEqual(replay.steps.map((step) => step.seq), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(replay.steps.some((step) => step.diverged), false);
  assert.deepEqual(replay.steps.map((step) => step.replayed?.ok), [
    true, undefined, false, true, true, true, true,
  ]);

  const frameError = replay.steps[1];
  assert.deepEqual(frameError?.recorded, { ok: false, code: "INVALID_JSON" });
  assert.equal(frameError?.replayed, null);
  assert.equal(frameError?.diverged, false);

  assert.deepEqual(Object.keys(replay.surfaces), ["main"]);
  assert.deepEqual(replay.surfaces.main, original.getSurface("main"));
  assert.deepEqual(trace, before, "replay must not mutate the trace");
});

test("replaying into a runtime that lacks a catalog marks only the steps that need it as diverged", () => {
  const recorder = createWeaverTraceRecorder();
  const original = runtimeWith({ catalogs: [basicCatalog(), extraCatalog()], observer: recorder.observer });
  original.process(producer.createSurface({ surfaceId: "main", catalogId: A2UI_V091_BASIC_CATALOG_ID }));
  original.process(producer.createSurface({ surfaceId: "side", catalogId: EXTRA_CATALOG_ID }));
  original.process(producer.updateComponents({
    surfaceId: "side",
    components: [{ id: "root", component: "Text", text: "side" }],
  }));
  original.process(producer.updateComponents({
    surfaceId: "main",
    components: [{ id: "root", component: "Text", text: "main" }],
  }));
  const trace = storedTrace(recorder.getTrace());
  assert.ok(trace.entries.every((entry) => entry.outcome.ok));

  const replay = replayWeaverTrace(trace, { runtime: runtimeWith() });

  assert.deepEqual(replay.steps.map((step) => step.diverged), [false, true, true, false]);
  assert.equal(replay.steps[1]?.replayed?.ok, false);
  assert.equal(typeof replay.steps[1]?.replayed?.code, "string");
  assert.deepEqual(Object.keys(replay.surfaces), ["main"]);
  assert.deepEqual(replay.surfaces.main, original.getSurface("main"));
});

test("until stops replay at the given seq, and reproduces the state after that step", () => {
  const { recorder } = mixedSession();
  const trace = storedTrace(recorder.getTrace());

  const atSeqThree = replayWeaverTrace(trace, { runtime: runtimeWith(), until: 3 });
  assert.deepEqual(atSeqThree.steps.map((step) => step.seq), [1, 2, 3]);
  // Only the createSurface message landed, so the components update was not applied.
  const createdOnly = runtimeWith();
  createdOnly.process(producer.createSurface({ surfaceId: "main", catalogId: A2UI_V091_BASIC_CATALOG_ID }));
  assert.deepEqual(atSeqThree.surfaces.main, createdOnly.getSurface("main"));
  assert.equal(atSeqThree.surfaces.main?.components["root"], undefined);

  const beforeInput = replayWeaverTrace(trace, { runtime: runtimeWith(), until: 5 });
  assert.deepEqual(beforeInput.steps.map((step) => step.seq), [1, 2, 3, 4, 5]);
  assert.equal(beforeInput.surfaces.main?.dataModel && (beforeInput.surfaces.main.dataModel as { name?: string }).name, "Ada");

  const everything = replayWeaverTrace(trace, { runtime: runtimeWith(), until: 99 });
  assert.equal(everything.steps.length, 7);

  const nothing = replayWeaverTrace(trace, { runtime: runtimeWith(), until: 0 });
  assert.deepEqual(nothing.steps, []);
  assert.deepEqual(nothing.surfaces, {});

  assert.throws(() => replayWeaverTrace(trace, { runtime: runtimeWith(), until: 1.5 }), RangeError);
});

test("replay makes no outbound calls: the recording's host callback is not invoked again", () => {
  let recordedCalls = 0;
  let replayCalls = 0;
  const openUrl = (counter: () => void): FunctionRegistration => ({
    catalogId: A2UI_V091_BASIC_CATALOG_ID,
    name: "openUrl",
    effect: "action",
    implementation: () => {
      counter();
      return undefined;
    },
  });

  const recorder = createWeaverTraceRecorder();
  const original = runtimeWith({
    functions: [openUrl(() => { recordedCalls += 1; })],
    observer: recorder.observer,
  });
  original.process(producer.createSurface({ surfaceId: "main", catalogId: A2UI_V091_BASIC_CATALOG_ID }));
  original.process(producer.updateComponents({
    surfaceId: "main",
    components: [
      { id: "root", component: "Column", children: ["open"] },
      { id: "open", component: "Button", child: "label", action: { functionCall: { call: "openUrl", args: { url: "https://example.com/" } } } },
      { id: "label", component: "Text", text: "Open" },
    ],
  }));
  assert.equal(original.dispatchAction({
    surfaceId: "main", sourceComponentId: "open", scopePath: "/", actionProperty: "action",
  }).ok, true);
  assert.equal(recordedCalls, 1, "the recording invokes the real callback once");

  const trace = storedTrace(recorder.getTrace());
  const replay = replayWeaverTrace(trace, {
    runtime: runtimeWith({ functions: [openUrl(() => { replayCalls += 1; })] }),
  });

  assert.equal(replay.steps.some((step) => step.diverged), false);
  assert.equal(recordedCalls, 1, "the recording's callback is never invoked during replay");
  assert.equal(replayCalls, 1, "the action is re-issued through the replay runtime's own mock");
});

test("frame-error entries are reported and never applied", () => {
  const recorder = createWeaverTraceRecorder();
  const runtime = runtimeWith({ observer: recorder.observer });
  const ingestion = createA2UIV091StreamIngestion({ runtime });
  const chunk = "not json\n";
  recorder.recordIngestion(ingestion.push(chunk), chunk);
  const trace = storedTrace(recorder.getTrace());

  const replayRuntime = runtimeWith();
  const replay = replayWeaverTrace(trace, { runtime: replayRuntime });

  assert.deepEqual(replay.steps.map((step) => [step.kind, step.replayed, step.diverged]), [
    ["frame-error", null, false],
  ]);
  assert.deepEqual(replay.surfaces, {});
  assert.deepEqual(replayRuntime.getSurface("main"), undefined);
});

test("a changed error code in the trace is reported as a divergence", () => {
  const { recorder } = mixedSession();
  const trace = storedTrace(recorder.getTrace());
  const invalid = trace.entries[2];
  assert.ok(invalid && invalid.outcome.ok === false);
  const tampered: WeaverTrace = structuredClone(trace);
  const tamperedEntry = tampered.entries[2];
  assert.ok(tamperedEntry && tamperedEntry.outcome.ok === false);
  (tamperedEntry.outcome.error as { code: string }).code = "SOMETHING_ELSE";

  const replay = replayWeaverTrace(tampered, { runtime: runtimeWith() });

  assert.equal(replay.steps[2]?.diverged, true);
  assert.deepEqual(replay.steps[2]?.recorded, { ok: false, code: "SOMETHING_ELSE" });
  assert.deepEqual(replay.steps[2]?.replayed, { ok: false, code: "CATALOG_REGISTRY_ERROR" });
  assert.equal(replay.steps.filter((step) => step.diverged).length, 1);
});

test("input and action entries without a valid request are reported as diverged, not thrown", () => {
  const trace: WeaverTrace = {
    format: WEAVER_TRACE_FORMAT,
    version: WEAVER_TRACE_VERSION,
    truncated: false,
    entries: [
      { seq: 1, at: "2026-10-10T00:00:00.000Z", kind: "input", outcome: { ok: true, summary: null } },
      {
        seq: 2,
        at: "2026-10-10T00:00:01.000Z",
        kind: "action",
        input: { surfaceId: "main" },
        outcome: { ok: true, summary: null },
      },
    ],
  };

  const replay = replayWeaverTrace(trace, { runtime: runtimeWith() });

  assert.deepEqual(replay.steps.map((step) => [step.diverged, step.replayed]), [
    [true, { ok: false, code: WEAVER_TRACE_REPLAY_INVALID_INPUT }],
    [true, { ok: false, code: WEAVER_TRACE_REPLAY_INVALID_INPUT }],
  ]);
  assert.deepEqual(replay.surfaces, {});
});

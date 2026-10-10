import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { WEAVER_TRACE_FORMAT, WEAVER_TRACE_VERSION, type WeaverTrace } from "@cylayo/weaver-core";
import { existingSurfaceIds, loadTraceText, replayTraceUpTo } from "./inspector-model.js";
import { INSPECTOR_SAMPLE_PATH } from "./sample-flow.js";

const sampleText = readFileSync(new URL(`../${INSPECTOR_SAMPLE_PATH}`, import.meta.url), "utf8");
const noop = (): void => undefined;

function loadSample(): WeaverTrace {
  const loaded = loadTraceText(sampleText);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) throw new Error("the bundled sample must load");
  return loaded.trace;
}

function indexOfKind(trace: WeaverTrace, kind: string, afterIndex = -1): number {
  return trace.entries.findIndex((entry, position) => position > afterIndex && entry.kind === kind);
}

describe("loadTraceText", () => {
  it("loads the bundled sample", () => {
    const loaded = loadTraceText(sampleText);
    assert.equal(loaded.ok, true);
    if (loaded.ok) assert.equal(loaded.trace.entries.length, 10);
  });

  it("explains text that is not JSON", () => {
    const loaded = loadTraceText("{not json");
    assert.equal(loaded.ok, false);
    if (!loaded.ok) assert.match(loaded.message, /not valid JSON/);
  });

  it("explains a file that is JSON but not a weaver-trace", () => {
    const loaded = loadTraceText(JSON.stringify({ format: "something-else", version: 1, truncated: false, entries: [] }));
    assert.equal(loaded.ok, false);
    if (!loaded.ok) assert.match(loaded.message, /not a weaver-trace file/);
  });

  it("explains an unsupported version", () => {
    const loaded = loadTraceText(JSON.stringify({ format: WEAVER_TRACE_FORMAT, version: 2, truncated: false, entries: [] }));
    assert.equal(loaded.ok, false);
    if (!loaded.ok) assert.match(loaded.message, /version 2 is not supported/);
  });

  it("names the path of a malformed entry", () => {
    const loaded = loadTraceText(
      JSON.stringify({ format: WEAVER_TRACE_FORMAT, version: WEAVER_TRACE_VERSION, truncated: false, entries: [{ seq: "one" }] }),
    );
    assert.equal(loaded.ok, false);
    if (!loaded.ok) assert.match(loaded.message, /malformed at /);
  });
});

describe("replayTraceUpTo", () => {
  it("returns undefined for a step that does not exist", () => {
    assert.equal(replayTraceUpTo(loadSample(), 99, noop), undefined);
  });

  it("gives a fresh view at each step, regardless of earlier stepping", () => {
    const trace = loadSample();
    const direct = replayTraceUpTo(trace, 5, noop);
    replayTraceUpTo(trace, 9, noop);
    const again = replayTraceUpTo(trace, 5, noop);
    assert.ok(direct !== undefined && again !== undefined);
    assert.deepEqual(direct.replay.surfaces, again.replay.surfaces);
  });

  it("leaves the earlier surface unchanged at a torn frame", () => {
    const trace = loadSample();
    const frameError = indexOfKind(trace, "frame-error");
    assert.ok(frameError > 0);
    const before = replayTraceUpTo(trace, frameError - 1, noop);
    const at = replayTraceUpTo(trace, frameError, noop);
    assert.ok(before !== undefined && at !== undefined);
    assert.deepEqual(at.replay.surfaces, before.replay.surfaces);
    const last = at.replay.steps.at(-1);
    assert.equal(last?.kind, "frame-error");
    assert.equal(last?.replayed, null);
  });

  it("leaves the surface unchanged when a message is rejected", () => {
    const trace = loadSample();
    const rejected = trace.entries.findIndex((entry) => entry.kind === "message" && !entry.outcome.ok);
    assert.ok(rejected > 0);
    const before = replayTraceUpTo(trace, rejected - 1, noop);
    const at = replayTraceUpTo(trace, rejected, noop);
    assert.ok(before !== undefined && at !== undefined);
    assert.deepEqual(at.replay.surfaces, before.replay.surfaces);
    assert.equal(at.replay.steps.at(-1)?.replayed?.ok, false);
  });

  it("reports the rejected action with the recorded error code", () => {
    const trace = loadSample();
    const last = trace.entries.length - 1;
    const result = replayTraceUpTo(trace, last, noop);
    assert.ok(result !== undefined);
    const step = result.replay.steps.at(-1);
    assert.deepEqual(step?.recorded, { ok: false, code: "INSTANCE_NOT_FOUND" });
    assert.deepEqual(step?.replayed, { ok: false, code: "INSTANCE_NOT_FOUND" });
    assert.equal(step?.diverged, false);
    assert.deepEqual(existingSurfaceIds(result.replay), ["reference-request"]);
  });
});

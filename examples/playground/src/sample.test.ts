import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseWeaverTrace, replayWeaverTrace, type WeaverTraceEntryKind } from "@cylayo/weaver-core";
import { createInspectorWebRuntime } from "./runtime-factory.js";
import {
  createInspectorSampleTrace,
  INSPECTOR_SAMPLE_PATH,
  SAMPLE_SURFACE_ID,
  serializeInspectorSample,
} from "./sample-flow.js";

// The compiled test runs from dist-test/, so this resolves to samples/ in the package.
const committedPath = new URL(`../${INSPECTOR_SAMPLE_PATH}`, import.meta.url);
const committedText = readFileSync(committedPath, "utf8");

describe("bundled inspector sample", () => {
  it("is exactly what the deterministic recording produces", () => {
    assert.equal(
      committedText,
      serializeInspectorSample(createInspectorSampleTrace()),
      "samples/reference-request.weaver-trace.json is stale. Run `pnpm --filter @weaver/playground sample:write`, then review the diff.",
    );
  });

  it("parses with parseWeaverTrace", () => {
    const parsed = parseWeaverTrace(JSON.parse(committedText));
    assert.equal(parsed.ok, true, parsed.ok ? "" : JSON.stringify(parsed.error));
  });

  it("covers every entry kind, a rejected message, a rejected action and a frame error", () => {
    const parsed = parseWeaverTrace(JSON.parse(committedText));
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const kinds = new Set<WeaverTraceEntryKind>(parsed.value.entries.map((entry) => entry.kind));
    assert.deepEqual([...kinds].sort(), ["action", "frame-error", "input", "message"]);
    assert.equal(parsed.value.truncated, false);
    assert.ok(parsed.value.entries.some((entry) => entry.kind === "frame-error" && !entry.outcome.ok));
    assert.ok(parsed.value.entries.some((entry) => entry.kind === "message" && !entry.outcome.ok));
    assert.ok(parsed.value.entries.some((entry) => entry.kind === "action" && !entry.outcome.ok));
  });

  it("replays into an identically configured runtime with zero divergence", () => {
    const parsed = parseWeaverTrace(JSON.parse(committedText));
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const created = createInspectorWebRuntime();
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const replay = replayWeaverTrace(parsed.value, { runtime: created.value.runtime });
    assert.equal(replay.steps.length, parsed.value.entries.length);
    assert.deepEqual(
      replay.steps.filter((step) => step.diverged).map((step) => step.seq),
      [],
      "a replayed step diverged from the recording. The trace format or the runtime changed.",
    );
  });

  it("ends with the host answer applied to the surface", () => {
    const parsed = parseWeaverTrace(JSON.parse(committedText));
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const created = createInspectorWebRuntime();
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const replay = replayWeaverTrace(parsed.value, { runtime: created.value.runtime });
    const surface = replay.surfaces[SAMPLE_SURFACE_ID];
    assert.ok(surface !== undefined, "the sample surface must exist after replay");
    assert.deepEqual((surface.dataModel as { result: unknown }).result, {
      count: 1,
      status: "Created: Ship the inspector",
      countLabel: "Submitted: 1",
    });
  });
});

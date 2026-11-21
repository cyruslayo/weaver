import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  A2UI_V10_BASIC_CATALOG_ID,
  createA2UIV10StreamIngestion,
  parseWeaverTrace,
  replayWeaverTrace,
  type A2UIV10StreamIngestionEvent,
} from "@cylayo/weaver-core";
import { benchMessages, BENCH_SURFACE_ID } from "./bench.js";
import { PLAYGROUND_EXAMPLES } from "./editor/examples.js";
import { createInspectorWebRuntime } from "./runtime-factory.js";
import {
  createRowLayoutSampleTrace,
  ROW_LAYOUT_SAMPLE_PATH,
  serializeInspectorSample,
} from "./sample-flow.js";

// Compiled tests run from dist-test/, so this resolves to samples/ in the package.
const rowLayoutPath = new URL(`../${ROW_LAYOUT_SAMPLE_PATH}`, import.meta.url);

function rejectedEvents(events: readonly A2UIV10StreamIngestionEvent[]): number {
  return events.filter((event) => !event.ok).length;
}

describe("row-layout sample", () => {
  it("is exactly what the deterministic recording produces", () => {
    assert.equal(
      readFileSync(rowLayoutPath, "utf8"),
      serializeInspectorSample(createRowLayoutSampleTrace()),
      "samples/row-layout.weaver-trace.json is stale. Run `pnpm --filter @weaver/playground sample:write`, then review the diff.",
    );
  });

  it("replays into an identically configured v1.0 runtime with zero divergence", () => {
    const parsed = parseWeaverTrace(JSON.parse(readFileSync(rowLayoutPath, "utf8")));
    assert.equal(parsed.ok, true, parsed.ok ? "" : JSON.stringify(parsed.error));
    if (!parsed.ok) return;
    const created = createInspectorWebRuntime();
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const replay = replayWeaverTrace(parsed.value, { runtime: created.value.runtime });
    assert.equal(replay.steps.length, parsed.value.entries.length);
    assert.deepEqual(replay.steps.filter((step) => step.diverged).map((step) => step.seq), []);
  });
});

describe("bundled v1.0 samples", () => {
  it("every built-in example except broken-output processes with zero rejected frames", () => {
    for (const example of PLAYGROUND_EXAMPLES.filter((candidate) => !candidate.broken)) {
      const created = createInspectorWebRuntime();
      assert.equal(created.ok, true, example.id);
      if (!created.ok) continue;
      const ingestion = createA2UIV10StreamIngestion({ runtime: created.value.runtime });
      const events = [...ingestion.push(example.jsonl), ...ingestion.finish()];
      assert.equal(rejectedEvents(events), 0, `${example.id} must have no rejected frames`);
      assert.ok(events.length > 0, `${example.id} must carry frames`);
    }
  });

  it("the broken-output example has exactly one rejected frame", () => {
    const example = PLAYGROUND_EXAMPLES.find((candidate) => candidate.broken);
    assert.ok(example !== undefined, "broken-output example is missing");
    if (example === undefined) return;
    const created = createInspectorWebRuntime();
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const ingestion = createA2UIV10StreamIngestion({ runtime: created.value.runtime });
    const events = [...ingestion.push(example.jsonl), ...ingestion.finish()];
    assert.equal(rejectedEvents(events), 1);
  });

  it("the component bench processes through a v1.0 runtime with zero rejected messages", () => {
    const created = createInspectorWebRuntime();
    assert.equal(created.ok, true);
    if (!created.ok) return;
    for (const message of benchMessages(A2UI_V10_BASIC_CATALOG_ID)) {
      const processed = created.value.runtime.process(message);
      assert.equal(processed.ok, true, processed.ok ? "" : JSON.stringify(processed.error));
    }
    // Resolution evaluates bindings, functions and @checks, so a bad reference fails here and not only in the browser.
    const resolved = created.value.runtime.resolveSurface(BENCH_SURFACE_ID);
    assert.equal(resolved.ok, true, resolved.ok ? "" : JSON.stringify(resolved.error));
  });
});

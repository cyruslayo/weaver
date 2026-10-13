import assert from "node:assert/strict";
import { test } from "node:test";
import {
  A2UI_V091_BASIC_CATALOG_ID,
  createA2UIV091StreamIngestion,
  createBasicCatalogV091Registration,
  createWeaverRuntime,
  type A2UIV091StreamIngestionEvent,
  type WeaverRuntime,
} from "@cylayo/weaver-core";
import { DEFAULT_EXAMPLE_ID, PLAYGROUND_EXAMPLES, PLAYGROUND_SURFACE_ID, findExample } from "./examples.js";

/** Runs the text through the same ingestion path the page uses, in one push, then finish. */
function ingest(jsonl: string): { runtime: WeaverRuntime; events: A2UIV091StreamIngestionEvent[] } {
  const created = createWeaverRuntime({ catalogs: [createBasicCatalogV091Registration()] });
  if (!created.ok) throw new Error(`runtime configuration failed: ${created.error.code}`);
  const runtime = created.value;
  const ingestion = createA2UIV091StreamIngestion({ runtime });
  const events = [...ingestion.push(jsonl), ...ingestion.finish()];
  return { runtime, events };
}

function rejected(events: readonly A2UIV091StreamIngestionEvent[]): Extract<A2UIV091StreamIngestionEvent, { ok: false }>[] {
  return events.filter((event): event is Extract<A2UIV091StreamIngestionEvent, { ok: false }> => !event.ok);
}

const validExamples = PLAYGROUND_EXAMPLES.filter((example) => !example.broken);

test("every example has a unique id and exactly one broken example", () => {
  const ids = PLAYGROUND_EXAMPLES.map((example) => example.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(PLAYGROUND_EXAMPLES.filter((example) => example.broken).length, 1);
  assert.ok(findExample(DEFAULT_EXAMPLE_ID) !== undefined);
  assert.equal(findExample("no-such-example"), undefined);
});

for (const example of validExamples) {
  test(`example "${example.title}" processes with zero rejected frames`, () => {
    const lines = example.jsonl.split("\n");
    assert.ok(lines.length >= 4 && lines.length <= 7, `expected 4 to 7 lines, found ${lines.length}`);
    assert.ok(lines.every((line) => line.length > 0), "no blank lines in a valid example");

    const { runtime, events } = ingest(example.jsonl);
    assert.deepEqual(rejected(events), []);
    assert.equal(events.length, lines.length);

    const resolved = runtime.resolveSurface(PLAYGROUND_SURFACE_ID);
    assert.equal(resolved.ok, true, "the surface resolves");
    assert.equal(resolved.ok && resolved.value.tree.ready, true, "the component tree is ready");
  });

  test(`example "${example.title}" uses only the Basic Catalog`, () => {
    const surfaceLines = example.jsonl.split("\n").filter((line) => line.includes('"createSurface"'));
    assert.equal(surfaceLines.length, 1);
    const message = JSON.parse(surfaceLines[0]!) as { createSurface: { catalogId: string } };
    assert.equal(message.createSurface.catalogId, A2UI_V091_BASIC_CATALOG_ID);
  });
}

test("the broken example yields exactly one rejected frame, on line 3, with INVALID_JSON", () => {
  const broken = findExample("broken-output");
  assert.ok(broken !== undefined);
  assert.equal(broken.broken, true);

  const failures = rejected(ingest(broken.jsonl).events);
  assert.equal(failures.length, 1);
  assert.equal(failures[0]!.frame, 3);
  assert.equal(failures[0]!.error.code, "INVALID_JSON");
});

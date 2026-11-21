// Records the deterministic inspector samples and writes them to samples/.
// Run it with `pnpm --filter @weaver/playground sample:write`. The test in
// src/sample.test.ts fails when a committed file no longer matches this output.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const {
  createInspectorSampleTrace,
  createRowLayoutSampleTrace,
  serializeInspectorSample,
  INSPECTOR_SAMPLE_PATH,
  ROW_LAYOUT_SAMPLE_PATH,
} = await import(new URL("../dist-test/sample-flow.js", import.meta.url).href);

const samples = [
  [INSPECTOR_SAMPLE_PATH, createInspectorSampleTrace],
  [ROW_LAYOUT_SAMPLE_PATH, createRowLayoutSampleTrace],
];
for (const [path, record] of samples) {
  const target = fileURLToPath(new URL(`../${path}`, import.meta.url));
  writeFileSync(target, serializeInspectorSample(record()));
  console.log(`wrote ${path}`);
}

// Records the deterministic inspector sample and writes it to samples/.
// Run it with `pnpm --filter @weaver/playground sample:write`. The test in
// src/sample.test.ts fails when the committed file no longer matches this output.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { createInspectorSampleTrace, serializeInspectorSample, INSPECTOR_SAMPLE_PATH } = await import(
  new URL("../dist-test/sample-flow.js", import.meta.url).href
);

const target = fileURLToPath(new URL(`../${INSPECTOR_SAMPLE_PATH}`, import.meta.url));
writeFileSync(target, serializeInspectorSample(createInspectorSampleTrace()));
console.log(`wrote ${INSPECTOR_SAMPLE_PATH}`);

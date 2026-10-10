import assert from "node:assert/strict";
import { test } from "node:test";
import { createWeaverTraceRecorder } from "./createWeaverTraceRecorder.js";
import { parseWeaverTrace } from "./parseWeaverTrace.js";

// Deliberately untyped: the cases below corrupt documents on purpose.
function validTrace(): any {
  return {
    format: "weaver-trace",
    version: 1,
    truncated: false,
    entries: [
      {
        seq: 1,
        at: "2026-10-10T00:00:00.000Z",
        kind: "message",
        input: { version: "v0.9.1" },
        outcome: { ok: true, summary: { operation: "surfaceCreated", surfaceId: "main" } },
      },
      {
        seq: 2,
        at: "2026-10-10T00:00:01.000Z",
        kind: "frame-error",
        input: "{bad\n",
        outcome: { ok: false, error: { code: "INVALID_JSON", frame: 2 } },
      },
    ],
  };
}

test("accepts a recorded trace and returns an equal, independent copy", () => {
  const recorder = createWeaverTraceRecorder({ now: () => new Date("2026-10-10T00:00:00.000Z") });
  recorder.recordIngestion([{ ok: false, frame: 1, error: { code: "INVALID_JSON", frame: 1 } }], "{");
  const recorded = JSON.parse(JSON.stringify(recorder.getTrace()));

  const parsed = parseWeaverTrace(recorded);
  assert.equal(parsed.ok, true, parsed.ok ? undefined : JSON.stringify(parsed.error));
  if (!parsed.ok) return;
  assert.deepEqual(parsed.value, recorded);
  assert.notEqual(parsed.value, recorded);
});

test("accepts a valid trace that reports truncation with seq gaps", () => {
  const trace = validTrace();
  trace.truncated = true;
  trace.entries[0].seq = 4;
  trace.entries[1].seq = 9;
  assert.equal(parseWeaverTrace(trace).ok, true);
});

test("rejects a wrong format", () => {
  for (const format of ["weaver-trace-v2", "other", undefined, 1]) {
    const trace = { ...validTrace(), format };
    const result = parseWeaverTrace(trace);
    assert.deepEqual(result, { ok: false, error: { code: "WRONG_FORMAT", format } });
  }
});

test("rejects an unknown or non-integer version", () => {
  for (const version of [2, 0, "1", 1.5, undefined]) {
    const result = parseWeaverTrace({ ...validTrace(), version });
    assert.deepEqual(result, { ok: false, error: { code: "UNSUPPORTED_VERSION", version } });
  }
});

test("rejects roots that are not plain objects", () => {
  for (const value of [null, [], "weaver-trace", 1, undefined]) {
    const result = parseWeaverTrace(value);
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error.code, "MALFORMED_TRACE");
    assert.equal(!result.ok && result.error.code === "MALFORMED_TRACE" && result.error.path, "$");
  }
});

const malformedCases: [string, (trace: any) => void, string][] = [
  ["an unknown root key", (t) => { t.extra = 1; }, "$"],
  ["a missing root key", (t) => { delete t.truncated; }, "$"],
  ["a non-boolean truncated", (t) => { t.truncated = "no"; }, "$.truncated"],
  ["entries that are not an array", (t) => { t.entries = {}; }, "$.entries"],
  ["an entry that is not an object", (t) => { t.entries[0] = null; }, "$.entries[0]"],
  ["an unknown entry key", (t) => { t.entries[0].bogus = true; }, "$.entries[0]"],
  ["a missing outcome", (t) => { delete t.entries[0].outcome; }, "$.entries[0]"],
  ["seq zero", (t) => { t.entries[0].seq = 0; }, "$.entries[0].seq"],
  ["a fractional seq", (t) => { t.entries[0].seq = 1.5; }, "$.entries[0].seq"],
  ["seq that does not increase", (t) => { t.entries[1].seq = 1; }, "$.entries[1].seq"],
  ["a date-only timestamp", (t) => { t.entries[0].at = "2026-10-10"; }, "$.entries[0].at"],
  ["a timestamp with a local offset", (t) => { t.entries[0].at = "2026-10-10T00:00:00.000+01:00"; }, "$.entries[0].at"],
  ["a numeric timestamp", (t) => { t.entries[0].at = 0; }, "$.entries[0].at"],
  ["an unknown kind", (t) => { t.entries[0].kind = "replay"; }, "$.entries[0].kind"],
  ["a frame-error that reports success", (t) => { t.entries[1].outcome = { ok: true, summary: null }; }, "$.entries[1].outcome"],
  ["a non-boolean ok", (t) => { t.entries[0].outcome.ok = "yes"; }, "$.entries[0].outcome.ok"],
  ["a failure with an extra summary key", (t) => { t.entries[1].outcome.summary = 1; }, "$.entries[1].outcome"],
  ["an error without a string code", (t) => { t.entries[1].outcome.error = { frame: 2 }; }, "$.entries[1].outcome.error"],
  ["a non-JSON number in input", (t) => { t.entries[0].input = { n: Number.NaN }; }, "$.entries[0].input"],
  ["an undefined input member", (t) => { t.entries[0].input = { n: undefined }; }, "$.entries[0].input"],
  ["a function in a summary", (t) => { t.entries[0].outcome.summary = () => 1; }, "$.entries[0].outcome.summary"],
  ["a cyclic input", (t) => { const cyclic: any = { a: 1 }; cyclic.self = cyclic; t.entries[0].input = cyclic; }, "$.entries[0].input"],
];

for (const [name, mutate, path] of malformedCases) {
  test(`rejects ${name} with the failing path`, () => {
    const trace = validTrace();
    mutate(trace);
    const result = parseWeaverTrace(trace);
    assert.equal(result.ok, false, `expected rejection for ${name}`);
    assert.deepEqual(
      result.ok ? undefined : { code: result.error.code, path: result.error.code === "MALFORMED_TRACE" ? result.error.path : undefined },
      { code: "MALFORMED_TRACE", path },
    );
  });
}

test("does not alias the caller's value in the returned copy", () => {
  const trace = validTrace();
  const parsed = parseWeaverTrace(trace);
  assert.equal(parsed.ok, true);
  trace.entries[0].input.version = "changed";
  if (parsed.ok) assert.equal((parsed.value.entries[0]?.input as { version: string }).version, "v0.9.1");
});

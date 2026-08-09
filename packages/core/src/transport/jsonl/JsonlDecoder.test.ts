import assert from "node:assert/strict";
import { test } from "node:test";

import { CatalogRegistry } from "../../catalog/index.js";
import { A2UIMessageProcessor } from "../../message-processor/index.js";
import { SurfaceStore } from "../../surfaces/index.js";
import { JsonlDecoder } from "./JsonlDecoder.js";

const successes = (events: ReturnType<JsonlDecoder["push"]>) =>
  events.filter((event) => event.ok).map((event) => event.value);

function catalogs() {
  const registry = new CatalogRegistry();
  const result = registry.register({ catalogId: "basic", schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    catalogId: "basic",
    components: {
      Text: {
        type: "object",
        properties: { id: { type: "string" }, component: { const: "Text" }, text: { type: "string" } },
        required: ["id", "component", "text"],
        additionalProperties: false,
      },
    },
    $defs: { theme: { type: "object" } },
  } });
  assert.equal(result.ok, true);
  return registry;
}

test("decodes one LF frame in one chunk", () => {
  const decoder = new JsonlDecoder();
  assert.deepEqual(decoder.push('{"one":1}\n'), [{ ok: true, value: { one: 1 }, frame: 1 }]);
});

test("buffers one frame over arbitrary chunks and a separate newline", () => {
  const decoder = new JsonlDecoder();
  assert.deepEqual(decoder.push('{"version":"v0.'), []);
  assert.deepEqual(decoder.push('9.1","value":"Zynra 🚀"}'), []);
  assert.deepEqual(successes(decoder.push("\n")), [{ version: "v0.9.1", value: "Zynra 🚀" }]);
});

test("decodes many ordered frames in one chunk", () => {
  const decoder = new JsonlDecoder();
  const events = decoder.push('{"n":1}\n{"n":2}\n{"n":3}\n');
  assert.deepEqual(successes(events), [{ n: 1 }, { n: 2 }, { n: 3 }]);
  assert.deepEqual(events.map((event) => event.ok ? event.frame : event.error.frame), [1, 2, 3]);
});

test("supports CRLF split across chunks without changing JSON string content", () => {
  const decoder = new JsonlDecoder();
  assert.deepEqual(decoder.push('{"text":"a\\r\\nb"}\r'), []);
  assert.deepEqual(decoder.push("\n"), [{ ok: true, value: { text: "a\r\nb" }, frame: 1 }]);
});

test("finish parses a final frame without a newline", () => {
  const decoder = new JsonlDecoder();
  decoder.push('{"message":"one"}');
  assert.deepEqual(decoder.finish(), [{ ok: true, value: { message: "one" }, frame: 1 }]);
  assert.deepEqual(decoder.finish(), []);
});

test("reports malformed complete and final frames without throwing", () => {
  const decoder = new JsonlDecoder();
  assert.deepEqual(decoder.push("{bad}\n"), [{ ok: false, error: { code: "INVALID_JSON", frame: 1 } }]);
  decoder.push('{"incomplete":');
  assert.deepEqual(decoder.finish(), [{ ok: false, error: { code: "INVALID_JSON", frame: 2 } }]);
});

test("empty and whitespace-only framed lines are invalid but trailing delimiter adds no frame", () => {
  const decoder = new JsonlDecoder();
  const events = decoder.push('{"n":1}\n\n   \n{"n":4}\n');
  assert.deepEqual(events, [
    { ok: true, value: { n: 1 }, frame: 1 },
    { ok: false, error: { code: "INVALID_JSON", frame: 2 } },
    { ok: false, error: { code: "INVALID_JSON", frame: 3 } },
    { ok: true, value: { n: 4 }, frame: 4 },
  ]);
  assert.deepEqual(decoder.finish(), []);
});

test("isolates malformed frames and preserves frame numbers across chunks", () => {
  const decoder = new JsonlDecoder();
  const events = [
    ...decoder.push('{"valid":1}\nnot'),
    ...decoder.push(' json\n{"valid":'),
    ...decoder.push("3}\n"),
  ];
  assert.deepEqual(events, [
    { ok: true, value: { valid: 1 }, frame: 1 },
    { ok: false, error: { code: "INVALID_JSON", frame: 2 } },
    { ok: true, value: { valid: 3 }, frame: 3 },
  ]);
});

test("reports oversized complete frames once and recovers after their newline", () => {
  const decoder = new JsonlDecoder({ maxFrameCharacters: 7 });
  assert.deepEqual(decoder.push('12345678\ntrue\n'), [
    { ok: false, error: { code: "FRAME_TOO_LARGE", frame: 1, maxFrameCharacters: 7 } },
    { ok: true, value: true, frame: 2 },
  ]);
});

test("enforces size across partial chunks and discards all remaining fragments", () => {
  const decoder = new JsonlDecoder({ maxFrameCharacters: 5 });
  assert.deepEqual(decoder.push("123"), []);
  assert.deepEqual(decoder.push("456"), [
    { ok: false, error: { code: "FRAME_TOO_LARGE", frame: 1, maxFrameCharacters: 5 } },
  ]);
  assert.deepEqual(decoder.push("789\ntrue\n"), [
    { ok: true, value: true, frame: 2 },
  ]);
});

test("finish does not emit a second error for an oversized unterminated frame", () => {
  const decoder = new JsonlDecoder({ maxFrameCharacters: 3 });
  assert.equal(decoder.push("1234").length, 1);
  assert.deepEqual(decoder.finish(), []);
});

test("reset drops partial and discard state and restarts at frame one", () => {
  const decoder = new JsonlDecoder({ maxFrameCharacters: 5 });
  decoder.push("partial oversized");
  decoder.reset();
  assert.deepEqual(decoder.push("true\n"), [{ ok: true, value: true, frame: 1 }]);
});

test("valid JSON remains separate from A2UI protocol validation", () => {
  const decoder = new JsonlDecoder();
  const [frame] = decoder.push('{"hello":"world"}\n');
  assert.ok(frame?.ok);
  const result = new A2UIMessageProcessor(new SurfaceStore(), catalogs()).process(frame.value);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error.code, "PROTOCOL_VALIDATION_FAILED");
});

test("malformed JSON does not poison a following valid A2UI frame", () => {
  const decoder = new JsonlDecoder();
  const events = decoder.push('{bad json}\n{"version":"v0.9.1","createSurface":{"surfaceId":"main","catalogId":"basic"}}\n');
  assert.equal(events[0]?.ok, false);
  assert.equal(!events[0]?.ok && events[0]?.error.code, "INVALID_JSON");
  assert.ok(events[1]?.ok);
  const result = new A2UIMessageProcessor(new SurfaceStore(), catalogs()).process(events[1].value);
  assert.equal(result.ok, true);
});

test("awkward JSONL chunks compose through a complete A2UI lifecycle", () => {
  const messages = [
    { version: "v0.9.1", createSurface: { surfaceId: "main", catalogId: "basic" } },
    { version: "v0.9.1", updateComponents: { surfaceId: "main", components: [{ id: "root", component: "Text", text: "Hi" }] } },
    { version: "v0.9.1", updateDataModel: { surfaceId: "main", path: "/name", value: "Zynra 🚀" } },
    { version: "v0.9.1", deleteSurface: { surfaceId: "main" } },
  ];
  const input = messages.map((message) => JSON.stringify(message)).join("\n");
  const cuts = [1, 7, 19, 38, 61, 103, input.length];
  const decoder = new JsonlDecoder();
  const store = new SurfaceStore();
  const processor = new A2UIMessageProcessor(store, catalogs());
  let start = 0;
  const results = [];
  for (const end of cuts) {
    for (const event of decoder.push(input.slice(start, end))) {
      if (event.ok) results.push(processor.process(event.value));
    }
    start = end;
  }
  for (const event of decoder.finish()) {
    if (event.ok) results.push(processor.process(event.value));
  }
  assert.equal(results.length, 4);
  assert.equal(results.every((result) => result.ok), true);
  assert.deepEqual(store.list(), []);
});

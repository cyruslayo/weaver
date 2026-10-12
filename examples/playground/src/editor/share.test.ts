import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_SHARED_BYTES,
  decodeSharedJsonl,
  describeShareDecodeFailure,
  encodeSharedJsonl,
} from "./share.js";

const UNICODE_TEXT = 'Olá — 😀 中文 `backtick` ${not-a-template}\n{"version":"v0.9.1"}';

test("encode then decode round-trips unicode text exactly", () => {
  const encoded = encodeSharedJsonl(UNICODE_TEXT);
  assert.equal(encoded.ok, true);
  if (!encoded.ok) return;
  assert.match(encoded.fragment, /^#jsonl=[A-Za-z0-9_-]+$/);

  const decoded = decodeSharedJsonl(encoded.fragment);
  assert.deepEqual(decoded, { ok: true, text: UNICODE_TEXT });
});

test("decode accepts the hash with or without its leading #, and with other parameters first", () => {
  const encoded = encodeSharedJsonl("hello");
  assert.equal(encoded.ok, true);
  if (!encoded.ok) return;
  const withoutHash = encoded.fragment.slice(1);
  assert.deepEqual(decodeSharedJsonl(withoutHash), { ok: true, text: "hello" });
  assert.deepEqual(decodeSharedJsonl(`#view=1&${withoutHash}`), { ok: true, text: "hello" });
});

test("a hash without the jsonl value is absent, not an error", () => {
  assert.deepEqual(decodeSharedJsonl(""), { ok: false, reason: "absent" });
  assert.deepEqual(decodeSharedJsonl("#"), { ok: false, reason: "absent" });
  assert.deepEqual(decodeSharedJsonl("#other=abc"), { ok: false, reason: "absent" });
});

test("encoding accepts exactly the cap and refuses one byte more", () => {
  assert.equal(encodeSharedJsonl("a".repeat(MAX_SHARED_BYTES)).ok, true);
  assert.deepEqual(encodeSharedJsonl("a".repeat(MAX_SHARED_BYTES + 1)), { ok: false, reason: "too-large" });
});

test("decoding refuses a link that decodes to more than the cap", () => {
  // Valid base64url of one byte more than the cap, so the length check passes and the size check runs.
  const oversized = Buffer.alloc(MAX_SHARED_BYTES + 1, 97).toString("base64url");
  assert.deepEqual(decodeSharedJsonl(`#jsonl=${oversized}`), { ok: false, reason: "too-large" });
});

test("decoding refuses a link far longer than the cap before it decodes anything", () => {
  const huge = "A".repeat(MAX_SHARED_BYTES * 2);
  assert.deepEqual(decodeSharedJsonl(`#jsonl=${huge}`), { ok: false, reason: "too-large" });
});

test("malformed links are refused", () => {
  assert.deepEqual(decodeSharedJsonl("#jsonl=!!!"), { ok: false, reason: "malformed" });
  assert.deepEqual(decodeSharedJsonl("#jsonl=AAAAA"), { ok: false, reason: "malformed" });
  assert.deepEqual(decodeSharedJsonl("#jsonl=YWJj+ZZZ"), { ok: false, reason: "malformed" });
});

test("bytes that are not UTF-8 are refused", () => {
  const notUtf8 = Buffer.from([0xff, 0xfe, 0xfd]).toString("base64url");
  assert.deepEqual(decodeSharedJsonl(`#jsonl=${notUtf8}`), { ok: false, reason: "not-utf8" });
});

test("every decode failure has a readable message", () => {
  for (const reason of ["too-large", "malformed", "not-utf8"] as const) {
    assert.ok(describeShareDecodeFailure(reason).length > 0);
  }
});

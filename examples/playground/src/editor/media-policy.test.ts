import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSampleImageUrl } from "./media-policy.js";

const PAGE = "https://example.test/weaver/index.html";
const BASE = "/weaver/";

test("a samples/ image under the Vite base loads, resolved to an absolute URL", () => {
  assert.equal(
    resolveSampleImageUrl("samples/hotel-tejo.jpg", PAGE, BASE),
    "https://example.test/weaver/samples/hotel-tejo.jpg",
  );
  assert.equal(
    resolveSampleImageUrl("/weaver/samples/hotel-tejo.jpg", PAGE, BASE),
    "https://example.test/weaver/samples/hotel-tejo.jpg",
  );
});

test("the root base works the same way", () => {
  assert.equal(
    resolveSampleImageUrl("samples/a.jpg", "http://localhost:5173/", "/"),
    "http://localhost:5173/samples/a.jpg",
  );
});

test("other origins, protocols and traversal are all denied", () => {
  const denied = [
    "https://evil.test/weaver/samples/x.jpg",
    "http://example.test/weaver/samples/x.jpg",
    "//evil.test/weaver/samples/x.jpg",
    "data:image/png;base64,AAAA",
    "javascript:alert(1)",
    "blob:https://example.test/abc",
    "samples/../index.html",
    "../secret.jpg",
    "/other/samples/x.jpg",
    "samples/",
    "",
  ];
  for (const requested of denied) {
    assert.equal(resolveSampleImageUrl(requested, PAGE, BASE), undefined, `expected ${requested} to be denied`);
  }
});

test("a malformed base is denied rather than thrown", () => {
  assert.equal(resolveSampleImageUrl("samples/a.jpg", "not a url", "///"), undefined);
});

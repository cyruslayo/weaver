import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { IMAGE_FILES, type ImageKey } from "./data.js";
import { imageSource } from "./images.js";
import { resolveSiteImageUrl } from "./media-policy.js";

const PAGE = "https://cyruslayo.github.io/weaver/";
const BASE = "/weaver/";

test("a photo under images/ loads, resolved to an absolute URL on the page's origin", () => {
  assert.equal(
    resolveSiteImageUrl("images/hotel-tejo.jpg", PAGE, BASE),
    "https://cyruslayo.github.io/weaver/images/hotel-tejo.jpg",
  );
  assert.equal(
    resolveSiteImageUrl("/weaver/images/hotel-tejo.jpg", PAGE, BASE),
    "https://cyruslayo.github.io/weaver/images/hotel-tejo.jpg",
  );
});

test("the root base works the same way", () => {
  assert.equal(
    resolveSiteImageUrl("images/a.jpg", "http://localhost:5173/", "/"),
    "http://localhost:5173/images/a.jpg",
  );
});

test("other origins, protocols, other folders and traversal are all denied", () => {
  const denied = [
    "https://evil.test/weaver/images/x.jpg",
    "http://cyruslayo.github.io/weaver/images/x.jpg",
    "//evil.test/weaver/images/x.jpg",
    "data:image/png;base64,AAAA",
    "javascript:alert(1)",
    "blob:https://cyruslayo.github.io/abc",
    "images/../index.html",
    "../secret.jpg",
    "/other/images/x.jpg",
    "/weaver/playground/index.html",
    "samples/hotel-tejo.jpg",
    "images/",
    "",
  ];
  for (const requested of denied) {
    assert.equal(resolveSiteImageUrl(requested, PAGE, BASE), undefined, `expected ${requested} to be denied`);
  }
});

test("a malformed base is denied rather than thrown", () => {
  assert.equal(resolveSiteImageUrl("images/a.jpg", "not a url", "///"), undefined);
});

test("every photo the demo names is allowed by the policy and exists in public/images", () => {
  const folder = new URL("../../public/images/", import.meta.url);
  for (const key of Object.keys(IMAGE_FILES) as ImageKey[]) {
    const source = imageSource(key);
    assert.ok(resolveSiteImageUrl(source, PAGE, BASE), `policy denies ${source}`);
    assert.ok(existsSync(new URL(IMAGE_FILES[key] + ".jpg", folder)), `missing photo file for ${key}`);
  }
});

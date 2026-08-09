import assert from "node:assert/strict";
import test from "node:test";
import { DataModel } from "./DataModel.js";

const value = (model: DataModel, path = "/") => {
  const result = model.get(path);
  assert.equal(result.ok, true);
  return result.ok ? result.value : undefined;
};

test("initial state, replacement, and ownership are defensive", () => {
  const model = new DataModel();
  assert.deepEqual(value(model), {});
  const supplied = { user: { name: "Ada" } };
  assert.equal(model.replace(supplied).ok, true);
  supplied.user.name = "changed";
  const read = value(model) as typeof supplied;
  read.user.name = "also changed";
  assert.deepEqual(value(model), { user: { name: "Ada" } });
});

test("reads, writes, upserts, and deletes object paths", () => {
  const model = new DataModel();
  assert.equal(model.set("/user/name", "Ada").ok, true);
  assert.equal(value(model, "/user/name"), "Ada");
  assert.equal(value(model, "/missing"), undefined);
  assert.equal(model.set("/user/name", "Grace").ok, true);
  assert.equal(model.delete("/user/name").ok, true);
  assert.deepEqual(value(model), { user: {} });
  assert.deepEqual(model.delete("/user/missing"), { ok: true, value: undefined });
  model.delete("/");
  assert.deepEqual(value(model), {});
});

test("decodes pointer escapes and rejects invalid pointers", () => {
  const model = new DataModel();
  model.set("/a~1b/m~0n/~0~1", 1);
  assert.equal(value(model, "/a~1b/m~0n/~0~1"), 1);
  assert.deepEqual(model.get("/bad~2escape"), {
    ok: false,
    error: { code: "INVALID_POINTER_ESCAPE", path: "/bad~2escape" },
  });
  assert.deepEqual(model.get("user/name"), {
    ok: false,
    error: { code: "INVALID_POINTER", path: "user/name" },
  });
});

test("supports array reads, replacement, append, and inferred containers", () => {
  const model = new DataModel();
  model.replace({ events: [{ name: "Concert" }] });
  assert.equal(value(model, "/events/0/name"), "Concert");
  model.set("/events/0", { name: "Talk" });
  model.set("/events/1", { name: "Show" });
  assert.deepEqual(value(model, "/events"), [{ name: "Talk" }, { name: "Show" }]);
  const inferred = new DataModel();
  inferred.set("/users/0/name", "Ada");
  assert.deepEqual(value(inferred), { users: [{ name: "Ada" }] });
});

test("rejects invalid, sparse, and deleted array indices", () => {
  const model = new DataModel();
  model.replace({ items: ["a"] });
  for (const path of ["/items/-1", "/items/1.5"]) {
    const result = model.set(path, "x");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "INVALID_ARRAY_INDEX");
  }
  const oversized = model.set("/items/50000", "x");
  assert.equal(oversized.ok, false);
  if (!oversized.ok) assert.equal(oversized.error.code, "ARRAY_INDEX_TOO_LARGE");
  const deletion = model.delete("/items/0");
  assert.equal(deletion.ok, false);
  if (!deletion.ok) assert.equal(deletion.error.code, "ARRAY_INDEX_DELETE_UNSUPPORTED");
  assert.deepEqual(value(model), { items: ["a"] });
});

test("failed deep writes are atomic", () => {
  const model = new DataModel();
  model.replace({ user: "Ada", untouched: true });
  const result = model.set("/user/name", "Grace");
  assert.equal(result.ok, false);
  assert.deepEqual(value(model), { user: "Ada", untouched: true });
});

test("subscriptions cover exact, parent, descendant, whole, unrelated, and unsubscribe", () => {
  const model = new DataModel();
  model.replace({ user: { name: "Ada" }, other: 0 });
  const calls = { whole: 0, exact: 0, parent: 0, descendant: 0, unrelated: 0 };
  model.subscribe(() => calls.whole++);
  model.subscribe("/user/name", () => calls.exact++);
  model.subscribe("/user", () => calls.parent++);
  model.subscribe("/user/name/first", () => calls.descendant++);
  model.subscribe("/other", () => calls.unrelated++);
  const unsubscribe = model.subscribe("/user", () => calls.parent++);
  unsubscribe();
  model.set("/user/name", { first: "Grace" });
  assert.deepEqual(calls, { whole: 1, exact: 1, parent: 1, descendant: 1, unrelated: 0 });
});

test("no-op and failed mutations do not notify", () => {
  const model = new DataModel();
  model.replace({ items: [1] });
  let calls = 0;
  model.subscribe(() => calls++);
  model.delete("/missing");
  model.delete("/items/0");
  model.set("/items/3", 4);
  assert.equal(calls, 0);
});

test("subscriber failures are isolated and callback values are defensive", () => {
  const model = new DataModel();
  let observed = false;
  model.subscribe(() => { throw new Error("boom"); });
  model.subscribe((current) => {
    observed = true;
    (current as { safe: { value: number } }).safe.value = 99;
  });
  model.set("/safe/value", 1);
  assert.equal(observed, true);
  assert.deepEqual(value(model), { safe: { value: 1 } });
});

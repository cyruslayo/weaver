import assert from "node:assert/strict";
import test from "node:test";
import { DataContext } from "./DataContext.js";
import { isDataPathBinding } from "./types.js";

function ok<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected success");
  return result.value;
}

function errorCode(result: { ok: true; value: unknown } | { ok: false; error: { code: string } }) {
  assert.equal(result.ok, false);
  return result.ok ? undefined : result.error.code;
}

const snapshot = {
  company: "Acme",
  user: { name: "Root", profile: { active: true } },
  users: [
    { name: "Ada", "a/b": "slash", "m~n": "tilde" },
    { name: "Grace", "a/b": "second slash", "m~n": "second tilde" },
  ],
  groups: [{ name: "A", members: [{ name: "Ada" }] }],
  notArray: { value: true },
};

test("root context reads absolute and root paths, preserves missing data, and owns values", () => {
  const original = structuredClone(snapshot);
  const context = DataContext.root(original);
  assert.equal(context.scopePath, "/");
  assert.equal(context.collectionIndex, undefined);
  assert.equal(ok(context.get("/user/name")), "Root");
  assert.deepEqual(ok(context.get("/")), snapshot);
  assert.equal(ok(context.get("/missing")), undefined);

  original.user.name = "changed";
  const user = ok(context.get("/user")) as { name: string };
  user.name = "also changed";
  assert.equal(ok(context.get("/user/name")), "Root");
});

test("root relative paths fail rather than being guessed", () => {
  const context = DataContext.root(snapshot);
  assert.equal(errorCode(context.get("name")), "RELATIVE_PATH_OUTSIDE_COLLECTION");
  assert.equal(errorCode(context.resolvePath("")), "INVALID_PATH");
});

test("collection contexts isolate relative scopes while retaining absolute access", () => {
  const root = DataContext.root(snapshot);
  const ada = ok(root.createCollectionItemContext("/users", 0));
  const grace = ok(root.createCollectionItemContext("/users", 1));
  assert.equal(ada.scopePath, "/users/0");
  assert.equal(ada.collectionIndex, 0);
  assert.equal(ok(ada.get("name")), "Ada");
  assert.equal(ok(grace.get("name")), "Grace");
  assert.equal(ok(ada.get("/company")), "Acme");
  assert.equal(ok(grace.get("/company")), "Acme");
  assert.equal(ok(ada.get("address/city")), undefined);
});

test("nested relative collections compose exact scope paths", () => {
  const group = ok(DataContext.root(snapshot).createCollectionItemContext("/groups", 0));
  const member = ok(group.createCollectionItemContext("members", 0));
  assert.equal(member.scopePath, "/groups/0/members/0");
  assert.equal(member.collectionIndex, 0);
  assert.equal(ok(member.get("name")), "Ada");
  assert.equal(ok(group.get("name")), "A");
});

test("collection creation reports expected progressive and index errors", () => {
  const root = DataContext.root(snapshot);
  assert.equal(errorCode(root.createCollectionItemContext("/missing", 0)), "COLLECTION_NOT_FOUND");
  assert.equal(errorCode(root.createCollectionItemContext("/notArray", 0)), "COLLECTION_NOT_ARRAY");
  for (const index of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(errorCode(root.createCollectionItemContext("/users", index)), "INVALID_COLLECTION_INDEX");
  }
  assert.equal(errorCode(root.createCollectionItemContext("/users", 2)), "COLLECTION_INDEX_OUT_OF_RANGE");
});

test("absolute and relative paths share pointer escaping semantics", () => {
  const context = ok(DataContext.root(snapshot).createCollectionItemContext("/users", 0));
  assert.equal(ok(context.get("a~1b")), "slash");
  assert.equal(ok(context.get("m~0n")), "tilde");
  assert.equal(ok(context.get("/users/0/a~1b")), "slash");
  assert.equal(errorCode(context.get("bad~2key")), "INVALID_POINTER_ESCAPE");
});

test("bindings resolve values and expose absolute write-preparation paths", () => {
  const root = DataContext.root(snapshot);
  const child = ok(root.createCollectionItemContext("/users", 0));
  assert.equal(ok(root.resolveBinding({ path: "/company" })), "Acme");
  assert.equal(ok(child.resolveBinding({ path: "/company" })), "Acme");
  assert.equal(ok(child.resolveBinding({ path: "name" })), "Ada");
  assert.equal(ok(child.resolveBindingPath({ path: "name" })), "/users/0/name");
  assert.equal(ok(child.resolvePath("/company")), "/company");
});

test("path binding detection is strict and excludes function calls", () => {
  assert.equal(isDataPathBinding({ path: "/company" }), true);
  assert.equal(isDataPathBinding({ path: "name", extra: true }), false);
  assert.equal(isDataPathBinding({ call: "formatString", args: {} }), false);
});

test("child reads are defensive and cannot affect parent or sibling contexts", () => {
  const root = DataContext.root(snapshot);
  const first = ok(root.createCollectionItemContext("/users", 0));
  const second = ok(root.createCollectionItemContext("/users", 1));
  const firstValue = ok(first.get("/users")) as Array<{ name: string }>;
  firstValue[0]!.name = "changed";
  assert.equal(ok(first.get("name")), "Ada");
  assert.equal(ok(second.get("name")), "Grace");
  assert.equal(ok(root.get("/users/0/name")), "Ada");
});

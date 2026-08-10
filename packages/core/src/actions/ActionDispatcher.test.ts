import assert from "node:assert/strict";
import { test } from "node:test";
import { CatalogRegistry } from "../catalog/index.js";
import { CheckEvaluator } from "../checks/index.js";
import type { ResolvedComponentInstance } from "../component-instances/index.js";
import { FunctionEvaluator, FunctionRegistry } from "../functions/index.js";
import type { JsonObject, JsonValue } from "../protocol/index.js";
import type { SurfaceSnapshot } from "../surfaces/index.js";
import { ActionDispatcher } from "./ActionDispatcher.js";

const fn = (name: string, returnType: string): JsonObject => ({ type: "object", properties: { call: { const: name }, args: { type: "object" }, returnType: { const: returnType } }, required: ["call", "args"], additionalProperties: false });
function schema(id: string): JsonObject {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema", catalogId: id,
    components: { Button: { type: "object", allOf: [{ $ref: "common_types.json#/$defs/Checkable" }], properties: { id: { type: "string" }, component: { const: "Button" }, primaryAction: { $ref: "common_types.json#/$defs/Action" }, checks: { type: "array" } }, required: ["id", "component"], additionalProperties: false } },
    functions: { local: fn("local", "any"), noop: fn("noop", "void"), fail: fn("fail", "string"), value: fn("value", "string"), voidContext: fn("voidContext", "void") },
    $defs: { theme: { type: "object" }, common: { $id: "common_types.json", $defs: {
      Checkable: {},
      Action: { oneOf: [
        { type: "object", properties: { functionCall: { type: "object" } }, required: ["functionCall"], additionalProperties: false },
        { type: "object", properties: { event: { type: "object" } }, required: ["event"], additionalProperties: false },
      ] },
    } } },
  };
}
function setup(id = "test", implementations: Record<string, () => unknown> = {}) {
  const catalogs = new CatalogRegistry();
  assert.equal(catalogs.register({ catalogId: id, schema: schema(id) }).ok, true);
  const functions = new FunctionRegistry(catalogs);
  for (const [name, implementation] of Object.entries(implementations)) assert.equal(functions.register({ catalogId: id, name, effect: "pure", implementation }).ok, true);
  const evaluator = new FunctionEvaluator(catalogs, functions);
  return { catalogs, dispatcher: new ActionDispatcher(catalogs, evaluator, new CheckEvaluator(catalogs, evaluator), { now: () => new Date("2025-01-02T03:04:05.000Z") }) };
}
function instance(action: JsonValue, checks?: JsonValue[], scopePath = "/", collectionIndex?: number): ResolvedComponentInstance {
  return { sourceComponentId: "item-button", component: "Button", scopePath, ...(collectionIndex === undefined ? {} : { collectionIndex }), definition: { id: "item-button", component: "Button", primaryAction: action, ...(checks === undefined ? {} : { checks }) }, relationships: [] };
}
function surface(dataModel: JsonValue = {}, sendDataModel = false, catalogId = "test"): SurfaceSnapshot {
  return { surfaceId: "surface-1", catalogId, sendDataModel, components: {}, dataModel };
}
const local = (name = "local") => ({ functionCall: { call: name, args: {} } });
const event = (context: JsonObject = {}) => ({ event: { name: "submit", context } });

test("dispatches local values and void exactly once without outbound data", () => {
  let count = 0;
  const { dispatcher } = setup("test", { local: () => { count++; return { owned: true }; }, noop: () => { count++; } });
  const first = dispatcher.dispatch({ surface: surface(), instance: instance(local()), actionProperty: "primaryAction" });
  assert.deepEqual(first, { ok: true, value: { kind: "localFunction", value: { owned: true } } });
  assert.equal(count, 1);
  const second = dispatcher.dispatch({ surface: surface({}, true), instance: instance(local("noop")), actionProperty: "primaryAction" });
  assert.deepEqual(second, { ok: true, value: { kind: "localFunction", value: undefined } });
  assert.equal(count, 2);
});

test("wraps local failures and validates the requested catalog action property", () => {
  const { dispatcher } = setup("test", { fail: () => { throw new Error("no"); } });
  const failed = dispatcher.dispatch({ surface: surface(), instance: instance(local("fail")), actionProperty: "primaryAction" });
  assert.equal(!failed.ok && failed.error.code, "LOCAL_FUNCTION_FAILED");
  const denied = dispatcher.dispatch({ surface: surface(), instance: instance(local()), actionProperty: "other" });
  assert.equal(!denied.ok && denied.error.code, "ACTION_PROPERTY_NOT_ALLOWED");
  const missing = instance(local()); delete missing.definition.primaryAction;
  const absent = dispatcher.dispatch({ surface: surface(), instance: missing, actionProperty: "primaryAction" });
  assert.equal(!absent.ok && absent.error.code, "ACTION_NOT_FOUND");
});

test("builds exact v0.9.1 event identity, timestamp, scoped context, and optional sync metadata", () => {
  const { dispatcher } = setup();
  const model = { company: { id: "co" }, items: [{ id: "one" }, { id: "two" }] };
  const result = dispatcher.dispatch({ surface: surface(model, true), instance: instance(event({ item: { path: "id" }, company: { path: "/company/id" }, literals: ["path", { path: "not-resolved" }] }), undefined, "/items/1", 1), actionProperty: "primaryAction" });
  assert.equal(result.ok, true);
  if (!result.ok || result.value.kind !== "serverEvent") return;
  assert.deepEqual(result.value.message, { version: "v0.9.1", action: { name: "submit", surfaceId: "surface-1", sourceComponentId: "item-button", timestamp: "2025-01-02T03:04:05.000Z", context: { item: "two", company: "co", literals: ["path", { path: "not-resolved" }] } } });
  assert.deepEqual(result.value.metadata, { a2uiClientDataModel: { version: "v0.9.1", surfaces: { "surface-1": model } } });
  (result.value.message.action.context.literals as JsonValue[]).push("mutated");
  (result.value.metadata!.a2uiClientDataModel.surfaces["surface-1"]!.items as JsonValue[]).push(null);
  assert.equal(model.items.length, 2);
});

test("omits sync metadata, uses fresh snapshots, and rejects non-object sync only for events", () => {
  const { dispatcher } = setup("test", { local: () => "ok" });
  const old = dispatcher.dispatch({ surface: surface({ name: "Ada" }), instance: instance(event({ name: { path: "/name" } })), actionProperty: "primaryAction" });
  const fresh = dispatcher.dispatch({ surface: surface({ name: "Grace" }, true), instance: instance(event({ name: { path: "/name" } })), actionProperty: "primaryAction" });
  assert.equal(old.ok && old.value.kind === "serverEvent" && old.value.metadata, undefined);
  assert.equal(fresh.ok && fresh.value.kind === "serverEvent" && fresh.value.message.action.context.name, "Grace");
  const bad = dispatcher.dispatch({ surface: surface("primitive", true), instance: instance(event()), actionProperty: "primaryAction" });
  assert.equal(!bad.ok && bad.error.code, "CLIENT_DATA_MODEL_NOT_OBJECT");
  assert.equal(dispatcher.dispatch({ surface: surface("primitive", true), instance: instance(local()), actionProperty: "primaryAction" }).ok, true);
});

test("only valid checks dispatch either action path", () => {
  let count = 0;
  const { dispatcher } = setup("test", { local: () => { count++; return "ok"; }, fail: () => { throw new Error(); } });
  const cases: Array<[JsonValue, string]> = [[false, "invalid"], [{ path: "/missing" }, "pending"], [{ call: "fail", args: {} }, "error"]];
  for (const [condition, status] of cases) {
    for (const action of [local(), event()]) {
      const result = dispatcher.dispatch({ surface: surface(), instance: instance(action, [{ condition, message: "blocked" }]), actionProperty: "primaryAction" });
      assert.equal(!result.ok && result.error.code, "ACTION_BLOCKED_BY_CHECKS");
      if (!result.ok && result.error.code === "ACTION_BLOCKED_BY_CHECKS") assert.equal(result.error.checks.status, status);
    }
  }
  assert.equal(count, 0);
  assert.equal(dispatcher.dispatch({ surface: surface(), instance: instance(local(), [{ condition: true, message: "ok" }]), actionProperty: "primaryAction" }).ok, true);
  assert.equal(count, 1);
});

test("keeps function execution isolated by surface catalog", () => {
  const a = setup("a", { local: () => "A" });
  const b = setup("b", { local: () => "B" });
  const ar = a.dispatcher.dispatch({ surface: surface({}, false, "a"), instance: instance(local()), actionProperty: "primaryAction" });
  const br = b.dispatcher.dispatch({ surface: surface({}, false, "b"), instance: instance(local()), actionProperty: "primaryAction" });
  assert.equal(ar.ok && ar.value.kind === "localFunction" && ar.value.value, "A");
  assert.equal(br.ok && br.value.kind === "localFunction" && br.value.value, "B");
});

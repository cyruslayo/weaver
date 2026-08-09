import assert from "node:assert/strict";
import { test } from "node:test";
import { CatalogRegistry } from "../catalog/index.js";
import type { ComponentInstanceSnapshot, ResolvedComponentInstance } from "../component-instances/index.js";
import { DataContext } from "../data-context/index.js";
import { FunctionEvaluator, FunctionRegistry } from "../functions/index.js";
import type { JsonObject, JsonValue } from "../protocol/index.js";
import type { SurfaceSnapshot } from "../surfaces/index.js";
import { CheckEvaluator } from "./CheckEvaluator.js";

const ref = (name: string): JsonObject => ({ $ref: `common_types.json#/$defs/${name}` });
const componentBody = (name: string): JsonObject => ({
  type: "object",
  properties: { id: { type: "string" }, component: { const: name }, checks: { type: "array" } },
  required: ["id", "component"], additionalProperties: false,
});
function schema(catalogId: string, checkable = true): JsonObject {
  const dynamicBoolean = { oneOf: [{ type: "boolean" }, ref("PathBinding"), ref("FunctionCall")] };
  const functionSchema = (name: string, args: JsonObject = {}): JsonObject => ({
    type: "object", properties: {
      call: { const: name }, args: { type: "object", properties: args, additionalProperties: false },
      returnType: { const: "boolean" },
    }, required: ["call", "args"], additionalProperties: false,
  });
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema", catalogId,
    components: {
      Field: checkable ? { allOf: [ref("Checkable"), componentBody("Field")] } : componentBody("Field"),
      Display: componentBody("Display"),
      OtherMixin: { allOf: [{ $ref: "common_types.json#/$defs/Other" }, componentBody("OtherMixin")] },
    },
    functions: {
      nonEmpty: functionSchema("nonEmpty", { value: ref("DynamicValue") }),
      not: functionSchema("not", { value: ref("DynamicBoolean") }),
      missing: functionSchema("missing"), thrower: functionSchema("thrower"), anyResult: {
        type: "object", properties: { call: { const: "anyResult" }, args: { type: "object" }, returnType: { const: "any" } },
        required: ["call", "args"], additionalProperties: false,
      },
    },
    $defs: { theme: { type: "object" }, commonTypes: { $id: "common_types.json", $defs: {
      Checkable: { type: "object", properties: { checks: { type: "array", items: ref("CheckRule") } } },
      Other: { type: "object" },
      CheckRule: { type: "object", properties: { condition: ref("DynamicBoolean"), message: { type: "string" } }, required: ["condition", "message"], additionalProperties: false },
      PathBinding: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
      FunctionCall: { type: "object", properties: { call: { type: "string" }, args: { type: "object" } }, required: ["call", "args"] },
      DynamicBoolean: dynamicBoolean,
      DynamicValue: { oneOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "object" }, { type: "array" }] },
    } } },
  };
}
function setup(data: JsonValue = {}, catalogId = "checks", checkable = true) {
  const catalogs = new CatalogRegistry();
  assert.equal(catalogs.register({ catalogId, schema: schema(catalogId, checkable) }).ok, true);
  const functions = new FunctionRegistry(catalogs);
  const evaluator = new CheckEvaluator(catalogs, new FunctionEvaluator(catalogs, functions));
  return { catalogs, functions, evaluator, data, catalogId };
}
function instance(id: string, checks: unknown[] = [], scopePath = "/", collectionIndex?: number, component = "Field"): ResolvedComponentInstance {
  return { sourceComponentId: id, component, scopePath, ...(collectionIndex === undefined ? {} : { collectionIndex }),
    definition: { id, component, checks } as ResolvedComponentInstance["definition"], relationships: [] };
}
function value<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  assert.equal(result.ok, true); if (!result.ok) throw new Error("expected success"); return result.value;
}
const rule = (condition: unknown, message = "Invalid") => ({ condition, message });

 test("discovers only the direct Checkable mixin and isolates catalogs", () => {
  const first = setup();
  assert.equal(first.catalogs.isComponentCheckable("checks", "Field"), true);
  assert.equal(first.catalogs.isComponentCheckable("checks", "Display"), false);
  assert.equal(first.catalogs.isComponentCheckable("checks", "OtherMixin"), false);
  const secondSchema = schema("other", false);
  assert.equal(first.catalogs.register({ catalogId: "other", schema: secondSchema }).ok, true);
  assert.equal(first.catalogs.isComponentCheckable("other", "Field"), false);
  assert.equal(value(first.evaluator.evaluate("other", instance("x", [rule(false)]), DataContext.root({}))).checkable, false);
});

test("evaluates literals, preserves order/messages, and applies status precedence", () => {
  const { evaluator, catalogId } = setup({ missing: undefined } as unknown as JsonValue);
  const result = value(evaluator.evaluate(catalogId, instance("field", [
    rule(true, "same"), rule({ path: "/missing" }, "pending"), rule(null, "system"), rule(false, "same"),
  ]), DataContext.root({})));
  assert.equal(result.status, "invalid");
  assert.deepEqual(result.checks.map(({ status }) => status), ["passed", "pending", "error", "failed"]);
  assert.deepEqual(result.checks.map(({ message }) => message), ["same", "pending", "system", "same"]);
  assert.equal(result.checks[2]?.issues[0]?.code, "CHECK_CONDITION_TYPE_MISMATCH");
});

test("keeps pending, error, valid, no-check, and non-checkable states distinct", () => {
  const { evaluator, catalogId } = setup();
  assert.equal(value(evaluator.evaluate(catalogId, instance("p", [rule(true), rule({ path: "/gone" })]), DataContext.root({}))).status, "pending");
  assert.equal(value(evaluator.evaluate(catalogId, instance("e", [rule(true), rule(null), rule({ path: "/gone" })]), DataContext.root({}))).status, "error");
  assert.equal(value(evaluator.evaluate(catalogId, instance("v", [rule(true)]), DataContext.root({}))).status, "valid");
  assert.deepEqual(value(evaluator.evaluate(catalogId, instance("n"), DataContext.root({}))).checks, []);
  const display = value(evaluator.evaluate(catalogId, instance("d", [rule(false)], "/", undefined, "Display"), DataContext.root({})));
  assert.deepEqual({ checkable: display.checkable, status: display.status, checks: display.checks }, { checkable: false, status: "valid", checks: [] });
});

test("rejects null and all non-boolean bound types without coercion", () => {
  const data = { values: [null, "false", 1, {}, []] };
  const { evaluator, catalogId } = setup(data);
  for (let index = 0; index < data.values.length; index += 1) {
    const check = value(evaluator.evaluate(catalogId, instance("x", [rule({ path: `/values/${index}` })]), DataContext.root(data))).checks[0]!;
    assert.equal(check.status, "error");
    assert.equal(check.issues[0]?.code, "CHECK_CONDITION_TYPE_MISMATCH");
  }
});

test("evaluates function bindings and nested calls through FunctionEvaluator", () => {
  const data = { items: [{ name: "" }, { name: "Ada" }] };
  const { evaluator, functions, catalogId } = setup(data);
  assert.equal(functions.register({ catalogId, name: "nonEmpty", implementation: ({ value }) => typeof value === "string" && value.length > 0 }).ok, true);
  assert.equal(functions.register({ catalogId, name: "not", implementation: ({ value }) => !value }).ok, true);
  const root = DataContext.root(data);
  for (const [index, expected] of [false, true].entries()) {
    const context = value(root.createCollectionItemContext("/items", index));
    const result = value(evaluator.evaluate(catalogId, instance("item", [rule({ call: "nonEmpty", args: { value: { path: "name" } } })], `/items/${index}`, index), context));
    assert.equal(result.checks[0]?.status, expected ? "passed" : "failed");
  }
  const nested = value(evaluator.evaluate(catalogId, instance("nested", [rule({ call: "not", args: { value: { call: "nonEmpty", args: { value: "" } } } })]), root));
  assert.equal(nested.checks[0]?.status, "passed");
});

test("wraps function failures and enforces a boolean final result", () => {
  const { evaluator, functions, catalogId } = setup();
  let check = value(evaluator.evaluate(catalogId, instance("x", [rule({ call: "missing", args: {} })]), DataContext.root({}))).checks[0]!;
  assert.equal(check.status, "error");
  assert.equal(check.issues[0]?.code, "CHECK_FUNCTION_EVALUATION_FAILED");
  if (check.issues[0]?.code === "CHECK_FUNCTION_EVALUATION_FAILED") assert.equal(check.issues[0].error.code, "FUNCTION_IMPLEMENTATION_NOT_FOUND");
  assert.equal(functions.register({ catalogId, name: "missing", implementation: () => true }).ok, true);
  assert.equal(value(evaluator.evaluate(catalogId, instance("x", [rule({ call: "missing", args: {} })]), DataContext.root({}))).checks[0]?.status, "passed");
  assert.equal(functions.register({ catalogId, name: "thrower", implementation: () => { throw new Error("boom"); } }).ok, true);
  check = value(evaluator.evaluate(catalogId, instance("x", [rule({ call: "thrower", args: {} })]), DataContext.root({}))).checks[0]!;
  assert.equal(check.status, "error");
  assert.equal(functions.register({ catalogId, name: "anyResult", implementation: () => "true" }).ok, true);
  check = value(evaluator.evaluate(catalogId, instance("x", [rule({ call: "anyResult", args: {} })]), DataContext.root({}))).checks[0]!;
  assert.equal(check.issues[0]?.code, "CHECK_CONDITION_TYPE_MISMATCH");
});

test("tree evaluation preserves traversal and independent nested scopes", () => {
  const data = { form: { enabled: true }, groups: [{ members: [{ valid: false }, { valid: true }] }] };
  const { evaluator, catalogId } = setup(data);
  const member0 = instance("item-field", [rule({ path: "valid" }), rule({ path: "/form/enabled" })], "/groups/0/members/0", 0);
  const member1 = instance("item-field", [rule({ path: "valid" })], "/groups/0/members/1", 1);
  const group = instance("group", [], "/groups/0", 0);
  group.relationships = [{ kind: "template", property: "members", location: [{ kind: "property", name: "members" }], collectionPath: "members", children: [member0, member1] }];
  const root = instance("root");
  root.relationships = [{ kind: "template", property: "groups", location: [{ kind: "property", name: "groups" }], collectionPath: "/groups", children: [group] }];
  const tree: ComponentInstanceSnapshot = { ready: true, root, issues: [] };
  const surface: SurfaceSnapshot = { surfaceId: "s", catalogId, sendDataModel: false, components: {}, dataModel: data };
  const result = value(evaluator.evaluateTree(surface, tree));
  assert.deepEqual(result.components.map(({ sourceComponentId, scopePath, status }) => [sourceComponentId, scopePath, status]), [
    ["root", "/", "valid"], ["group", "/groups/0", "valid"],
    ["item-field", "/groups/0/members/0", "invalid"], ["item-field", "/groups/0/members/1", "valid"],
  ]);
});

test("re-evaluation uses current data and returned arrays cannot mutate definitions", () => {
  const source = [rule({ path: "/valid" }, "Exact")];
  const { evaluator, catalogId } = setup();
  const target = instance("x", source);
  const first = value(evaluator.evaluate(catalogId, target, DataContext.root({ valid: false })));
  first.checks.push({ index: 9, status: "failed", message: "injected", issues: [] });
  first.checks[0]!.issues.push({ code: "CHECK_CONDITION_TYPE_MISMATCH", expected: "boolean", actual: "x" });
  assert.equal(source.length, 1);
  const second = value(evaluator.evaluate(catalogId, target, DataContext.root({ valid: true })));
  assert.equal(second.status, "valid");
  assert.equal(second.checks[0]?.message, "Exact");
  assert.deepEqual(second.checks[0]?.issues, []);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { CatalogRegistry } from "../catalog/index.js";
import type { ComponentInstanceSnapshot, ResolvedComponentInstance } from "../component-instances/index.js";
import { DataContext } from "../data-context/index.js";
import { FunctionEvaluator, FunctionRegistry } from "../functions/index.js";
import { catalogDocument, componentSchema, functionSchema, ref } from "../functions/catalogFixtures.test-helper.js";
import type { JsonObject, JsonValue } from "../protocol/index.js";
import type { SurfaceSnapshot } from "../surfaces/index.js";
import { CheckEvaluator } from "./CheckEvaluator.js";

function schema(catalogId: string): JsonObject {
  return catalogDocument(catalogId, {
    Field: componentSchema("Field", {}, { checkable: true }),
    Display: componentSchema("Display", {}),
  }, {
    nonEmpty: functionSchema("nonEmpty", { returnType: "boolean", args: { value: ref("DynamicValue") } }),
    not: functionSchema("not", { returnType: "boolean", args: { value: ref("DynamicBoolean") } }),
    validate: functionSchema("validate", { returnType: "validationResult", args: { value: ref("DynamicValue") } }),
    missing: functionSchema("missing", { returnType: "boolean" }),
    thrower: functionSchema("thrower", { returnType: "boolean" }),
    anyResult: functionSchema("anyResult", { returnType: "any" }),
  });
}

function setup(data: JsonValue = {}, catalogId = "checks") {
  const catalogs = new CatalogRegistry();
  assert.equal(catalogs.register({ catalogId, schema: schema(catalogId) }).ok, true);
  const functions = new FunctionRegistry(catalogs);
  const evaluator = new CheckEvaluator(catalogs, new FunctionEvaluator(catalogs, functions));
  return { catalogs, functions, evaluator, data, catalogId };
}

function instance(id: string, checks: unknown[] = [], scopePath = "/", collectionIndex?: number, component = "Field"): ResolvedComponentInstance {
  return {
    sourceComponentId: id,
    component,
    scopePath,
    ...(collectionIndex === undefined ? {} : { collectionIndex }),
    definition: { component, "@checks": checks } as unknown as ResolvedComponentInstance["definition"],
    relationships: [],
  };
}

function value<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected success");
  return result.value;
}

const rule = (condition: unknown, message?: string) => (message === undefined ? { condition } : { condition, message });

test("discovers only components that declare the Checkable mixin, per catalog", () => {
  const first = setup();
  assert.equal(first.catalogs.isComponentCheckable("checks", "Field"), true);
  assert.equal(first.catalogs.isComponentCheckable("checks", "Display"), false);
  const second = new CatalogRegistry();
  assert.equal(second.register({ catalogId: "plain", schema: catalogDocument("plain", { Field: componentSchema("Field", {}) }) }).ok, true);
  assert.equal(second.isComponentCheckable("plain", "Field"), false);
  assert.equal(value(first.evaluator.evaluate("checks", instance("d", [rule({ "@path": "/x" })], "/", undefined, "Display"), DataContext.root({}))).checkable, false);
});

test("literal conditions are not CheckRule conditions and fail as type mismatches", () => {
  const { evaluator, catalogId } = setup();
  for (const literal of [true, false, null, "true", 1]) {
    const check = value(evaluator.evaluate(catalogId, instance("field", [rule(literal, "Nope")]), DataContext.root({}))).checks[0]!;
    assert.equal(check.status, "error");
    assert.equal(check.issues[0]?.code, "CHECK_CONDITION_TYPE_MISMATCH");
  }
});

test("a boolean binding passes or fails with the CheckRule message", () => {
  const data = { ok: true, no: false };
  const { evaluator, catalogId } = setup(data);
  const result = value(evaluator.evaluate(catalogId, instance("field", [
    rule({ "@path": "/ok" }, "Fine"), rule({ "@path": "/no" }, "Bad"),
  ]), DataContext.root(data)));
  assert.deepEqual(result.checks.map(({ status, message, severity }) => [status, message, severity]), [
    ["passed", "Fine", "error"], ["failed", "Bad", "error"],
  ]);
  assert.equal(result.status, "invalid");
});

test("a ValidationResult condition supplies its own message, code, and severity", () => {
  const data = { result: { valid: false, code: "TOO_SHORT", message: "Too short.", severity: "error" } };
  const { evaluator, catalogId } = setup(data);
  const check = value(evaluator.evaluate(catalogId, instance("field", [rule({ "@path": "/result" }, "Fallback")]), DataContext.root(data))).checks[0]!;
  assert.deepEqual({ status: check.status, message: check.message, code: check.code, severity: check.severity }, {
    status: "failed", message: "Too short.", code: "TOO_SHORT", severity: "error",
  });
});

test("the CheckRule message is the fallback when a ValidationResult omits its own", () => {
  const data = { result: { valid: false } };
  const { evaluator, catalogId } = setup(data);
  const check = value(evaluator.evaluate(catalogId, instance("field", [rule({ "@path": "/result" }, "Fallback")]), DataContext.root(data))).checks[0]!;
  assert.equal(check.message, "Fallback");
  assert.equal(check.severity, "error");
});

test("warning and info results are advisory and do not block the component", () => {
  const data = {
    warn: { valid: false, message: "Password could be stronger.", severity: "warning" },
    note: { valid: false, message: "Consider adding symbols.", severity: "info" },
  };
  const { evaluator, catalogId } = setup(data);
  const result = value(evaluator.evaluate(catalogId, instance("field", [rule({ "@path": "/warn" }), rule({ "@path": "/note" })]), DataContext.root(data)));
  assert.deepEqual(result.checks.map(({ status, message, severity }) => [status, message, severity]), [
    ["advisory", "Password could be stronger.", "warning"],
    ["advisory", "Consider adding symbols.", "info"],
  ]);
  assert.equal(result.status, "valid");
});

test("a valid ValidationResult passes regardless of severity", () => {
  const data = { result: { valid: true, severity: "warning", message: "Heads up" } };
  const { evaluator, catalogId } = setup(data);
  const check = value(evaluator.evaluate(catalogId, instance("field", [rule({ "@path": "/result" })]), DataContext.root(data))).checks[0]!;
  assert.equal(check.status, "passed");
});

test("status precedence is failed over error over pending over valid", () => {
  const { evaluator, catalogId } = setup({ bad: false });
  const status = (checks: unknown[]) => value(evaluator.evaluate(catalogId, instance("x", checks), DataContext.root({ bad: false }))).status;
  assert.equal(status([rule({ "@path": "/bad" }), rule({ "@path": "/gone" })]), "invalid");
  assert.equal(status([rule({ "@path": "/gone" }), rule({ "@path": "/nested/x" }), rule({ "@path": "/bad" })]), "invalid");
  assert.equal(status([rule({ "@call": "thrower", args: {} }), rule({ "@path": "/gone" })]), "error");
  assert.equal(status([rule({ "@path": "/gone" })]), "pending");
  assert.equal(status([]), "valid");
});

test("an absent binding is pending, while null is a type error", () => {
  const data = { missing: null };
  const { evaluator, catalogId } = setup(data);
  const pending = value(evaluator.evaluate(catalogId, instance("p", [rule({ "@path": "/gone" })]), DataContext.root(data))).checks[0]!;
  assert.equal(pending.status, "pending");
  const nullCheck = value(evaluator.evaluate(catalogId, instance("n", [rule({ "@path": "/missing" })]), DataContext.root(data))).checks[0]!;
  assert.equal(nullCheck.status, "error");
  assert.equal(nullCheck.issues[0]?.code, "CHECK_CONDITION_TYPE_MISMATCH");
});

test("a non-checkable component reports no checks even when it carries @checks", () => {
  const { evaluator, catalogId } = setup();
  const display = value(evaluator.evaluate(catalogId, instance("d", [rule({ "@path": "/x" })], "/", undefined, "Display"), DataContext.root({})));
  assert.deepEqual({ checkable: display.checkable, status: display.status, checks: display.checks }, { checkable: false, status: "valid", checks: [] });
});

test("function conditions evaluate through FunctionEvaluator, including nested calls and collection scopes", () => {
  const data = { items: [{ name: "" }, { name: "Ada" }] };
  const { evaluator, functions, catalogId } = setup(data);
  assert.equal(functions.register({ catalogId, name: "nonEmpty", effect: "pure", implementation: ({ value }) => typeof value === "string" && value.length > 0 }).ok, true);
  assert.equal(functions.register({ catalogId, name: "not", effect: "pure", implementation: ({ value }) => !value }).ok, true);
  const root = DataContext.root(data);
  for (const [index, expected] of [false, true].entries()) {
    const context = value(root.createCollectionItemContext("/items", index));
    const result = value(evaluator.evaluate(catalogId, instance("item", [rule({ "@call": "nonEmpty", args: { value: { "@path": "name" } } })], `/items/${index}`, index), context));
    assert.equal(result.checks[0]?.status, expected ? "passed" : "failed");
  }
  const nested = value(evaluator.evaluate(catalogId, instance("nested", [rule({ "@call": "not", args: { value: { "@call": "nonEmpty", args: { value: "" } } } })]), root));
  assert.equal(nested.checks[0]?.status, "passed");
});

test("a validation function returning a ValidationResult feeds the same coercion as a binding", () => {
  const { evaluator, functions, catalogId } = setup();
  assert.equal(functions.register({ catalogId, name: "validate", effect: "pure", implementation: ({ value }) => ({ valid: value === "ok", code: "BAD", message: "Not ok." }) }).ok, true);
  const bad = value(evaluator.evaluate(catalogId, instance("x", [rule({ "@call": "validate", args: { value: "no" } }, "Fallback")]), DataContext.root({}))).checks[0]!;
  assert.deepEqual({ status: bad.status, message: bad.message, code: bad.code }, { status: "failed", message: "Not ok.", code: "BAD" });
});

test("failed functions are reported as error checks and a boolean final result is required", () => {
  const { evaluator, functions, catalogId } = setup();
  let check = value(evaluator.evaluate(catalogId, instance("x", [rule({ "@call": "missing", args: {} })]), DataContext.root({}))).checks[0]!;
  assert.equal(check.status, "error");
  assert.equal(check.issues[0]?.code, "CHECK_FUNCTION_EVALUATION_FAILED");
  if (check.issues[0]?.code === "CHECK_FUNCTION_EVALUATION_FAILED") assert.equal(check.issues[0].error.code, "EXPRESSION_ERROR");
  assert.equal(functions.register({ catalogId, name: "missing", effect: "pure", implementation: () => true }).ok, true);
  assert.equal(value(evaluator.evaluate(catalogId, instance("x", [rule({ "@call": "missing", args: {} })]), DataContext.root({}))).checks[0]?.status, "passed");
  assert.equal(functions.register({ catalogId, name: "thrower", effect: "pure", implementation: () => { throw new Error("boom"); } }).ok, true);
  check = value(evaluator.evaluate(catalogId, instance("x", [rule({ "@call": "thrower", args: {} })]), DataContext.root({}))).checks[0]!;
  assert.equal(check.status, "error");
  assert.equal(functions.register({ catalogId, name: "anyResult", effect: "pure", implementation: () => "true" }).ok, true);
  check = value(evaluator.evaluate(catalogId, instance("x", [rule({ "@call": "anyResult", args: {} })]), DataContext.root({}))).checks[0]!;
  assert.equal(check.issues[0]?.code, "CHECK_CONDITION_TYPE_MISMATCH");
});

test("tree evaluation preserves traversal and independent nested scopes", () => {
  const data = { form: { enabled: true }, groups: [{ members: [{ valid: false }, { valid: true }] }] };
  const { evaluator, catalogId } = setup(data);
  const member0 = instance("item-field", [rule({ "@path": "valid" }), rule({ "@path": "/form/enabled" })], "/groups/0/members/0", 0);
  const member1 = instance("item-field", [rule({ "@path": "valid" })], "/groups/0/members/1", 1);
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
  const source = [rule({ "@path": "/valid" }, "Exact")];
  const { evaluator, catalogId } = setup();
  const target = instance("x", source);
  const first = value(evaluator.evaluate(catalogId, target, DataContext.root({ valid: false })));
  first.checks.push({ index: 9, status: "failed", message: "injected", severity: "error", issues: [] });
  first.checks[0]!.issues.push({ code: "CHECK_CONDITION_TYPE_MISMATCH", expected: "ValidationResult", actual: "x" });
  assert.equal(source.length, 1);
  const second = value(evaluator.evaluate(catalogId, target, DataContext.root({ valid: true })));
  assert.equal(second.status, "valid");
  assert.equal(second.checks[0]?.message, "Exact");
  assert.deepEqual(second.checks[0]?.issues, []);
});

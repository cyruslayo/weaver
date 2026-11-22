import assert from "node:assert/strict";
import { test } from "node:test";

import { createBasicCatalogV10Registration } from "../basic-catalog/index.js";
import { createBasicCatalogFunctionImplementations } from "../basic-functions/index.js";
import type { CatalogRegistration } from "../catalog/index.js";
import type { FunctionRegistration } from "../functions/index.js";
import type { JsonObject, JsonValue } from "../protocol/index.js";
import { CatalogRegistry } from "../catalog/index.js";
import { DataContext } from "../data-context/index.js";
import { FunctionEvaluator, FunctionRegistry } from "../functions/index.js";
import { AgentFunctionBroker } from "./index.js";
import { createA2UITransportSession } from "../transport/session/index.js";
import { createWeaverRuntime, type WeaverRuntime, type WeaverRuntimeConfig, type WeaverRuntimeObserver } from "../runtime/index.js";
import { createWeaverTraceRecorder, parseWeaverTrace, replayWeaverTrace, type WeaverTrace } from "../trace/index.js";

/*
 * Ported from the pinned A2UI v1.0 conformance cases in
 * conformance/core/agent_function_routing.yaml and the agent-side and rpc_ui_*
 * cases of conformance/core/rpc_functions.yaml. The YAML is not parsed. Each case
 * is written out by hand, with its name kept as the test name.
 *
 * Deviations, each noted at its case:
 * - The surface default catalog is the test catalog, and the Basic functions are
 *   registered under it. Schema-only functions are declared in the catalog and
 *   have no implementation.
 * - Routing is enabled with `agentFunctions`. Without it, a case fails locally.
 * - An undeclared name cannot be routed: updateComponents rejects it before evaluation.
 * - Cases that drive a harness step Core does not expose (cancelSurfaceCalls, a
 *   dispose step, outboundListener) are not ported. They are listed in the report.
 */

const CATALOG = "conformance/routing";

/** A catalog function definition. Untyped argument schemas resolve bindings and nested calls before the call. */
function fn(name: string, returnType: string, allowedCallers: string, args: JsonObject = {}, required: string[] = [], extra: JsonObject = {}): JsonObject {
  return {
    type: "object",
    description: `Test function ${name}.`,
    returnType,
    allowedCallers,
    properties: { "@call": { const: name }, args: { type: "object", properties: args, required } },
    required: ["@call"],
    ...extra,
  } as unknown as JsonObject;
}

/** The Basic catalog under the test id, with the schema-only functions the cases call. */
function routingCatalog(): CatalogRegistration {
  const schema = createBasicCatalogV10Registration().schema as unknown as Record<string, unknown>;
  schema.catalogId = CATALOG;
  schema.$id = `https://example.test/${CATALOG}/catalog.json`;
  const functions = schema.functions as Record<string, JsonObject>;
  Object.assign(functions, {
    fetchFxRate: fn("fetchFxRate", "string", "rendererOnly", { base: {} }, ["base"]),
    fetchCrossRate: fn("fetchCrossRate", "string", "rendererOnly", { base: {}, quote: {} }, ["base", "quote"]),
    fetchGreeting: fn("fetchGreeting", "string", "rendererOnly"),
    fetchRate: fn("fetchRate", "string", "rendererOnly", { id: {} }, ["id"]),
    lookupSku: fn("lookupSku", "object", "rendererOnly", { sku: {} }, ["sku"]),
    isAvailable: fn("isAvailable", "boolean", "rendererOnly", { sku: {} }, ["sku"]),
    checkCoupon: fn("checkCoupon", "validationResult", "rendererOnly", { code: {} }, ["code"]),
    submitOrder: fn("submitOrder", "boolean", "rendererOnly", { id: {} }, ["id"]),
    outerAgent: fn("outerAgent", "any", "rendererOnly", { nested: {}, rate: {}, label: {}, stock: {} }),
    auditLog: fn("auditLog", "void", "agentOnly", {}),
    confirmOrder: fn("confirmOrder", "any", "rendererOnly", {}, [], { requiresUserActivation: true }),
    quote: fn(
      "quote",
      "number",
      "rendererOnly",
      {
        symbol: { type: "string" },
        currency: { type: "string", default: "USD" },
        options: {
          type: "object",
          properties: { extendedHours: { type: "boolean", default: false } },
          additionalProperties: false,
        },
      },
      ["symbol"],
    ),
  });
  return { catalogId: CATALOG, schema: schema as unknown as CatalogRegistration["schema"] };
}

function implementations(): FunctionRegistration[] {
  return createBasicCatalogFunctionImplementations({ catalogId: CATALOG });
}

function createRuntime(options: Partial<WeaverRuntimeConfig> = {}): WeaverRuntime {
  const created = createWeaverRuntime({ catalogs: [routingCatalog()], functions: implementations(), ...options });
  if (!created.ok) throw new Error(`runtime configuration failed: ${JSON.stringify(created.error)}`);
  return created.value;
}

/** Routing enabled. */
function routed(options: Partial<WeaverRuntimeConfig> = {}): WeaverRuntime {
  return createRuntime({ agentFunctions: {}, ...options });
}

function createSurface(runtime: WeaverRuntime, dataModel: JsonObject = {}): void {
  const result = runtime.process({ version: "1.0", createSurface: { surfaceId: "main", catalogId: CATALOG, dataModel } });
  assert.equal(result.ok, true, JSON.stringify(result));
}

/** Replaces the surface's components. `root` is the Text whose text is the expression under test. */
function textComponent(expression: unknown): JsonObject {
  return { id: "root", component: "Text", text: expression as JsonValue } as JsonObject;
}

function mountText(runtime: WeaverRuntime, expression: unknown, dataModel: JsonObject = {}): void {
  createSurface(runtime, dataModel);
  const result = runtime.process({ version: "1.0", updateComponents: { surfaceId: "main", components: [textComponent(expression)] } });
  assert.equal(result.ok, true, JSON.stringify(result));
}

function resolved(runtime: WeaverRuntime) {
  const result = runtime.resolveSurface("main");
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) assert.fail("surface did not resolve");
  return result.value;
}

/** The resolved text of the root. A value that did not resolve (pending or failed) reads as null, as the spec requires. */
function textValue(runtime: WeaverRuntime): JsonValue {
  return (resolved(runtime).tree.root?.properties.text as JsonValue | undefined) ?? null;
}

function propertyErrors(runtime: WeaverRuntime) {
  return resolved(runtime).issues.properties.flatMap((issue) =>
    issue.code === "FUNCTION_EVALUATION_FAILED" ? [issue.error] : [],
  );
}

function respond(runtime: WeaverRuntime, functionCallId: string, body: { value: JsonValue } | { error: { code: string; message: string } }) {
  return runtime.process({ version: "1.0", agentFunctionResponse: { functionCallId, ...body } });
}

/** The single call the host would send next. Fails the test unless exactly one call is queued. */
function takeOne(runtime: WeaverRuntime): { functionCallId: string; message: unknown } {
  const calls = runtime.takeAgentFunctionCalls();
  assert.equal(calls.length, 1, JSON.stringify(calls));
  const [call] = calls;
  return { functionCallId: call!.callAgentFunction.functionCallId, message: call };
}

// --- conformance/core/agent_function_routing.yaml ---------------------------------------------

test("test_agent_routing_undeclared_function_names_resolved_catalog (declared form): a schema-only call is sent with resolved args and the default catalog", () => {
  // Deviation: the pinned case names a function the catalog does not declare. Catalog validation rejects such a name
  // in updateComponents, so this port uses a declared schema-only function. The undeclared form is in the rejection test below.
  const runtime = routed();
  mountText(runtime, { "@call": "fetchFxRate", args: { base: { "@path": "/base" } } }, { base: "EUR" });
  assert.equal(textValue(runtime), null);
  assert.deepEqual(runtime.takeAgentFunctionCalls(), [
    {
      version: "1.0",
      callAgentFunction: {
        surfaceId: "main",
        functionCallId: "agent-call-1",
        callFunction: { "@call": "fetchFxRate", catalogId: CATALOG, args: { base: "EUR" } },
      },
    },
  ]);
  respond(runtime, "agent-call-1", { value: "1.08" });
  assert.equal(textValue(runtime), "1.08");
});

test("test_agent_routing_explicit_catalog_id_is_carried: a call naming the surface catalog is sent with that catalog", () => {
  const runtime = routed();
  mountText(runtime, { "@call": "fetchCrossRate", catalogId: CATALOG, args: { base: "EUR", quote: "USD" } });
  const call = takeOne(runtime);
  assert.deepEqual((call.message as { callAgentFunction: { callFunction: unknown } }).callAgentFunction.callFunction, {
    "@call": "fetchCrossRate",
    catalogId: CATALOG,
    args: { base: "EUR", quote: "USD" },
  });
});

test("test_agent_routing_implemented_function_runs_locally: a locally implemented function sends nothing", () => {
  const runtime = routed();
  mountText(runtime, { "@call": "formatString", args: { value: "Hello" } });
  assert.equal(textValue(runtime), "Hello");
  assert.deepEqual(runtime.takeAgentFunctionCalls(), []);
});

test("test_agent_routing_agent_result_feeds_local_function: a local call waits for its nested agent call, then runs", () => {
  const runtime = routed();
  mountText(runtime, { "@call": "formatString", args: { value: { "@call": "fetchGreeting", args: {} } } });
  assert.equal(textValue(runtime), null);
  const call = takeOne(runtime);
  assert.equal(call.functionCallId, "agent-call-1");
  respond(runtime, "agent-call-1", { value: "Hello" });
  assert.equal(textValue(runtime), "Hello");
});

test("test_agent_routing_agent_error_is_expression_error: an agent error is reported with its message and the value stays null", () => {
  const runtime = routed();
  mountText(runtime, { "@call": "fetchFxRate", args: { base: "EUR" } });
  takeOne(runtime);
  respond(runtime, "agent-call-1", { error: { code: "UNKNOWN_FUNCTION", message: "No such function: fetchFxRate" } });
  assert.equal(textValue(runtime), null);
  const [error] = propertyErrors(runtime);
  assert.equal(error?.code, "EXPRESSION_ERROR");
  assert.equal(error?.message, "No such function: fetchFxRate");
  assert.equal(error?.functionCallId, "agent-call-1");
});

test("test_agent_routing_unknown_catalog_is_catalog_error: a call naming a missing catalog is refused locally and not sent", () => {
  const runtime = routed();
  createSurface(runtime);
  // Deviation: an unregistered call catalogId is refused at ingress (CATALOG_NOT_FOUND), so nothing is stored and nothing is routed.
  const result = runtime.process({
    version: "1.0",
    updateComponents: { surfaceId: "main", components: [textComponent({ "@call": "fetchFxRate", catalogId: "conformance/missing", args: { base: "EUR" } })] },
  });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error.code === "CATALOG_REGISTRY_ERROR" && result.error.catalogError.code, "CATALOG_NOT_FOUND");
  assert.equal(textValue(runtime), null);
  assert.deepEqual(runtime.takeAgentFunctionCalls(), []);
});

test("test_agent_routing_without_outbound_listener_fails_locally: without agentFunctions a schema-only call fails as an EXPRESSION_ERROR that names it", () => {
  // Deviation: the pinned case sets outboundListener false. The equivalent here is a runtime without agentFunctions.
  const runtime = createRuntime();
  mountText(runtime, { "@call": "fetchFxRate", args: { base: "EUR" } });
  assert.equal(textValue(runtime), null);
  const [error] = propertyErrors(runtime);
  assert.equal(error?.code, "EXPRESSION_ERROR");
  assert.ok(error?.message.includes("fetchFxRate"));
  assert.deepEqual(runtime.takeAgentFunctionCalls(), []);
});


test("test_agent_routing_identical_calls_share_one_request: identical reactive calls send one request and both receive the answer", () => {
  const runtime = routed();
  createSurface(runtime);
  const call = { "@call": "fetchFxRate", args: { base: "EUR" } };
  runtime.process({
    version: "1.0",
    updateComponents: {
      surfaceId: "main",
      components: [
        { id: "root", component: "Column", children: ["a", "b"] },
        { id: "a", component: "Text", text: call },
        { id: "b", component: "Text", text: call },
      ],
    },
  });
  assert.equal(runtime.takeAgentFunctionCalls().length, 1);
  respond(runtime, "agent-call-1", { value: "1.08" });
  const properties = resolved(runtime).tree.root?.relationships ?? [];
  assert.equal(JSON.stringify(properties).includes("1.08"), true);
});

test("test_agent_routing_settled_binding_answer_is_cached_on_surface: a settled answer is reused without a second request", () => {
  const runtime = routed();
  mountText(runtime, { "@call": "fetchFxRate", args: { base: "EUR" } });
  takeOne(runtime);
  respond(runtime, "agent-call-1", { value: "1.08" });
  assert.equal(textValue(runtime), "1.08");
  // Resolving again reuses the settled answer.
  assert.equal(textValue(runtime), "1.08");
  assert.deepEqual(runtime.takeAgentFunctionCalls(), []);
});

test("test_agent_routing_argument_key_order_is_canonical: argument objects with the same keys in another order share one request", () => {
  const runtime = routed();
  mountText(runtime, { "@call": "fetchCrossRate", args: { base: "EUR", quote: "USD" } });
  const second = runtime.process({
    version: "1.0",
    updateComponents: { surfaceId: "main", components: [{ id: "root", component: "Text", text: { "@call": "fetchCrossRate", args: { quote: "USD", base: "EUR" } } }] },
  });
  assert.equal(second.ok, true);
  assert.equal(runtime.takeAgentFunctionCalls().length, 1);
});

test("test_agent_routing_action_calls_never_share_or_cache: actions send a new call every time and never read the surface cache", () => {
  const runtime = routed();
  const action = (id: string) => ({ id: "root", component: "Button", child: "label", action: { functionCall: { "@call": "submitOrder", args: { id } } } });
  createSurface(runtime);
  runtime.process({ version: "1.0", updateComponents: { surfaceId: "main", components: [action("o-1"), { id: "label", component: "Text", text: "Go" }] } });
  const first = runtime.dispatchAction({ surfaceId: "main", sourceComponentId: "root", scopePath: "/", actionProperty: "action", userActivation: true });
  const second = runtime.dispatchAction({ surfaceId: "main", sourceComponentId: "root", scopePath: "/", actionProperty: "action", userActivation: true });
  assert.equal(first.ok && first.value.kind, "agentFunctionCalls");
  assert.equal(second.ok && second.value.kind, "agentFunctionCalls");
  if (!first.ok || first.value.kind !== "agentFunctionCalls" || !second.ok || second.value.kind !== "agentFunctionCalls") assert.fail();
  assert.equal(first.value.messages.length, 1);
  assert.equal(second.value.messages.length, 1);
  assert.notEqual(
    first.value.messages[0]!.callAgentFunction.functionCallId,
    second.value.messages[0]!.callAgentFunction.functionCallId,
  );
});

test("test_agent_routing_check_rule_passes: a check waiting on an agent call is pending, then passes when the agent answers true", () => {
  const runtime = routed();
  createSurface(runtime);
  runtime.process({
    version: "1.0",
    updateComponents: {
      surfaceId: "main",
      components: [{ id: "root", component: "TextField", label: "SKU", value: "A-1", "@checks": [{ condition: { "@call": "isAvailable", args: { sku: "A-1" } }, message: "Out of stock" }] }],
    },
  });
  const checkStatus = () => resolved(runtime).checks.components[0]?.checks[0]?.status;
  assert.equal(checkStatus(), "pending");
  takeOne(runtime);
  respond(runtime, "agent-call-1", { value: true });
  assert.equal(checkStatus(), "passed");
});

test("test_agent_routing_check_rule_fails: a check fails when the agent answers false, with the rule message", () => {
  const runtime = routed();
  createSurface(runtime);
  runtime.process({
    version: "1.0",
    updateComponents: {
      surfaceId: "main",
      components: [{ id: "root", component: "TextField", label: "SKU", value: "B-2", "@checks": [{ condition: { "@call": "isAvailable", args: { sku: "B-2" } }, message: "Out of stock" }] }],
    },
  });
  takeOne(runtime);
  respond(runtime, "agent-call-1", { value: false });
  const check = resolved(runtime).checks.components[0]?.checks[0];
  assert.equal(check?.status, "failed");
  assert.equal(check?.message, "Out of stock");
});

test("test_agent_routing_action_function_call: an action sends its functionCall and a value response completes it", () => {
  const runtime = routed();
  createSurface(runtime);
  runtime.process({
    version: "1.0",
    updateComponents: {
      surfaceId: "main",
      components: [
        { id: "root", component: "Button", child: "label", action: { functionCall: { "@call": "submitOrder", args: { id: "o-1" } } } },
        { id: "label", component: "Text", text: "Go" },
      ],
    },
  });
  const dispatched = runtime.dispatchAction({ surfaceId: "main", sourceComponentId: "root", scopePath: "/", actionProperty: "action", userActivation: true });
  assert.equal(dispatched.ok && dispatched.value.kind, "agentFunctionCalls");
  if (!dispatched.ok || dispatched.value.kind !== "agentFunctionCalls") assert.fail();
  const [message] = dispatched.value.messages;
  assert.equal(message?.callAgentFunction.callFunction["@call"], "submitOrder");
  const answered = respond(runtime, message!.callAgentFunction.functionCallId, { value: true });
  assert.equal(answered.ok && answered.value.operation, "agentFunctionResolved");
  if (!answered.ok || answered.value.operation !== "agentFunctionResolved") assert.fail();
  assert.deepEqual(answered.value.action, { ok: true, value: { kind: "localFunction", value: true } });
});

test("test_agent_routing_action_agent_error_is_expression_error: an agent error stops the action with EXPRESSION_ERROR and its call id", () => {
  const runtime = routed();
  createSurface(runtime);
  runtime.process({
    version: "1.0",
    updateComponents: {
      surfaceId: "main",
      components: [
        { id: "root", component: "Button", child: "label", action: { functionCall: { "@call": "submitOrder", args: { id: "o-1" } } } },
        { id: "label", component: "Text", text: "Go" },
      ],
    },
  });
  const dispatched = runtime.dispatchAction({ surfaceId: "main", sourceComponentId: "root", scopePath: "/", actionProperty: "action", userActivation: true });
  if (!dispatched.ok || dispatched.value.kind !== "agentFunctionCalls") assert.fail();
  const [message] = dispatched.value.messages;
  const answered = respond(runtime, message!.callAgentFunction.functionCallId, { error: { code: "EXECUTION_ERROR", message: "Order o-1 was rejected" } });
  assert.equal(answered.ok && answered.value.operation, "agentFunctionResolved");
  if (!answered.ok || answered.value.operation !== "agentFunctionResolved") assert.fail();
  const action = answered.value.action;
  assert.ok(action !== undefined && !action.ok);
  if (action === undefined || action.ok) assert.fail();
  const cause = JSON.stringify(action.error);
  assert.ok(cause.includes("EXPRESSION_ERROR") && cause.includes("Order o-1 was rejected") && cause.includes(message!.callAgentFunction.functionCallId));
});

test("test_agent_routing_schema_only_function_sends_parsed_arguments: schema defaults, including nested object defaults, are applied before sending", () => {
  const runtime = routed();
  mountText(runtime, { "@call": "quote", args: { symbol: "GOOG", options: {} } });
  const call = takeOne(runtime);
  assert.deepEqual((call.message as { callAgentFunction: { callFunction: unknown } }).callAgentFunction.callFunction, {
    "@call": "quote",
    catalogId: CATALOG,
    args: { symbol: "GOOG", currency: "USD", options: { extendedHours: false } },
  });
  respond(runtime, call.functionCallId, { value: "180" });
  assert.equal(textValue(runtime), "180");
});


test("test_agent_routing_schema_only_function_requires_user_activation: refused from a binding, sent from an action with a gesture", () => {
  const runtime = routed();
  mountText(runtime, { "@call": "confirmOrder", args: {} });
  const [error] = propertyErrors(runtime);
  assert.equal(error?.code, "EXPRESSION_ERROR");
  assert.ok(error?.message.includes("requires"));
  assert.deepEqual(runtime.takeAgentFunctionCalls(), []);
  runtime.process({
    version: "1.0",
    updateComponents: {
      surfaceId: "main",
      components: [
        { id: "root", component: "Button", child: "label", action: { functionCall: { "@call": "confirmOrder", args: {} } } },
        { id: "label", component: "Text", text: "Go" },
      ],
    },
  });
  const dispatched = runtime.dispatchAction({ surfaceId: "main", sourceComponentId: "root", scopePath: "/", actionProperty: "action", userActivation: true });
  assert.equal(dispatched.ok && dispatched.value.kind, "agentFunctionCalls");
});

test("test_agent_routing_failed_agent_argument_stops_enclosing_function: a failed nested call stops the outer call, which is not sent", () => {
  const runtime = routed();
  mountText(runtime, { "@call": "outerAgent", args: { nested: { "@call": "fetchFxRate", args: { base: "EUR" } } } });
  assert.equal(takeOne(runtime).functionCallId, "agent-call-1");
  respond(runtime, "agent-call-1", { error: { code: "EXECUTION_ERROR", message: "Rate feed offline" } });
  assert.equal(textValue(runtime), null);
  assert.deepEqual(runtime.takeAgentFunctionCalls(), []);
  assert.equal(propertyErrors(runtime)[0]?.message, "Rate feed offline");
});

test("test_agent_routing_sibling_agent_arguments_are_sent_together: sibling agent calls are both sent before either is answered", () => {
  const runtime = routed();
  mountText(runtime, {
    "@call": "outerAgent",
    args: { rate: { "@call": "fetchFxRate", args: { base: "EUR" } }, stock: { "@call": "lookupSku", args: { sku: "A-1" } } },
  });
  const calls = runtime.takeAgentFunctionCalls();
  assert.deepEqual(calls.map((call) => call.callAgentFunction.callFunction["@call"]).sort(), ["fetchFxRate", "lookupSku"]);
  respond(runtime, calls[0]!.callAgentFunction.functionCallId, { error: { code: "EXECUTION_ERROR", message: "Sibling lookup failed" } });
  respond(runtime, calls[1]!.callAgentFunction.functionCallId, { value: { inStock: 3 } });
  assert.equal(textValue(runtime), null);
  assert.equal(propertyErrors(runtime)[0]?.message, "Sibling lookup failed");
});

test("test_agent_routing_pending_check_rule_is_not_failing: a pending check is not failing and fails with its error once answered", () => {
  const runtime = routed();
  createSurface(runtime);
  runtime.process({
    version: "1.0",
    updateComponents: {
      surfaceId: "main",
      components: [{ id: "root", component: "TextField", label: "SKU", value: "A-1", "@checks": [{ condition: { "@call": "isAvailable", args: { sku: "A-1" } }, message: "Out of stock" }] }],
    },
  });
  assert.equal(resolved(runtime).checks.components[0]?.checks[0]?.status, "pending");
  const call = takeOne(runtime);
  respond(runtime, call.functionCallId, { error: { code: "EXECUTION_ERROR", message: "Inventory service unavailable" } });
  assert.equal(resolved(runtime).checks.components[0]?.checks[0]?.status, "error");
});

test("test_agent_routing_failed_call_is_resent_only_when_its_arguments_change: an unrelated change does not resend a failed call", () => {
  const runtime = routed();
  mountText(runtime, { "@call": "fetchFxRate", args: { base: { "@path": "/base" } } }, { base: "EUR", label: "Rate" });
  takeOne(runtime);
  respond(runtime, "agent-call-1", { error: { code: "EXECUTION_ERROR", message: "Rate feed offline" } });
  const label = runtime.process({ version: "1.0", updateDataModel: { surfaceId: "main", path: "/label", value: "Exchange rate" } });
  assert.equal(label.ok, true);
  assert.deepEqual(runtime.takeAgentFunctionCalls(), []);
  // Changing the argument the call reads sends it again.
  runtime.process({ version: "1.0", updateDataModel: { surfaceId: "main", path: "/base", value: "USD" } });
  const again = takeOne(runtime);
  assert.deepEqual((again.message as { callAgentFunction: { callFunction: unknown } }).callAgentFunction.callFunction, {
    "@call": "fetchFxRate",
    catalogId: CATALOG,
    args: { base: "USD" },
  });
});

// --- Design: acceptance, lifecycle and the public surface -------------------------------------

test("acceptance: writeInput that changes an argument of a bound schema-only function queues a call with no inbound message", () => {
  const runtime = routed();
  createSurface(runtime, { sku: "A-1" });
  runtime.process({
    version: "1.0",
    updateComponents: {
      surfaceId: "main",
      components: [
        { id: "root", component: "Column", children: ["field", "stock"] },
        { id: "field", component: "TextField", label: "SKU", value: { "@path": "/sku" } },
        { id: "stock", component: "Text", text: { "@call": "isAvailable", args: { sku: { "@path": "/sku" } } } },
      ],
    },
  });
  const initial = takeOne(runtime);
  assert.equal(initial.functionCallId, "agent-call-1");
  respond(runtime, "agent-call-1", { value: true });
  const written = runtime.writeInput({ surfaceId: "main", sourceComponentId: "field", scopePath: "/", property: "value", value: "B-2" });
  assert.equal(written.ok, true, JSON.stringify(written));
  const queued = takeOne(runtime);
  assert.equal(queued.functionCallId, "agent-call-2");
  assert.deepEqual((queued.message as { callAgentFunction: { callFunction: unknown } }).callAgentFunction.callFunction, {
    "@call": "isAvailable",
    catalogId: CATALOG,
    args: { sku: "B-2" },
  });
});

test("acceptance: a settled answer notifies surface subscribers, and resolveSurface shows the value", () => {
  const runtime = routed();
  mountText(runtime, { "@call": "fetchFxRate", args: { base: "EUR" } });
  const seen: string[] = [];
  runtime.subscribeSurface("main", (result) => {
    if (result.ok) seen.push(String(result.value.tree.root?.properties.text));
  });
  const call = takeOne(runtime);
  assert.equal(textValue(runtime), null);
  respond(runtime, call.functionCallId, { value: "1.08" });
  assert.equal(seen.at(-1), "1.08", JSON.stringify(seen));
  assert.equal(textValue(runtime), "1.08");
});

test("acceptance: a response that matches no pending call is ignored, with nothing sent or changed", () => {
  const runtime = routed();
  mountText(runtime, { "@call": "fetchFxRate", args: { base: "EUR" } });
  takeOne(runtime);
  const result = respond(runtime, "call-unknown-1", { value: { status: "verified" } });
  assert.deepEqual(result, { ok: true, value: { operation: "agentFunctionIgnored", functionCallId: "call-unknown-1" } });
  assert.deepEqual(runtime.takeAgentFunctionCalls(), []);
  assert.equal(textValue(runtime), null);
});

test("a second response for a settled call is ignored", () => {
  const runtime = routed();
  mountText(runtime, { "@call": "fetchFxRate", args: { base: "EUR" } });
  takeOne(runtime);
  respond(runtime, "agent-call-1", { value: "1" });
  const again = respond(runtime, "agent-call-1", { value: 2 });
  assert.equal(again.ok && again.value.operation, "agentFunctionIgnored");
  assert.equal(textValue(runtime), "1");
});

test("cancelAgentFunctionCall with TIMEOUT resolves dependents to an error, and a late response is ignored", () => {
  const runtime = routed();
  mountText(runtime, { "@call": "fetchFxRate", args: { base: "EUR" } });
  takeOne(runtime);
  const cancelled = runtime.cancelAgentFunctionCall("agent-call-1", "TIMEOUT");
  assert.equal(cancelled.ok && cancelled.value.operation, "agentFunctionCancelled");
  assert.equal(textValue(runtime), null);
  assert.equal(propertyErrors(runtime)[0]?.message, "Agent function call timed out");
  const late = respond(runtime, "agent-call-1", { value: 9 });
  assert.equal(late.ok && late.value.operation, "agentFunctionIgnored");
  assert.equal(textValue(runtime), null);
  // The failure is remembered, so the binding does not send again on resolve.
  assert.deepEqual(runtime.takeAgentFunctionCalls(), []);
});

test("cancelAgentFunctionCall for an unknown call reports it is not pending", () => {
  const runtime = routed();
  const cancelled = runtime.cancelAgentFunctionCall("agent-call-404", "TRANSPORT_FAILED");
  assert.deepEqual(cancelled, { ok: false, error: { code: "AGENT_FUNCTION_CALL_NOT_PENDING", functionCallId: "agent-call-404" } });
});

test("deleteSurface cancels its pending calls silently and drops them from the queue", () => {
  const runtime = routed();
  mountText(runtime, { "@call": "fetchFxRate", args: { base: "EUR" } });
  // The call is queued and not yet drained. Deleting the surface drops it.
  runtime.process({ version: "1.0", deleteSurface: { surfaceId: "main" } });
  assert.deepEqual(runtime.takeAgentFunctionCalls(), []);
  const late = respond(runtime, "agent-call-1", { value: "1" });
  assert.equal(late.ok && late.value.operation, "agentFunctionIgnored");
});

test("the default id generator is a deterministic counter, and a host generator is used when given", () => {
  const runtime = routed();
  mountText(runtime, { "@call": "fetchFxRate", args: { base: "EUR" } });
  assert.equal(takeOne(runtime).functionCallId, "agent-call-1");
  const custom = routed({ agentFunctions: { createFunctionCallId: () => "host-call-7" } });
  mountText(custom, { "@call": "fetchFxRate", args: { base: "EUR" } });
  assert.equal(takeOne(custom).functionCallId, "host-call-7");
});

test("a duplicate generated id while pending is a typed local error, not a second request", () => {
  const runtime = routed({ agentFunctions: { createFunctionCallId: () => "same-id" } });
  mountText(runtime, { "@call": "fetchFxRate", args: { base: "EUR" } });
  takeOne(runtime);
  const result = runtime.process({
    version: "1.0",
    updateComponents: { surfaceId: "main", components: [textComponent({ "@call": "fetchFxRate", args: { base: "USD" } })] },
  });
  assert.equal(result.ok, true);
  const [error] = propertyErrors(runtime);
  assert.equal(error?.code, "EXPRESSION_ERROR");
  assert.ok(error?.message.includes("already pending"));
  assert.deepEqual(runtime.takeAgentFunctionCalls(), []);
});

test("maxPending bounds pending calls, and a refused call is a typed local error", () => {
  const runtime = routed({ agentFunctions: { maxPending: 1 } });
  createSurface(runtime);
  runtime.process({
    version: "1.0",
    updateComponents: {
      surfaceId: "main",
      components: [
        { id: "root", component: "Column", children: ["a", "b"] },
        { id: "a", component: "Text", text: { "@call": "fetchRate", args: { id: "1" } } },
        { id: "b", component: "Text", text: { "@call": "fetchRate", args: { id: "2" } } },
      ],
    },
  });
  assert.equal(runtime.takeAgentFunctionCalls().length, 1);
  const [error] = propertyErrors(runtime);
  assert.equal(error?.code, "EXPRESSION_ERROR");
  assert.ok(error?.message.includes("Too many pending"));
});

test("invalid agentFunctions configuration is a typed configuration error", () => {
  const created = createWeaverRuntime({ catalogs: [routingCatalog()], agentFunctions: { maxPending: 0 } });
  assert.equal(created.ok, false);
  if (created.ok) assert.fail();
  assert.equal(created.error.code, "AGENT_FUNCTIONS_CONFIGURATION_FAILED");
});

test("agentOnly functions are refused from a binding with EXPRESSION_ERROR and never sent", () => {
  const runtime = routed();
  mountText(runtime, { "@call": "auditLog", args: {} });
  assert.equal(textValue(runtime), null);
  assert.equal(propertyErrors(runtime)[0]?.code, "EXPRESSION_ERROR");
  assert.deepEqual(runtime.takeAgentFunctionCalls(), []);
});


test("non-JSON arguments are refused locally and not sent", () => {
  const runtime = routed();
  // A NaN cannot be carried in an A2UI message, so the envelope itself is refused before any call exists.
  createSurface(runtime);
  const result = runtime.process({
    version: "1.0",
    updateComponents: { surfaceId: "main", components: [textComponent({ "@call": "quote", args: { symbol: "A", currency: Number.NaN } })] },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(runtime.takeAgentFunctionCalls(), []);
});

test("the answer of a pending action continuation is attached to the response that resumed it", () => {
  const runtime = routed();
  createSurface(runtime);
  runtime.process({
    version: "1.0",
    updateComponents: {
      surfaceId: "main",
      components: [
        { id: "root", component: "Button", child: "label", action: { event: { name: "checkout", context: { rate: { "@call": "fetchFxRate", args: { base: "EUR" } } } } } },
        { id: "label", component: "Text", text: "Go" },
      ],
    },
  });
  const dispatched = runtime.dispatchAction({ surfaceId: "main", sourceComponentId: "root", scopePath: "/", actionProperty: "action" });
  if (!dispatched.ok || dispatched.value.kind !== "agentFunctionCalls") assert.fail(JSON.stringify(dispatched));
  const [message] = dispatched.value.messages;
  const answered = respond(runtime, message!.callAgentFunction.functionCallId, { value: "1.08" });
  if (!answered.ok || answered.value.operation !== "agentFunctionResolved") assert.fail(JSON.stringify(answered));
  assert.equal(answered.value.action?.ok && answered.value.action.value.kind, "serverEvent");
  if (answered.value.action?.ok !== true || answered.value.action.value.kind !== "serverEvent") assert.fail();
  assert.deepEqual(answered.value.action.value.message.action.context, { rate: "1.08" });
});

test("replay: a trace with a routed input and its agent response replays without divergence", () => {
  const recorder = createWeaverTraceRecorder({ maxEntries: 100 });
  const observer: WeaverRuntimeObserver = recorder.observer;
  const config: Partial<WeaverRuntimeConfig> = { agentFunctions: {}, observer };
  const runtime = routed(config);
  mountText(runtime, { "@call": "fetchFxRate", args: { base: "EUR" } });
  respond(runtime, "agent-call-1", { value: "1.08" });
  const trace: WeaverTrace = recorder.getTrace();
  const parsed = parseWeaverTrace(JSON.parse(JSON.stringify(trace)));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) assert.fail();
  const replayRuntime = routed();
  const replay = replayWeaverTrace(parsed.value, { runtime: replayRuntime });
  assert.equal(replay.steps.some((step) => step.diverged), false, JSON.stringify(replay.steps));
});

test("test_agent_routing_agent_error_is_expression_error (no resend on a fresh evaluation): a failed answer is reported and is not sent again while its arguments are unchanged", () => {
  // Deviation: the pinned case expects a second send after the error. Core keeps the failure per surface
  // (see AgentFunctionBroker), so a re-resolve does not resend. The send happens again only when the arguments change.
  const runtime = routed();
  mountText(runtime, { "@call": "fetchFxRate", args: { base: "EUR" } });
  takeOne(runtime);
  respond(runtime, "agent-call-1", { error: { code: "UNKNOWN_FUNCTION", message: "No such function: fetchFxRate" } });
  assert.equal(propertyErrors(runtime)[0]?.message, "No such function: fetchFxRate");
  resolved(runtime);
  resolved(runtime);
  assert.deepEqual(runtime.takeAgentFunctionCalls(), []);
});

test("replay: a dispatchAction that yields agentFunctionCalls, then its agentFunctionResponse, replays without divergence", () => {
  const recorder = createWeaverTraceRecorder({ maxEntries: 100 });
  const runtime = routed({ observer: recorder.observer });
  createSurface(runtime);
  runtime.process({
    version: "1.0",
    updateComponents: {
      surfaceId: "main",
      components: [
        { id: "root", component: "Button", child: "label", action: { functionCall: { "@call": "submitOrder", args: { id: "o-1" } } } },
        { id: "label", component: "Text", text: "Go" },
      ],
    },
  });
  const dispatched = runtime.dispatchAction({ surfaceId: "main", sourceComponentId: "root", scopePath: "/", actionProperty: "action", userActivation: true });
  assert.equal(dispatched.ok && dispatched.value.kind, "agentFunctionCalls");
  if (!dispatched.ok || dispatched.value.kind !== "agentFunctionCalls") assert.fail();
  const [message] = dispatched.value.messages;
  respond(runtime, message!.callAgentFunction.functionCallId, { value: true });
  const parsed = parseWeaverTrace(JSON.parse(JSON.stringify(recorder.getTrace())));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) assert.fail();
  const replay = replayWeaverTrace(parsed.value, { runtime: routed() });
  assert.ok(replay.steps.length >= 3, JSON.stringify(replay.steps));
  assert.equal(replay.steps.some((step) => step.diverged), false, JSON.stringify(replay.steps));
});

// --- Evaluator-level cases ------------------------------------------------------------------
// Invalid arguments and reserved names are checked on the evaluator itself. Component validation
// rejects an undeclared name before evaluation, so that case is tested through updateComponents.

function evaluatorFixture() {
  const catalogs = new CatalogRegistry();
  const registered = catalogs.register(routingCatalog());
  assert.equal(registered.ok, true);
  const broker = new AgentFunctionBroker({ maxPending: 16 });
  const evaluator = new FunctionEvaluator(catalogs, new FunctionRegistry(catalogs), { agentRouter: broker });
  return { evaluator, broker };
}

const reactive = { surfaceId: "main", kind: "reactive" } as const;

test("an undeclared name is rejected at updateComponents and never reaches the agent", () => {
  const runtime = routed();
  createSurface(runtime);
  const result = runtime.process({
    version: "1.0",
    updateComponents: { surfaceId: "main", components: [textComponent({ "@call": "fetchOther", args: { id: "7" } })] },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(runtime.takeAgentFunctionCalls(), []);
});

test("a reserved @ function is never routed", () => {
  const { evaluator, broker } = evaluatorFixture();
  const result = evaluator.evaluate(CATALOG, { "@call": "@unknownSystemFunction", args: {} }, DataContext.root({}), reactive);
  assert.equal(result.ok, false);
  assert.deepEqual(broker.drain(), []);
});

test("arguments that fail a schema-only function's schema are an EXPRESSION_ERROR and are not sent", () => {
  const { evaluator, broker } = evaluatorFixture();
  const result = evaluator.evaluate(CATALOG, { "@call": "quote", args: { symbol: 42 } }, DataContext.root({}), reactive);
  assert.equal(!result.ok && result.error.code, "EXPRESSION_ERROR");
  assert.equal(!result.ok && result.error.message, "Validation failed for function 'quote'");
  assert.deepEqual(broker.drain(), []);
});

test("a routed call with no surface scope fails locally", () => {
  const { evaluator, broker } = evaluatorFixture();
  const result = evaluator.evaluate(CATALOG, { "@call": "fetchFxRate", args: { base: "EUR" } }, DataContext.root({}));
  assert.equal(!result.ok && result.error.code, "EXPRESSION_ERROR");
  assert.deepEqual(broker.drain(), []);
});

// --- Transport route ownership and the outbound queue ---------------------------------------

test("a response that arrives on another route than the call's surface is refused with no state change", () => {
  const runtime = routed();
  const session = createA2UITransportSession({ runtime });
  assert.equal(session.processInbound("route-a", { version: "1.0", createSurface: { surfaceId: "main", catalogId: CATALOG } }).ok, true);
  assert.equal(session.processInbound("route-a", { version: "1.0", updateComponents: { surfaceId: "main", components: [textComponent({ "@call": "fetchFxRate", args: { base: "EUR" } })] } }).ok, true);
  const deliveries = session.drainOutbound("route-a");
  assert.deepEqual(deliveries.map((delivery) => delivery.routeId), ["route-a"]);
  const refused = session.processInbound("route-b", { version: "1.0", agentFunctionResponse: { functionCallId: "agent-call-1", value: "1.08" } });
  assert.deepEqual(refused, { ok: false, error: { code: "SURFACE_ROUTE_MISMATCH", surfaceId: "main" } });
  assert.equal(textValue(runtime), null);
  const accepted = session.processInbound("route-a", { version: "1.0", agentFunctionResponse: { functionCallId: "agent-call-1", value: "1.08" } });
  assert.equal(accepted.ok && accepted.value.operation, "agentFunctionResolved");
  assert.equal(textValue(runtime), "1.08");
});

test("drainOutbound leaves a call whose surface has no route queued until the host cancels it", () => {
  const runtime = routed();
  const session = createA2UITransportSession({ runtime });
  // The surface is created directly on the runtime, so no route owns it.
  createSurface(runtime);
  runtime.process({ version: "1.0", updateComponents: { surfaceId: "main", components: [textComponent({ "@call": "fetchFxRate", args: { base: "EUR" } })] } });
  assert.deepEqual(session.drainOutbound("route-a"), []);
  assert.deepEqual(session.drainOutbound("route-b"), []);
  // Still queued, so the host's cancellation is what settles it.
  assert.equal(runtime.cancelAgentFunctionCall("agent-call-1", "TRANSPORT_FAILED").ok, true);
  const late = respond(runtime, "agent-call-1", { value: "1.08" });
  assert.equal(late.ok && late.value.operation, "agentFunctionIgnored");
});

test("drainOutbound takes only the calls of the asking route, and leaves the others queued in order", () => {
  const runtime = routed();
  const session = createA2UITransportSession({ runtime });
  assert.equal(session.processInbound("route-a", { version: "1.0", createSurface: { surfaceId: "main", catalogId: CATALOG } }).ok, true);
  assert.equal(session.processInbound("route-b", { version: "1.0", createSurface: { surfaceId: "other", catalogId: CATALOG } }).ok, true);
  assert.equal(session.processInbound("route-a", { version: "1.0", updateComponents: { surfaceId: "main", components: [textComponent({ "@call": "fetchFxRate", args: { base: "EUR" } })] } }).ok, true);
  assert.equal(session.processInbound("route-b", { version: "1.0", updateComponents: { surfaceId: "other", components: [textComponent({ "@call": "fetchFxRate", args: { base: "USD" } })] } }).ok, true);
  assert.deepEqual(session.drainOutbound("route-b").map((delivery) => [delivery.routeId, (delivery.message as { callAgentFunction: { surfaceId: string } }).callAgentFunction.surfaceId]), [["route-b", "other"]]);
  assert.deepEqual(session.drainOutbound("route-a").map((delivery) => [delivery.routeId, (delivery.message as { callAgentFunction: { surfaceId: string } }).callAgentFunction.surfaceId]), [["route-a", "main"]]);
  assert.deepEqual(session.drainOutbound("route-a"), []);
});

test("prepareActionCallDelivery routes each action call on its surface's route", () => {
  const runtime = routed();
  const session = createA2UITransportSession({ runtime });
  session.processInbound("route-a", { version: "1.0", createSurface: { surfaceId: "main", catalogId: CATALOG } });
  session.processInbound("route-a", {
    version: "1.0",
    updateComponents: {
      surfaceId: "main",
      components: [
        { id: "root", component: "Button", child: "label", action: { functionCall: { "@call": "submitOrder", args: { id: "o-1" } } } },
        { id: "label", component: "Text", text: "Go" },
      ],
    },
  });
  const dispatched = runtime.dispatchAction({ surfaceId: "main", sourceComponentId: "root", scopePath: "/", actionProperty: "action", userActivation: true });
  const prepared = session.prepareActionCallDelivery(dispatched);
  assert.equal(prepared.ok && prepared.value.length, 1);
  assert.equal(prepared.ok && prepared.value[0]?.routeId, "route-a");
  assert.equal(prepared.ok && prepared.value[0]?.message.callAgentFunction.callFunction["@call"], "submitOrder");
});

test("the queue hook is called once per queued reactive call, and a throwing hook changes nothing", () => {
  let calls = 0;
  const runtime = routed({ agentFunctions: { onCallQueued: () => { calls += 1; throw new Error("host hook failure"); } } });
  mountText(runtime, { "@call": "fetchFxRate", args: { base: "EUR" } });
  assert.equal(calls, 1);
  assert.equal(runtime.takeAgentFunctionCalls().length, 1);
  // Resolving again does not queue a second call.
  resolved(runtime);
  assert.equal(calls, 1);
});

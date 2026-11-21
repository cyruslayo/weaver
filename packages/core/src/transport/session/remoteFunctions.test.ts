import assert from "node:assert/strict";
import { test } from "node:test";

import { createBasicCatalogV10Registration, A2UI_V10_BASIC_CATALOG_ID } from "../../basic-catalog/index.js";
import { createWeaverRuntime, type WeaverRuntime } from "../../runtime/index.js";
import { createA2UITransportSession } from "./createA2UITransportSession.js";
import type { A2UIFunctionResponseDelivery, A2UIRoutedProcessResult, A2UITransportSession } from "./types.js";

function setup(): { runtime: WeaverRuntime; session: A2UITransportSession } {
  const created = createWeaverRuntime({ catalogs: [createBasicCatalogV10Registration()] });
  if (!created.ok) throw new Error("runtime configuration failed");
  return { runtime: created.value, session: createA2UITransportSession({ runtime: created.value }) };
}

function createSurfaceOn(session: A2UITransportSession, routeId: string, surfaceId: string): void {
  const result = session.processInbound(routeId, {
    version: "1.0",
    createSurface: { surfaceId, catalogId: A2UI_V10_BASIC_CATALOG_ID },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
}

/** A call to a function the Basic catalog does not allow to run here. The response is still a refusal the host must send. */
function callFor(functionCallId: string, surfaceId?: string): Record<string, unknown> {
  return {
    version: "1.0",
    callRendererFunction: {
      functionCallId,
      ...(surfaceId === undefined ? {} : { surfaceId }),
      callFunction: { "@call": "formatDate", catalogId: A2UI_V10_BASIC_CATALOG_ID, args: {} },
    },
  };
}

test("a call that names a surface owned by another route is refused as a route mismatch", () => {
  const { session } = setup();
  createSurfaceOn(session, "route-a", "shared");
  const result = session.processInbound("route-b", callFor("call-1", "shared"));
  assert.deepEqual(result.ok, false);
  assert.deepEqual(!result.ok && result.error, { code: "SURFACE_ROUTE_MISMATCH", surfaceId: "shared" });
});

test("a call on the owning route is answered and the response is delivered on that route", () => {
  const { session } = setup();
  createSurfaceOn(session, "route-a", "shared");
  const result = session.processInbound("route-a", callFor("call-2", "shared"));
  assert.equal(result.ok, true);
  const delivery = session.prepareFunctionResponseDelivery("route-a", result as Parameters<A2UITransportSession["prepareFunctionResponseDelivery"]>[1]);
  assert.equal(delivery.ok, true);
  if (!delivery.ok) return;
  assert.equal(delivery.value.routeId, "route-a");
  assert.equal(delivery.value.message.version, "1.0");
  assert.equal(delivery.value.message.rendererFunctionResponse.functionCallId, "call-2");
  assert.equal(delivery.value.message.rendererFunctionResponse.error?.code, "INVALID_FUNCTION_CALL");
});

test("a call that names an existing surface with no route is refused as route unknown, not answered", () => {
  // The surface was created outside the session, so no route owns it. A route must not read its data.
  const { runtime, session } = setup();
  const created = runtime.process({ version: "1.0", createSurface: { surfaceId: "orphan", catalogId: A2UI_V10_BASIC_CATALOG_ID } });
  assert.equal(created.ok, true);
  const refused = session.processInbound("route-a", callFor("call-3", "orphan"));
  assert.equal(refused.ok, false);
  assert.deepEqual(!refused.ok && refused.error, { code: "SURFACE_ROUTE_UNKNOWN", surfaceId: "orphan" });
});

test("a call that names an absent surface is answered by Core with an INVALID_FUNCTION_CALL response", () => {
  const { session } = setup();
  const result = session.processInbound("route-a", callFor("call-4", "missing"));
  assert.equal(result.ok, true);
  const delivery = session.prepareFunctionResponseDelivery("route-a", result as Parameters<A2UITransportSession["prepareFunctionResponseDelivery"]>[1]);
  assert.equal(delivery.ok, true);
  if (delivery.ok) {
    assert.equal(delivery.value.message.rendererFunctionResponse.error?.code, "INVALID_FUNCTION_CALL");
    assert.ok(delivery.value.message.rendererFunctionResponse.error?.message.includes("Surface not found: missing"));
  }
});

test("a call with no surfaceId is answered on the route, with no surface routing", () => {
  const { session } = setup();
  const result = session.processInbound("route-a", callFor("call-5"));
  assert.equal(result.ok, true);
  const delivery = session.prepareFunctionResponseDelivery("route-a", result as Parameters<A2UITransportSession["prepareFunctionResponseDelivery"]>[1]);
  assert.equal(delivery.ok, true);
});

test("an unknown route id is refused for function responses too", () => {
  const { session } = setup();
  const result = session.processInbound("route-a", callFor("call-6"));
  assert.equal(result.ok, true);
  assert.deepEqual(
    session.prepareFunctionResponseDelivery("", result as Parameters<A2UITransportSession["prepareFunctionResponseDelivery"]>[1]),
    { ok: false, error: { code: "INVALID_ROUTE_ID" } },
  );
});

test("a result that is not a function response is not delivered as one", () => {
  const { session } = setup();
  const created = session.processInbound("route-a", {
    version: "1.0",
    createSurface: { surfaceId: "main", catalogId: A2UI_V10_BASIC_CATALOG_ID },
  });
  assert.deepEqual(
    session.prepareFunctionResponseDelivery("route-a", created as Parameters<A2UITransportSession["prepareFunctionResponseDelivery"]>[1]),
    { ok: false, error: { code: "FUNCTION_RESPONSE_UNAVAILABLE" } },
  );
});

/**
 * Runs a malformed callRendererFunction envelope through the session and asserts the generic renderer error the host
 * sends: version 1.0, code INVALID_FUNCTION_CALL, the exact functionCallId, a message naming the key, and no surfaceId.
 */
function assertEnvelopeRendererError(input: unknown, functionCallId: string, key: string): void {
  const { session } = setup();
  const failed = session.processInbound("route-a", input);
  assert.equal(failed.ok, false);
  const delivery = session.prepareValidationErrorDelivery("route-a", input, failed as Parameters<A2UITransportSession["prepareValidationErrorDelivery"]>[2]);
  assert.equal(delivery.ok, true, JSON.stringify(delivery));
  if (!delivery.ok) return;
  assert.equal(delivery.value.routeId, "route-a");
  const message = delivery.value.message as { version: unknown; error: Record<string, unknown> };
  assert.equal(message.version, "1.0");
  assert.equal(message.error["code"], "INVALID_FUNCTION_CALL");
  assert.equal(message.error["functionCallId"], functionCallId);
  assert.equal("surfaceId" in message.error, false);
  assert.ok(String(message.error["message"]).includes(key), String(message.error["message"]));
}

// rpc_functions.yaml: test_rpc_call_renderer_function_invalid_payload_missing_call_function (call-109)
test("test_rpc_call_renderer_function_invalid_payload_missing_call_function: envelope error names callFunction", () => {
  assertEnvelopeRendererError({ version: "1.0", callRendererFunction: { functionCallId: "call-109" } }, "call-109", "callFunction");
});

// rpc_functions.yaml: test_rpc_call_renderer_function_invalid_payload_non_object_args (call-110)
test("test_rpc_call_renderer_function_invalid_payload_non_object_args: envelope error names args", () => {
  assertEnvelopeRendererError(
    {
      version: "1.0",
      callRendererFunction: {
        functionCallId: "call-110",
        callFunction: { "@call": "playMedia", catalogId: "media_catalog", args: "not-an-object" },
      },
    },
    "call-110",
    "args",
  );
});

// rpc_functions.yaml: test_rpc_call_renderer_function_invalid_payload_missing_catalog_id (call-110)
test("test_rpc_call_renderer_function_invalid_payload_missing_catalog_id: envelope error names catalogId", () => {
  assertEnvelopeRendererError(
    {
      version: "1.0",
      callRendererFunction: { functionCallId: "call-110", callFunction: { "@call": "playMedia", args: { mediaId: "video-789" } } },
    },
    "call-110",
    "catalogId",
  );
});

// error_responses.yaml: test_error_response_call_renderer_function_missing_call_function (call-err-1)
test("test_error_response_call_renderer_function_missing_call_function: correlated error names callFunction", () => {
  assertEnvelopeRendererError({ version: "1.0", callRendererFunction: { functionCallId: "call-err-1" } }, "call-err-1", "callFunction");
});

// error_responses.yaml: test_error_response_call_renderer_function_non_object_args (call-err-2)
test("test_error_response_call_renderer_function_non_object_args: correlated error names args", () => {
  assertEnvelopeRendererError(
    {
      version: "1.0",
      callRendererFunction: {
        functionCallId: "call-err-2",
        callFunction: { "@call": "formatString", catalogId: A2UI_V10_BASIC_CATALOG_ID, args: "not_an_object" },
      },
    },
    "call-err-2",
    "args",
  );
});

// error_responses.yaml: test_error_response_call_renderer_function_missing_catalog_id (call-err-3)
test("test_error_response_call_renderer_function_missing_catalog_id: correlated error names catalogId", () => {
  assertEnvelopeRendererError(
    {
      version: "1.0",
      callRendererFunction: { functionCallId: "call-err-3", callFunction: { "@call": "formatString", args: { value: "hello" } } },
    },
    "call-err-3",
    "catalogId",
  );
});

test("a failed envelope without a functionCallId keeps the surface validation behavior", () => {
  const { session } = setup();
  const input = { version: "1.0", updateComponents: { components: [] } };
  const failed = session.processInbound("route-a", input);
  assert.equal(failed.ok, false);
  const delivery = session.prepareValidationErrorDelivery("route-a", input, failed as Parameters<A2UITransportSession["prepareValidationErrorDelivery"]>[2]);
  assert.equal(delivery.ok, false);
});

test("the validation mapper does not treat a failed callRendererFunction envelope as a surface validation error", () => {
  const { runtime } = setup();
  const input = { version: "1.0", callRendererFunction: { functionCallId: "call-7" } };
  const result = runtime.process(input);
  const mapped = runtime.mapProcessFailureToValidationMessage({ input, result, surfaceId: "trusted" });
  assert.deepEqual(mapped, { ok: false, error: { code: "NOT_A_VALIDATION_FAILURE" } });
});

test("a call refused as a route mismatch is answered on the inbound route with the unknown-surface message", () => {
  const { session } = setup();
  createSurfaceOn(session, "route-a", "shared");
  const refused = session.processInbound("route-b", callFor("call-r1", "shared"));
  assert.deepEqual(refused.ok, false);
  if (refused.ok) return;
  assert.deepEqual(refused.error, { code: "SURFACE_ROUTE_MISMATCH", surfaceId: "shared" });
  assert.deepEqual(refusalDelivery(refused), {
    routeId: "route-b",
    message: {
      version: "1.0",
      rendererFunctionResponse: {
        functionCallId: "call-r1",
        error: { code: "INVALID_FUNCTION_CALL", message: "Surface not found: shared" },
      },
    },
  });
});

test("a call refused as a route unknown (surface exists, no route) is answered on the inbound route", () => {
  const { runtime, session } = setup();
  assert.equal(runtime.process({ version: "1.0", createSurface: { surfaceId: "orphan", catalogId: A2UI_V10_BASIC_CATALOG_ID } }).ok, true);
  const refused = session.processInbound("route-a", callFor("call-r2", "orphan"));
  assert.equal(refused.ok, false);
  if (refused.ok) return;
  assert.deepEqual(refused.error, { code: "SURFACE_ROUTE_UNKNOWN", surfaceId: "orphan" });
  assert.equal(refusalDelivery(refused)?.routeId, "route-a");
  assert.deepEqual(refusalDelivery(refused)?.message.rendererFunctionResponse, {
    functionCallId: "call-r2",
    error: { code: "INVALID_FUNCTION_CALL", message: "Surface not found: orphan" },
  });
});

test("a route-mismatch refusal is indistinguishable from an absent surface to the agent", () => {
  const owned = setup();
  createSurfaceOn(owned.session, "route-a", "shared");
  const mismatch = owned.session.processInbound("route-b", callFor("call-r3", "shared"));
  const absent = setup().session.processInbound("route-b", callFor("call-r3", "shared"));
  assert.equal(mismatch.ok, false);
  assert.equal(absent.ok, true);
  if (mismatch.ok) return;
  const absentResponse = absent.ok ? absent.value : undefined;
  assert.ok(absentResponse !== undefined && absentResponse.operation === "rendererFunctionResponded");
  assert.deepEqual(refusalDelivery(mismatch)?.message, absentResponse?.response);
});

test("a refused non-call message has no function response", () => {
  const { session } = setup();
  createSurfaceOn(session, "route-a", "shared");
  const refused = session.processInbound("route-b", {
    version: "1.0",
    updateComponents: { surfaceId: "shared", components: [{ id: "root", component: "Text", text: "x" }] },
  });
  assert.equal(refused.ok, false);
  if (refused.ok) return;
  assert.equal(refused.error.code, "SURFACE_ROUTE_MISMATCH");
  assert.equal(refusalDelivery(refused), undefined);
});

/** The function response a routing refusal carries, or undefined when the result has none. */
function refusalDelivery(result: A2UIRoutedProcessResult): A2UIFunctionResponseDelivery | undefined {
  return !result.ok && "functionResponse" in result ? result.functionResponse : undefined;
}

import assert from "node:assert/strict";
import { test } from "node:test";

import { createBasicCatalogV10Registration, A2UI_V10_BASIC_CATALOG_ID } from "../basic-catalog/index.js";
import type { CatalogRegistration } from "../catalog/index.js";
import { createBasicCatalogFunctionImplementations } from "../basic-functions/index.js";
import type { FunctionRegistration } from "../functions/index.js";
import type { JsonObject, JsonValue } from "../protocol/index.js";
import { createWeaverRuntime, type WeaverRuntime, type WeaverRuntimeObserver } from "../runtime/index.js";
import { createWeaverTraceRecorder, parseWeaverTrace, replayWeaverTrace, type WeaverTrace } from "../trace/index.js";

/*
 * Ported from the pinned A2UI v1.0 conformance cases in
 * conformance/core/rpc_functions.yaml (the callRendererFunction cases) and
 * conformance/core/error_responses.yaml (call_renderer_function_*). The YAML
 * is not parsed. Each case is written out by hand below.
 *
 * Deviations, each noted at its case:
 * - Test catalogs are built from the canonical Basic catalog with extra
 *   functions. Their ids are chosen by the tests.
 * - A catalog that declares requiresUserActivation with allowedCallers
 *   "rendererOrAgent" is rejected at registration, as the spec requires. The
 *   fixture's function is registered as "rendererOnly" instead. The agent
 *   outcome is INVALID_FUNCTION_CALL either way.
 * - The mixed-catalog fixtures use a nested formatString with its own literal
 *   catalogId. Core does not widen that rule, so the test catalog uses one
 *   catalog id for both calls and the mixed shape is pinned separately.
 */

const MEDIA = "conformance/media_catalog";
const SURFACE_CALL_ID = "media_surface";

type RendererResponse = { functionCallId: string; value?: JsonValue; error?: { code: string; message: string } };

/** Test catalogs: the Basic catalog under `catalogId`, plus the functions the cases call. */
function mediaCatalog(catalogId = MEDIA): CatalogRegistration {
  const schema = createBasicCatalogV10Registration().schema as unknown as Record<string, unknown>;
  schema.catalogId = catalogId;
  schema.$id = `https://example.test/${catalogId}/catalog.json`;
  const functions = schema.functions as Record<string, JsonObject>;
  Object.assign(functions, {
    // echoArgs declares its arguments untyped, so each is a dynamicValue and bindings or nested calls resolve first.
    echoArgs: fn("echoArgs", "object", "rendererOrAgent", argProperties(["mediaId", "formatted", "leaked", "constant", "idx"])),
    playMedia: fn("playMedia", "object", "rendererOrAgent", {
      mediaId: { type: "string" },
      autoplay: { type: "boolean" },
    }, ["mediaId"]),
    failingFunction: fn("failingFunction", "object", "rendererOrAgent"),
    syncState: fn("syncState", "void", "agentOnly"),
    internalStateReset: fn("internalStateReset", "void", "rendererOnly"),
    // Deviation: requiresUserActivation needs rendererOnly, see the header comment.
    openExternalUrl: { ...fn("openExternalUrl", "object", "rendererOnly"), requiresUserActivation: true },
    calculateTax: fn("calculateTax", "number", "rendererOrAgent", { amount: { type: "number" } }, ["amount"]),
    notifyFx: fn("notifyFx", "void", "rendererOrAgent"),
  });
  return { catalogId, schema: schema as unknown as CatalogRegistration["schema"] };
}

/** A catalog function definition. `argProps` declares the args properties; `required` lists the required ones. */
function fn(
  name: string,
  returnType: string,
  allowedCallers: string,
  argProps: JsonObject = {},
  required: string[] = [],
): JsonObject {
  const args = { type: "object", properties: argProps, required };
  return {
    type: "object",
    description: `Test function ${name}.`,
    returnType,
    allowedCallers,
    properties: { "@call": { const: name }, args },
    required: ["@call"],
  } as unknown as JsonObject;
}

function argProperties(names: string[]): JsonObject {
  // An untyped schema declares a dynamicValue argument, so bindings and nested calls resolve before execution.
  return Object.fromEntries(names.map((name) => [name, {}])) as JsonObject;
}

function implementations(catalogId: string): FunctionRegistration[] {
  const reg = (name: string, effect: "pure" | "action", implementation: FunctionRegistration["implementation"]): FunctionRegistration =>
    ({ catalogId, name, effect, implementation });
  return [
    ...createBasicCatalogFunctionImplementations({ catalogId }),
    reg("echoArgs", "pure", (args) => {
      const echoed: Record<string, unknown> = {};
      // The isolated context resolves a missing binding to undefined. The agent sees null, the JSON value for it.
      for (const [name, value] of Object.entries(args)) echoed[name] = value === undefined ? null : value;
      return echoed;
    }),
    reg("playMedia", "pure", () => ({ playing: true, timestamp: 0 })),
    reg("failingFunction", "pure", () => {
      throw new Error("secret internal detail that must never reach the agent");
    }),
    reg("syncState", "pure", () => undefined),
    reg("internalStateReset", "pure", () => undefined),
    reg("openExternalUrl", "pure", () => ({ opened: true })),
    reg("calculateTax", "pure", (args) => Number(args.amount) * 0.1),
    reg("notifyFx", "action", () => undefined),
  ];
}

/** A runtime with the media catalog (and the canonical Basic catalog when `withBasic`). */
function createRuntime(options: { catalogId?: string; withBasic?: boolean; observer?: WeaverRuntimeObserver } = {}): WeaverRuntime {
  const catalogId = options.catalogId ?? MEDIA;
  const catalogs: CatalogRegistration[] = [mediaCatalog(catalogId)];
  if (options.withBasic === true) catalogs.push(createBasicCatalogV10Registration());
  const created = createWeaverRuntime({
    catalogs,
    functions: [
      ...implementations(catalogId),
      ...(options.withBasic === true ? createBasicCatalogFunctionImplementations({ catalogId: A2UI_V10_BASIC_CATALOG_ID }) : []),
    ],
    ...(options.observer === undefined ? {} : { observer: options.observer }),
  });
  if (!created.ok) throw new Error(`runtime configuration failed: ${created.error.code}`);
  return created.value;
}

function createSurface(runtime: WeaverRuntime, surfaceId: string, catalogId: string, dataModel: JsonObject = {}): void {
  const result = runtime.process({ version: "1.0", createSurface: { surfaceId, catalogId, dataModel } });
  assert.equal(result.ok, true, JSON.stringify(result));
}

function callMessage(
  functionCallId: string,
  callFunction: { "@call": string; catalogId?: string; args?: JsonObject },
  surfaceId?: string,
): Record<string, unknown> {
  return {
    version: "1.0",
    callRendererFunction: {
      functionCallId,
      ...(surfaceId === undefined ? {} : { surfaceId }),
      callFunction,
    },
  };
}

/** Processes a call and returns the response the host must send. An envelope failure is a test error here. */
function respond(runtime: WeaverRuntime, message: unknown): RendererResponse {
  const result = runtime.process(message);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok || result.value.operation !== "rendererFunctionResponded") assert.fail("expected a rendererFunctionResponded result");
  return result.value.response.rendererFunctionResponse as RendererResponse;
}

function expectError(response: RendererResponse, code: string, messageIncludes?: string): void {
  assert.equal(response.error?.code, code, JSON.stringify(response));
  if (messageIncludes !== undefined) assert.ok(response.error?.message.includes(messageIncludes), response.error?.message);
}

// --- rpc_functions.yaml: callRendererFunction cases ----------------------------

test("test_rpc_call_renderer_function_success: a rendererOrAgent function runs and returns its value", () => {
  const runtime = createRuntime();
  const response = respond(runtime, callMessage("call-101", { "@call": "playMedia", catalogId: MEDIA, args: { mediaId: "video-789", autoplay: true } }));
  assert.deepEqual(response, { functionCallId: "call-101", value: { playing: true, timestamp: 0 } });
});

test("test_rpc_call_renderer_function_unauthorized_caller: a rendererOnly function is refused", () => {
  const runtime = createRuntime();
  const response = respond(runtime, callMessage("call-102", { "@call": "internalStateReset", catalogId: MEDIA, args: {} }));
  expectError(response, "INVALID_FUNCTION_CALL", "cannot be called by agent");
  assert.equal(response.functionCallId, "call-102");
});

test("test_rpc_call_renderer_function_requires_user_activation: an activation-gated function is refused even with a gesture elsewhere", () => {
  // Deviation: the fixture expects success when userActivationPresent is true. An agent call never carries a user gesture, so
  // the agent outcome here is a refusal, which is what design item 4 requires.
  const runtime = createRuntime();
  const response = respond(runtime, callMessage("call-103", { "@call": "openExternalUrl", catalogId: MEDIA, args: { url: "https://example.com/details" } }));
  expectError(response, "INVALID_FUNCTION_CALL");
});

test("test_rpc_call_renderer_function_user_activation_denied: an activation-gated function is refused without a gesture", () => {
  // Deviation: the fixture's allowedCallers is rendererOrAgent, which the catalog rejects. See the header comment.
  const runtime = createRuntime();
  const response = respond(runtime, callMessage("call-104", { "@call": "openExternalUrl", catalogId: MEDIA, args: { url: "https://example.com/details" } }));
  expectError(response, "INVALID_FUNCTION_CALL");
  assert.equal(response.functionCallId, "call-104");
});

test("test_rpc_call_renderer_function_execution_exception: a throwing implementation gives a generic EXECUTION_ERROR", () => {
  const runtime = createRuntime();
  const response = respond(runtime, callMessage("call-105", { "@call": "failingFunction", catalogId: MEDIA, args: {} }));
  expectError(response, "EXECUTION_ERROR", "An error occurred during function execution.");
  assert.equal(JSON.stringify(response).includes("secret internal detail"), false);
});

test("test_rpc_call_renderer_function_agent_only_boundary: an agentOnly function runs for the agent", () => {
  const runtime = createRuntime();
  const response = respond(runtime, callMessage("call-106", { "@call": "syncState", catalogId: MEDIA, args: {} }));
  assert.deepEqual(response, { functionCallId: "call-106", value: null });
});

test("test_rpc_call_renderer_function_unregistered_function: an unknown function is refused", () => {
  const runtime = createRuntime();
  const response = respond(runtime, callMessage("call-107", { "@call": "unknownFunc", catalogId: MEDIA, args: {} }));
  expectError(response, "INVALID_FUNCTION_CALL", "Function not found: unknownFunc");
});

test("test_rpc_call_renderer_function_unregistered_catalog: an unregistered catalog is refused", () => {
  const runtime = createRuntime();
  const response = respond(runtime, callMessage("call-108", { "@call": "playMedia", catalogId: "non_existent_catalog", args: {} }));
  expectError(response, "INVALID_FUNCTION_CALL", "Catalog not found: non_existent_catalog");
});

test("test_rpc_call_renderer_function_protocol_version_mismatch: an unregistered catalog stands in for a version mismatch", () => {
  // Partial port: the registry accepts only protocolVersion "1.0", so a v0.9 catalog cannot be registered here.
  // The outcome is the same refusal. The message names the unregistered catalog, not the version mismatch.
  const runtime = createRuntime();
  const response = respond(runtime, callMessage("call-302", { "@call": "playMedia", catalogId: "v0_9_cat", args: { mediaId: "vid1" } }));
  expectError(response, "INVALID_FUNCTION_CALL", "Catalog not found: v0_9_cat");
});

test("test_rpc_call_renderer_function_unknown_surface_id: an unknown surface is refused and names the surface", () => {
  const runtime = createRuntime();
  const response = respond(runtime, callMessage("call-111", { "@call": "playMedia", catalogId: MEDIA, args: { mediaId: "video-789" } }, "unknown_surface"));
  expectError(response, "INVALID_FUNCTION_CALL", "unknown_surface");
  assert.equal(response.functionCallId, "call-111");
});

test("test_rpc_call_renderer_function_invalid_argument_schema: arguments that fail the schema are refused", () => {
  const runtime = createRuntime();
  const response = respond(runtime, callMessage("call-301", { "@call": "calculateTax", catalogId: MEDIA, args: { amount: "invalid_string_amount" } }));
  expectError(response, "INVALID_FUNCTION_CALL", "Invalid arguments");
  assert.equal(response.functionCallId, "call-301");
});

test("test_rpc_call_renderer_function_with_surface_id_and_dynamic_args: @path and nested calls resolve against the surface root", () => {
  // Deviation: the fixture's nested formatString names "basic" while the call names media_catalog. Here both use MEDIA.
  const runtime = createRuntime();
  createSurface(runtime, SURFACE_CALL_ID, MEDIA, { media: { id: "video-456" }, prefix: "now-" });
  const response = respond(
    runtime,
    callMessage(
      "call-401",
      {
        "@call": "echoArgs",
        catalogId: MEDIA,
        args: {
          mediaId: { "@path": "/media/id" },
          formatted: { "@call": "formatString", catalogId: MEDIA, args: { value: "${/prefix}${/media/id}" } },
        },
      },
      SURFACE_CALL_ID,
    ),
  );
  assert.deepEqual(response, { functionCallId: "call-401", value: { mediaId: "video-456", formatted: "now-video-456" } });
});

test("test_rpc_call_renderer_function_format_string_arg_inherits_catalog: a nested formatString template resolves in the call catalog", () => {
  // Deviation: the nested formatString names MEDIA, not "basic". See the header comment.
  const runtime = createRuntime();
  createSurface(runtime, SURFACE_CALL_ID, MEDIA, { count: 2 });
  const response = respond(
    runtime,
    callMessage(
      "call-401b",
      {
        "@call": "echoArgs",
        catalogId: MEDIA,
        args: {
          formatted: {
            "@call": "formatString",
            catalogId: MEDIA,
            args: { value: "Clips: ${pluralize(value: /count, one: 'clip', other: 'clips')}" },
          },
        },
      },
      SURFACE_CALL_ID,
    ),
  );
  assert.deepEqual(response, { functionCallId: "call-401b", value: { formatted: "Clips: clips" } });
});

test("test_rpc_call_renderer_function_without_surface_id_isolated_data_model: no surfaceId means an empty isolated model", () => {
  const runtime = createRuntime();
  createSurface(runtime, "existing_surface", MEDIA, { secret: "should-not-leak" });
  const response = respond(
    runtime,
    callMessage("call-402", {
      "@call": "echoArgs",
      catalogId: MEDIA,
      args: { leaked: { "@path": "/secret" }, constant: "safe" },
    }),
  );
  assert.deepEqual(response, { functionCallId: "call-402", value: { leaked: null, constant: "safe" } });
  assert.equal(JSON.stringify(response).includes("should-not-leak"), false);
});

test("test_rpc_call_renderer_function_index_at_root_execution_error: @index at the root is an EXECUTION_ERROR", () => {
  const runtime = createRuntime();
  createSurface(runtime, "main_surface", MEDIA, {});
  const response = respond(
    runtime,
    callMessage(
      "call-403",
      { "@call": "echoArgs", catalogId: MEDIA, args: { idx: { "@call": "@index" } } },
      "main_surface",
    ),
  );
  expectError(response, "EXECUTION_ERROR", "index");
  assert.equal(response.functionCallId, "call-403");
});

test("a top-level @index call is also an EXECUTION_ERROR", () => {
  const runtime = createRuntime();
  const response = respond(runtime, callMessage("call-404", { "@call": "@index", catalogId: MEDIA, args: {} }));
  expectError(response, "EXECUTION_ERROR", "index");
});

// --- Behaviors beyond the ported cases -----------------------------------------

test("a surface-present call may name a catalog that differs from the surface catalog", () => {
  const runtime = createRuntime({ withBasic: true });
  createSurface(runtime, "basic_surface", A2UI_V10_BASIC_CATALOG_ID, { media: { id: "video-9" } });
  const response = respond(
    runtime,
    callMessage(
      "call-500",
      { "@call": "echoArgs", catalogId: MEDIA, args: { mediaId: { "@path": "/media/id" } } },
      "basic_surface",
    ),
  );
  assert.deepEqual(response, { functionCallId: "call-500", value: { mediaId: "video-9" } });
});

test("the mixed-catalog shape (nested literal catalogId differs from the call) is refused as EXECUTION_ERROR", () => {
  // Pinned behavior, not a conformance port. The nested call keeps the renderer rule for catalog mismatch.
  const runtime = createRuntime();
  const response = respond(
    runtime,
    callMessage("call-501", {
      "@call": "echoArgs",
      catalogId: MEDIA,
      args: { formatted: { "@call": "formatString", catalogId: "basic", args: { value: "x" } } },
    }),
  );
  expectError(response, "EXECUTION_ERROR");
});

test("a function whose effect is action cannot run for an agent", () => {
  const runtime = createRuntime();
  const response = respond(runtime, callMessage("call-502", { "@call": "notifyFx", catalogId: MEDIA, args: {} }));
  expectError(response, "INVALID_FUNCTION_CALL");
});

test("a call with a surfaceId does not change the surface or notify its subscribers", () => {
  const runtime = createRuntime();
  createSurface(runtime, SURFACE_CALL_ID, MEDIA, { media: { id: "video-456" } });
  const before = JSON.stringify(runtime.getSurface(SURFACE_CALL_ID));
  let notifications = 0;
  const unsubscribe = runtime.subscribeSurface(SURFACE_CALL_ID, () => {
    notifications += 1;
  });
  respond(runtime, callMessage("call-600", { "@call": "echoArgs", catalogId: MEDIA, args: { mediaId: { "@path": "/media/id" } } }, SURFACE_CALL_ID));
  unsubscribe();
  assert.equal(notifications, 0);
  assert.equal(JSON.stringify(runtime.getSurface(SURFACE_CALL_ID)), before);
});

test("an envelope failure is a processing error that carries functionCallId", () => {
  const runtime = createRuntime();
  const result = runtime.process({ version: "1.0", callRendererFunction: { functionCallId: "call-109" } });
  assert.equal(result.ok, false);
  if (result.ok || result.error.code !== "PROTOCOL_VALIDATION_FAILED") assert.fail("expected a protocol failure");
  assert.equal(result.error.functionCallId, "call-109");
  assert.ok(result.error.issues.some((issue) => issue.path.includes("callFunction")));
});

test("an envelope failure with a non-string functionCallId has no correlation id", () => {
  const runtime = createRuntime();
  const result = runtime.process({ version: "1.0", callRendererFunction: { functionCallId: 7, callFunction: {} } });
  assert.equal(result.ok, false);
  if (result.ok || result.error.code !== "PROTOCOL_VALIDATION_FAILED") assert.fail("expected a protocol failure");
  assert.equal("functionCallId" in result.error, false);
});

// --- error_responses.yaml: call_renderer_function_* cases ----------------------

test("test_error_response_call_renderer_function_missing_call_function: correlated failure names callFunction", () => {
  const runtime = createRuntime();
  const result = runtime.process({ version: "1.0", callRendererFunction: { functionCallId: "call-err-1" } });
  assert.equal(result.ok, false);
  if (result.ok || result.error.code !== "PROTOCOL_VALIDATION_FAILED") assert.fail("expected a protocol failure");
  assert.equal(result.error.functionCallId, "call-err-1");
  assert.ok(result.error.issues.some((issue) => issue.path.includes("callFunction")));
});

test("test_error_response_call_renderer_function_non_object_args: correlated failure names args", () => {
  const runtime = createRuntime();
  const result = runtime.process({
    version: "1.0",
    callRendererFunction: {
      functionCallId: "call-err-2",
      callFunction: { "@call": "formatString", catalogId: A2UI_V10_BASIC_CATALOG_ID, args: "not_an_object" },
    },
  });
  assert.equal(result.ok, false);
  if (result.ok || result.error.code !== "PROTOCOL_VALIDATION_FAILED") assert.fail("expected a protocol failure");
  assert.equal(result.error.functionCallId, "call-err-2");
  assert.ok(result.error.issues.some((issue) => issue.path.includes("args")));
});

test("test_error_response_call_renderer_function_missing_catalog_id: correlated failure names catalogId", () => {
  const runtime = createRuntime();
  const result = runtime.process({
    version: "1.0",
    callRendererFunction: { functionCallId: "call-err-3", callFunction: { "@call": "formatString", args: { value: "hello" } } },
  });
  assert.equal(result.ok, false);
  if (result.ok || result.error.code !== "PROTOCOL_VALIDATION_FAILED") assert.fail("expected a protocol failure");
  assert.equal(result.error.functionCallId, "call-err-3");
  assert.ok(result.error.issues.some((issue) => issue.path.includes("catalogId")));
});

// --- Trace recording and replay of callRendererFunction -------------------------

/** Records a session of calls with an observer, and returns the trace with a fresh-runtime replay. */
function recordCallSession(): { trace: WeaverTrace } {
  const recorder = createWeaverTraceRecorder();
  const runtime = createRuntime({ observer: recorder.observer });
  createSurface(runtime, SURFACE_CALL_ID, MEDIA, { media: { id: "video-456" } });
  respond(runtime, callMessage("call-t1", { "@call": "playMedia", catalogId: MEDIA, args: { mediaId: "video-789" } }));
  respond(runtime, callMessage("call-t2", { "@call": "internalStateReset", catalogId: MEDIA, args: {} }));
  respond(runtime, callMessage("call-t3", { "@call": "echoArgs", catalogId: MEDIA, args: { mediaId: { "@path": "/media/id" } } }, SURFACE_CALL_ID));
  runtime.process({ version: "1.0", callRendererFunction: { functionCallId: "call-t4" } });
  return { trace: recorder.getTrace() };
}

test("a recorded callRendererFunction replays to the same responses with no divergence", () => {
  const { trace } = recordCallSession();
  const parsed = parseWeaverTrace(JSON.parse(JSON.stringify(trace)));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const replay = replayWeaverTrace(parsed.value, { runtime: createRuntime() });
  assert.equal(replay.steps.length, trace.entries.length);
  assert.ok(replay.steps.every((step) => step.diverged === false), JSON.stringify(replay.steps));
  // The recorded summaries keep each response, so replay has the full value to compare.
  const responses = trace.entries.map((entry) =>
    entry.kind === "message" && entry.outcome.ok && typeof entry.outcome.summary === "object" && entry.outcome.summary !== null && "response" in entry.outcome.summary
      ? entry.outcome.summary.response
      : undefined,
  );
  assert.ok(responses.filter((response) => response !== undefined).length >= 3);
});

test("replay diverges when a recorded function response value changes", () => {
  const { trace } = recordCallSession();
  const tampered = JSON.parse(JSON.stringify(trace)) as {
    entries: { kind: string; outcome: { ok: boolean; summary?: { response?: { rendererFunctionResponse: { value?: unknown } } } } }[];
  };
  const entry = tampered.entries.find((candidate) => candidate.outcome.ok && candidate.outcome.summary?.response?.rendererFunctionResponse.value !== undefined);
  assert.ok(entry?.outcome.summary?.response);
  entry.outcome.summary.response.rendererFunctionResponse.value = { playing: false, timestamp: 1 };
  const parsed = parseWeaverTrace(tampered);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const replay = replayWeaverTrace(parsed.value, { runtime: createRuntime() });
  assert.equal(replay.steps.filter((step) => step.diverged).length, 1);
});

test("replay diverges when a recorded refusal's error code changes", () => {
  const { trace } = recordCallSession();
  const tampered = JSON.parse(JSON.stringify(trace)) as {
    entries: { outcome: { ok: boolean; summary?: { response?: { rendererFunctionResponse: { error?: { code: string } } } } } }[];
  };
  const entry = tampered.entries.find((candidate) => candidate.outcome.summary?.response?.rendererFunctionResponse.error !== undefined);
  assert.ok(entry?.outcome.summary?.response?.rendererFunctionResponse.error);
  entry.outcome.summary.response.rendererFunctionResponse.error.code = "EXECUTION_ERROR";
  const parsed = parseWeaverTrace(tampered);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const replay = replayWeaverTrace(parsed.value, { runtime: createRuntime() });
  assert.equal(replay.steps.filter((step) => step.diverged).length, 1);
});

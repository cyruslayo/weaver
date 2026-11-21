export * from "./application-capabilities.js";

import type { Client } from "@modelcontextprotocol/client";
import type {
  A2UIRouteId,
  MessageProcessorResult,
  A2UIRoutedDelivery,
  A2UIRoutingError,
  A2UITransportSession,
  WeaverActionResult,
  WeaverProcessResult,
  WeaverRuntime,
} from "@cylayo/weaver-core";

const A2UI_MIME = "application/a2ui+json";
const DEFAULT_MAX_PAYLOAD_BYTES = 1024 * 1024;


export interface A2UIMcpClientBridgeOptions {
  client: Client;
  session: A2UITransportSession;
  /** The runtime the session wraps. A drained agent call that cannot be delivered is cancelled on it. */
  runtime: WeaverRuntime;
  routeId: A2UIRouteId;
  maxPayloadBytes?: number;
  actionToolName?: string;
  errorToolName?: string;
  /**
   * Host-owned reply channel for the messages a tool result cannot carry:
   * rendererFunctionResponse, a renderer error correlated to a call, and
   * callAgentFunction. Without it, those deliveries return MCP_DELIVERY_UNSUPPORTED,
   * and a drained agent call is cancelled with TRANSPORT_FAILED.
   */
  reply?: (delivery: A2UIRoutedDelivery) => void | Promise<void>;
  /** Trusted callback for deliveries that could not be made. Its exceptions are ignored. */
  onDiagnostic?: (diagnostic: A2UIMcpDiagnostic) => void;
}

export interface A2UIMcpReadResourceInput { uri: string }
export interface A2UIMcpCallToolInput { name: string; arguments?: Record<string, unknown> }

export type A2UIMcpDiagnostic =
  | { code: "A2UI_MCP_BINARY_RESOURCE_UNSUPPORTED" }
  | { code: "A2UI_MCP_PAYLOAD_TOO_LARGE"; maxPayloadBytes: number }
  | { code: "A2UI_MCP_INVALID_JSON" }
  | { code: "A2UI_MCP_INVALID_PAYLOAD_ROOT" }
  | { code: "A2UI_MCP_ROUTING_REJECTED"; routingCode: Extract<A2UIRoutingError["code"], "SURFACE_ROUTE_MISMATCH" | "SURFACE_ROUTE_UNKNOWN">; surfaceId: string }
  | { code: "A2UI_MCP_VALIDATION_ERROR_SEND_FAILED" }
  /** A response the agent waits for could not be sent through `reply`. */
  | { code: "A2UI_MCP_FUNCTION_RESPONSE_UNDELIVERED" }
  /** A drained callAgentFunction was not delivered and was cancelled with TRANSPORT_FAILED. */
  | { code: "A2UI_MCP_AGENT_CALL_CANCELLED"; functionCallId: string; reason: "TRANSPORT_FAILED" }
  /** The action that a settled call resumed could not be delivered. */
  | { code: "A2UI_MCP_CONTINUATION_UNDELIVERED" };

export type A2UIMcpReceiveResult =
  | { ok: true; processedEnvelopes: number; diagnostics: A2UIMcpDiagnostic[]; fallbackText: string[] }
  | { ok: false; error: { code: "MCP_REQUEST_FAILED" } | { code: "MCP_TOOL_ERROR"; fallbackText: string[] } };

export type A2UIMcpSendResult =
  | { ok: true }
  | { ok: false; error: { code: "MCP_DELIVERY_ROUTE_MISMATCH" } | { code: "MCP_DELIVERY_UNSUPPORTED" } | { code: "MCP_REQUEST_FAILED" } | { code: "MCP_TOOL_ERROR" } };

export interface A2UIMcpClientBridge {
  readResource(input: A2UIMcpReadResourceInput): Promise<A2UIMcpReceiveResult>;
  callTool(input: A2UIMcpCallToolInput): Promise<A2UIMcpReceiveResult>;
  sendDelivery(delivery: A2UIRoutedDelivery): Promise<A2UIMcpSendResult>;
  /**
   * Takes every queued callAgentFunction and sends it through `reply`. A call
   * that cannot be sent is cancelled with TRANSPORT_FAILED. Wire it from
   * `agentFunctions.onCallQueued`, for example `() => { void bridge.flushAgentCalls(); }`.
   * The bridge also flushes after each received payload.
   */
  flushAgentCalls(): Promise<void>;
  /** Sends the callAgentFunction messages of an action result from `runtime.dispatchAction`. */
  sendActionCalls(result: WeaverActionResult): Promise<void>;
}

/**
 * Maps A2UI onto one already-connected official MCP Client and one trusted
 * Weaver route. The host retains connection, authentication, and lifetime ownership.
 */
export function createA2UIMcpClientBridge(options: A2UIMcpClientBridgeOptions): A2UIMcpClientBridge {
  const { client, session, routeId, runtime } = options;
  if (typeof routeId !== "string" || routeId.length === 0) throw new TypeError("routeId must not be empty");
  if (typeof runtime !== "object" || runtime === null) throw new TypeError("runtime must be the WeaverRuntime that the session wraps");
  const maxPayloadBytes = options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
  if (!Number.isSafeInteger(maxPayloadBytes) || maxPayloadBytes <= 0) throw new TypeError("maxPayloadBytes must be a positive safe integer");
  const actionToolName = validToolName(options.actionToolName ?? "a2ui_action", "actionToolName");
  const errorToolName = validToolName(options.errorToolName ?? "a2ui_error", "errorToolName");

  const capabilitiesMeta = () => ({ a2ui: { rendererCapabilities: session.getRendererCapabilities() } });
  const report = (diagnostic: A2UIMcpDiagnostic): void => { try { options.onDiagnostic?.(diagnostic); } catch { /* Host callback isolation. */ } };

  async function processTexts(texts: string[], diagnostics: A2UIMcpDiagnostic[], fallbackText: string[]) {
    let processedEnvelopes = 0;
    for (const text of texts) {
      if (utf8ByteLength(text) > maxPayloadBytes) {
        diagnostics.push({ code: "A2UI_MCP_PAYLOAD_TOO_LARGE", maxPayloadBytes });
        continue;
      }
      let parsed: unknown;
      try { parsed = JSON.parse(text); }
      catch { diagnostics.push({ code: "A2UI_MCP_INVALID_JSON" }); continue; }
      const envelopes = Array.isArray(parsed) ? parsed : isRecord(parsed) ? [parsed] : undefined;
      if (envelopes === undefined) {
        diagnostics.push({ code: "A2UI_MCP_INVALID_PAYLOAD_ROOT" });
        continue;
      }
      for (const envelope of envelopes) {
        const result = session.processInbound(routeId, envelope);
        // A refused callRendererFunction carries the error response the agent is waiting for.
        if (!result.ok && "functionResponse" in result && result.functionResponse !== undefined) await replyOrReport(result.functionResponse);
        if (!result.ok && (result.error.code === "SURFACE_ROUTE_MISMATCH" || result.error.code === "SURFACE_ROUTE_UNKNOWN")) {
          diagnostics.push({ code: "A2UI_MCP_ROUTING_REJECTED", routingCode: result.error.code, surfaceId: result.error.surfaceId });
          continue;
        }
        processedEnvelopes += 1;
        if (result.ok) await deliverSettledWork(result);
        if (!result.ok && isMessageProcessorFailure(result)) {
          const delivery = session.prepareValidationErrorDelivery(routeId, envelope, result);
          if (delivery.ok) {
            const sent = await sendDelivery(delivery.value);
            if (!sent.ok) diagnostics.push({ code: "A2UI_MCP_VALIDATION_ERROR_SEND_FAILED" });
          }
        }
      }
    }
    await flushAgentCalls();
    return freezeReceive({ ok: true as const, processedEnvelopes, diagnostics, fallbackText });
  }

  /** Sends the function response of an ok call and the work a settled call resumed. */
  async function deliverSettledWork(result: Extract<WeaverProcessResult, { ok: true }>): Promise<void> {
    const response = session.prepareFunctionResponseDelivery(routeId, result);
    if (response.ok) await replyOrReport(response.value);
    const continuation = "action" in result.value ? result.value.action : undefined;
    if (continuation !== undefined) await deliverContinuation(continuation);
  }

  async function readResource(input: A2UIMcpReadResourceInput): Promise<A2UIMcpReceiveResult> {
    try {
      const result = await client.readResource({ uri: input.uri, _meta: capabilitiesMeta() });
      const diagnostics: A2UIMcpDiagnostic[] = [];
      const texts: string[] = [];
      for (const content of result.contents) {
        if (!isA2UIMime(content.mimeType)) continue;
        if ("text" in content && typeof content.text === "string") texts.push(content.text);
        else if ("blob" in content) diagnostics.push({ code: "A2UI_MCP_BINARY_RESOURCE_UNSUPPORTED" });
      }
      return processTexts(texts, diagnostics, []);
    } catch { return { ok: false, error: { code: "MCP_REQUEST_FAILED" } }; }
  }

  async function callTool(input: A2UIMcpCallToolInput): Promise<A2UIMcpReceiveResult> {
    try {
      const result = await client.callTool({ name: input.name, ...(input.arguments === undefined ? {} : { arguments: structuredClone(input.arguments) }), _meta: capabilitiesMeta() });
      const fallbackText = result.content.flatMap((item) => item.type === "text" ? [item.text] : []);
      if (result.isError === true) return freezeReceive({ ok: false, error: { code: "MCP_TOOL_ERROR", fallbackText } });
      const texts: string[] = [];
      for (const item of result.content) {
        if (item.type !== "resource" || !isUserRenderable(item.annotations?.audience)) continue;
        const resource = item.resource;
        if (isA2UIMime(resource.mimeType) && "text" in resource && typeof resource.text === "string") texts.push(resource.text);
      }
      return processTexts(texts, [], fallbackText);
    } catch { return { ok: false, error: { code: "MCP_REQUEST_FAILED" } }; }
  }

  /** Sends a message through `reply`. Without `reply`, the message is unsupported. */
  async function postReply(delivery: A2UIRoutedDelivery): Promise<A2UIMcpSendResult> {
    if (delivery.routeId !== routeId) return { ok: false, error: { code: "MCP_DELIVERY_ROUTE_MISMATCH" } };
    if (options.reply === undefined) return { ok: false, error: { code: "MCP_DELIVERY_UNSUPPORTED" } };
    try {
      await options.reply(structuredClone(delivery));
      return { ok: true };
    } catch { return { ok: false, error: { code: "MCP_REQUEST_FAILED" } }; }
  }

  async function replyOrReport(delivery: A2UIRoutedDelivery): Promise<void> {
    const sent = await postReply(delivery);
    if (!sent.ok) report({ code: "A2UI_MCP_FUNCTION_RESPONSE_UNDELIVERED" });
  }

  /** A drained call that cannot be delivered is cancelled, so its dependents resolve as failed. */
  async function sendAgentCall(delivery: A2UIRoutedDelivery): Promise<void> {
    if ((await postReply(delivery)).ok) return;
    await cancelCall(delivery);
  }

  async function cancelCall(delivery: A2UIRoutedDelivery): Promise<void> {
    if (!("callAgentFunction" in delivery.message)) return;
    const { functionCallId } = delivery.message.callAgentFunction;
    report({ code: "A2UI_MCP_AGENT_CALL_CANCELLED", functionCallId, reason: "TRANSPORT_FAILED" });
    const cancelled = runtime.cancelAgentFunctionCall(functionCallId, "TRANSPORT_FAILED");
    if (cancelled.ok && cancelled.value.action !== undefined) await deliverContinuation(cancelled.value.action);
  }

  async function sendActionCalls(action: WeaverActionResult): Promise<void> {
    const prepared = session.prepareActionCallDelivery(action);
    if (!prepared.ok) return;
    await Promise.all(prepared.value.map(sendAgentCall));
  }

  async function deliverContinuation(action: WeaverActionResult): Promise<void> {
    if (action.ok && action.value.kind === "serverEvent") {
      const prepared = session.prepareActionDelivery(action);
      if (!prepared.ok) return;
      const sent = await sendDelivery(prepared.value);
      if (!sent.ok) report({ code: "A2UI_MCP_CONTINUATION_UNDELIVERED" });
      return;
    }
    await sendActionCalls(action);
  }

  /**
   * Drains this bridge's route once and sends each call through reply. Calls for other routes stay
   * queued. The drain is deferred to a microtask, so a createSurface that queues calls while
   * processing is recorded first.
   */
  async function flushAgentCalls(): Promise<void> {
    await Promise.resolve();
    const deliveries = session.drainOutbound(routeId);
    await Promise.all(deliveries.map(sendAgentCall));
  }

  async function sendDelivery(delivery: A2UIRoutedDelivery): Promise<A2UIMcpSendResult> {
    if (delivery.routeId !== routeId) return { ok: false, error: { code: "MCP_DELIVERY_ROUTE_MISMATCH" } };
    const message = delivery.message;
    // Responses to a call the agent waits for, and calls, can only travel through `reply`.
    if ("callAgentFunction" in message || "rendererFunctionResponse" in message || ("error" in message && "functionCallId" in message.error)) {
      return postReply(delivery);
    }
    let params;
    if ("error" in message) {
      params = {
        name: errorToolName,
        arguments: structuredClone(message.error),
        _meta: capabilitiesMeta(),
      };
    } else if (!("action" in message)) {
      return { ok: false, error: { code: "MCP_DELIVERY_UNSUPPORTED" } };
    } else {
      params = {
        name: actionToolName,
        arguments: structuredClone({ name: message.action.name, context: message.action.context }),
        _meta: {
          a2ui: {
            rendererCapabilities: session.getRendererCapabilities(),
            action: structuredClone({
              surfaceId: message.action.surfaceId,
              sourceComponentId: message.action.sourceComponentId,
              timestamp: message.action.timestamp,
            }),
            ...(!("rendererDataModel" in delivery) || delivery.rendererDataModel === undefined ? {} : { rendererDataModel: structuredClone(delivery.rendererDataModel) }),
          },
        },
      };
    }
    try {
      const result = await client.callTool(params);
      return result.isError === true ? { ok: false, error: { code: "MCP_TOOL_ERROR" } } : { ok: true };
    } catch { return { ok: false, error: { code: "MCP_REQUEST_FAILED" } }; }
  }


  return Object.freeze({ readResource, callTool, sendDelivery, flushAgentCalls, sendActionCalls });
}

function validToolName(value: string, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${field} must not be empty`);
  return value;
}

function isA2UIMime(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return value.split(";", 1)[0]!.trim().toLowerCase() === A2UI_MIME;
}

function isUserRenderable(audience: readonly string[] | undefined): boolean {
  return audience === undefined || audience.includes("user");
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isMessageProcessorFailure(result: { ok: false; error: unknown }): result is Extract<MessageProcessorResult, { ok: false }> {
  return isRecord(result.error) && (result.error.code === "PROTOCOL_VALIDATION_FAILED" || result.error.code === "CATALOG_REGISTRY_ERROR" || result.error.code === "SURFACE_STORE_ERROR");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function freezeReceive<T>(value: T): T {
  return structuredClone(value);
}

export * from "./application-capabilities.js";

import type { Client } from "@modelcontextprotocol/client";
import type {
  A2UIRouteId,
  MessageProcessorResult,
  A2UIRoutedDelivery,
  A2UIRoutingError,
  A2UITransportSession,
} from "@weaver/core";

const A2UI_MIME = "application/a2ui+json";
const DEFAULT_MAX_PAYLOAD_BYTES = 1024 * 1024;

export interface A2UIMcpClientBridgeOptions {
  client: Client;
  session: A2UITransportSession;
  routeId: A2UIRouteId;
  maxPayloadBytes?: number;
  actionToolName?: string;
  errorToolName?: string;
}

export interface A2UIMcpReadResourceInput { uri: string }
export interface A2UIMcpCallToolInput { name: string; arguments?: Record<string, unknown> }

export type A2UIMcpDiagnostic =
  | { code: "A2UI_MCP_BINARY_RESOURCE_UNSUPPORTED" }
  | { code: "A2UI_MCP_PAYLOAD_TOO_LARGE"; maxPayloadBytes: number }
  | { code: "A2UI_MCP_INVALID_JSON" }
  | { code: "A2UI_MCP_INVALID_PAYLOAD_ROOT" }
  | { code: "A2UI_MCP_ROUTING_REJECTED"; routingCode: Extract<A2UIRoutingError["code"], "SURFACE_ROUTE_MISMATCH" | "SURFACE_ROUTE_UNKNOWN">; surfaceId: string }
  | { code: "A2UI_MCP_VALIDATION_ERROR_SEND_FAILED" };

export type A2UIMcpReceiveResult =
  | { ok: true; processedEnvelopes: number; diagnostics: A2UIMcpDiagnostic[]; fallbackText: string[] }
  | { ok: false; error: { code: "MCP_REQUEST_FAILED" } | { code: "MCP_TOOL_ERROR"; fallbackText: string[] } };

export type A2UIMcpSendResult =
  | { ok: true }
  | { ok: false; error: { code: "MCP_DELIVERY_ROUTE_MISMATCH" } | { code: "MCP_REQUEST_FAILED" } | { code: "MCP_TOOL_ERROR" } };

export interface A2UIMcpClientBridge {
  readResource(input: A2UIMcpReadResourceInput): Promise<A2UIMcpReceiveResult>;
  callTool(input: A2UIMcpCallToolInput): Promise<A2UIMcpReceiveResult>;
  sendDelivery(delivery: A2UIRoutedDelivery): Promise<A2UIMcpSendResult>;
}

/**
 * Maps A2UI onto one already-connected official MCP Client and one trusted
 * Weaver route. The host retains connection, authentication, and lifetime ownership.
 */
export function createA2UIMcpClientBridge(options: A2UIMcpClientBridgeOptions): A2UIMcpClientBridge {
  const { client, session, routeId } = options;
  if (typeof routeId !== "string" || routeId.length === 0) throw new TypeError("routeId must not be empty");
  const maxPayloadBytes = options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
  if (!Number.isSafeInteger(maxPayloadBytes) || maxPayloadBytes <= 0) throw new TypeError("maxPayloadBytes must be a positive safe integer");
  const actionToolName = validToolName(options.actionToolName ?? "a2ui_action", "actionToolName");
  const errorToolName = validToolName(options.errorToolName ?? "a2ui_error", "errorToolName");

  const capabilitiesMeta = () => ({ a2ui: { clientCapabilities: session.getClientCapabilities() } });

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
        if (!result.ok && (result.error.code === "SURFACE_ROUTE_MISMATCH" || result.error.code === "SURFACE_ROUTE_UNKNOWN")) {
          diagnostics.push({ code: "A2UI_MCP_ROUTING_REJECTED", routingCode: result.error.code, surfaceId: result.error.surfaceId });
          continue;
        }
        processedEnvelopes += 1;
        if (!result.ok && isMessageProcessorFailure(result)) {
          const delivery = session.prepareValidationErrorDelivery(routeId, envelope, result);
          if (delivery.ok) {
            const sent = await sendDelivery(delivery.value);
            if (!sent.ok) diagnostics.push({ code: "A2UI_MCP_VALIDATION_ERROR_SEND_FAILED" });
          }
        }
      }
    }
    return freezeReceive({ ok: true as const, processedEnvelopes, diagnostics, fallbackText });
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

  async function sendDelivery(delivery: A2UIRoutedDelivery): Promise<A2UIMcpSendResult> {
    if (delivery.routeId !== routeId) return { ok: false, error: { code: "MCP_DELIVERY_ROUTE_MISMATCH" } };
    let params;
    if ("error" in delivery.message) {
      params = {
        name: errorToolName,
        arguments: structuredClone(delivery.message.error),
        _meta: capabilitiesMeta(),
      };
    } else {
      params = {
        name: actionToolName,
        arguments: structuredClone({ name: delivery.message.action.name, context: delivery.message.action.context }),
        _meta: {
          a2ui: {
            clientCapabilities: session.getClientCapabilities(),
            action: structuredClone({
              surfaceId: delivery.message.action.surfaceId,
              sourceComponentId: delivery.message.action.sourceComponentId,
              timestamp: delivery.message.action.timestamp,
            }),
            ...(!("clientDataModel" in delivery) || delivery.clientDataModel === undefined ? {} : { clientDataModel: structuredClone(delivery.clientDataModel) }),
          },
        },
      };
    }
    try {
      const result = await client.callTool(params);
      return result.isError === true ? { ok: false, error: { code: "MCP_TOOL_ERROR" } } : { ok: true };
    } catch { return { ok: false, error: { code: "MCP_REQUEST_FAILED" } }; }
  }

  return Object.freeze({ readResource, callTool, sendDelivery });
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

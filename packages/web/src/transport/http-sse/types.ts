import type { A2UIRouteId, A2UIRoutedDelivery, A2UITransportSession } from "@weaver/core";

export type BrowserA2UIHttpSseDiagnostic = Readonly<{
  code: "SSE_EVENT_TOO_LARGE" | "SSE_INVALID_JSON" | "INBOUND_PROCESS_FAILED" | "VALIDATION_DELIVERY_FAILED" | "VALIDATION_DELIVERY_ROUTE_MISMATCH";
  message: string;
}>;

export type BrowserA2UIHttpSseRunResult =
  | { ok: true; status: "closed" | "aborted" }
  | { ok: false; error: { code: "TRANSPORT_ALREADY_RUNNING" | "STREAM_FETCH_FAILED" | "STREAM_HTTP_ERROR" | "STREAM_CONTENT_TYPE_INVALID" | "STREAM_BODY_MISSING" | "STREAM_READ_FAILED"; message: string; status?: number } };

export type BrowserA2UIHttpSseSendResult =
  | { ok: true }
  | { ok: false; error: { code: "DELIVERY_ROUTE_MISMATCH" | "SEND_FETCH_FAILED" | "SEND_HTTP_ERROR"; message: string; status?: number } };

export interface BrowserA2UIHttpSseTransport {
  run(options?: { signal?: AbortSignal }): Promise<BrowserA2UIHttpSseRunResult>;
  sendDelivery(delivery: A2UIRoutedDelivery): Promise<BrowserA2UIHttpSseSendResult>;
}

export interface BrowserA2UIHttpSseTransportOptions {
  session: A2UITransportSession;
  routeId: A2UIRouteId;
  streamUrl: string | URL;
  sendUrl: string | URL;
  fetch?: typeof globalThis.fetch;
  maxEventBytes?: number;
  onDiagnostic?: (diagnostic: BrowserA2UIHttpSseDiagnostic) => void;
}

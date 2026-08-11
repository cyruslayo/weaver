import type { A2UIRoutedDelivery, MessageProcessorResult } from "@weaver/core";
import { SseDecoder } from "./SseDecoder.js";
import type { BrowserA2UIHttpSseDiagnostic, BrowserA2UIHttpSseRunResult, BrowserA2UIHttpSseSendResult, BrowserA2UIHttpSseTransport, BrowserA2UIHttpSseTransportOptions } from "./types.js";

const DEFAULT_MAX_EVENT_BYTES = 1_048_576;

export function createBrowserA2UIHttpSseTransport(options: BrowserA2UIHttpSseTransportOptions): BrowserA2UIHttpSseTransport {
  const limit = options.maxEventBytes ?? DEFAULT_MAX_EVENT_BYTES;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("maxEventBytes must be a positive safe integer");
  if (typeof options.routeId !== "string" || options.routeId.length === 0) throw new TypeError("routeId must be a non-empty string");
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new TypeError("fetch is unavailable");
  let running = false;
  let sendTail: Promise<void> = Promise.resolve();

  const diagnostic = (value: BrowserA2UIHttpSseDiagnostic): void => { try { options.onDiagnostic?.(value); } catch { /* trusted callback is isolated */ } };
  const capabilities = () => structuredClone(options.session.getClientCapabilities());

  async function sendNow(delivery: A2UIRoutedDelivery): Promise<BrowserA2UIHttpSseSendResult> {
    if (delivery.routeId !== options.routeId) return { ok: false, error: { code: "DELIVERY_ROUTE_MISMATCH", message: "Delivery route does not match this adapter" } };
    const metadata: Record<string, unknown> = { a2uiClientCapabilities: capabilities() };
    if ("clientDataModel" in delivery && delivery.clientDataModel !== undefined) metadata.a2uiClientDataModel = structuredClone(delivery.clientDataModel);
    const body = { message: structuredClone(delivery.message), metadata };
    try {
      const response = await fetchImpl(options.sendUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) return { ok: false, error: { code: "SEND_HTTP_ERROR", status: response.status, message: `Send endpoint returned HTTP ${response.status}` } };
      return { ok: true };
    } catch {
      return { ok: false, error: { code: "SEND_FETCH_FAILED", message: "Send request failed" } };
    }
  }

  function sendDelivery(delivery: A2UIRoutedDelivery): Promise<BrowserA2UIHttpSseSendResult> {
    if (delivery.routeId !== options.routeId) return Promise.resolve({ ok: false, error: { code: "DELIVERY_ROUTE_MISMATCH", message: "Delivery route does not match this adapter" } });
    const result = sendTail.then(() => sendNow(delivery));
    sendTail = result.then(() => undefined, () => undefined);
    return result;
  }

  async function processEvent(data: string): Promise<void> {
    let input: unknown;
    try { input = JSON.parse(data); }
    catch { diagnostic({ code: "SSE_INVALID_JSON", message: "SSE A2UI event contains invalid JSON" }); return; }
    const result = options.session.processInbound(options.routeId, input);
    if (result.ok) return;
    if (result.error.code === "INVALID_ROUTE_ID" || result.error.code === "SURFACE_ROUTE_MISMATCH" || result.error.code === "SURFACE_ROUTE_UNKNOWN") {
      diagnostic({ code: "INBOUND_PROCESS_FAILED", message: `Inbound processing failed: ${result.error.code}` }); return;
    }
    const delivery = options.session.prepareValidationErrorDelivery(options.routeId, input, result as MessageProcessorResult);
    if (!delivery.ok) { diagnostic({ code: "INBOUND_PROCESS_FAILED", message: `Inbound processing failed: ${result.error.code}` }); return; }
    if (delivery.value.routeId !== options.routeId) { diagnostic({ code: "VALIDATION_DELIVERY_ROUTE_MISMATCH", message: "Validation delivery route does not match this adapter" }); return; }
    const sent = await sendDelivery(delivery.value);
    if (!sent.ok) diagnostic({ code: "VALIDATION_DELIVERY_FAILED", message: `Validation delivery failed: ${sent.error.code}` });
  }

  async function run(runOptions: { signal?: AbortSignal } = {}): Promise<BrowserA2UIHttpSseRunResult> {
    if (running) return { ok: false, error: { code: "TRANSPORT_ALREADY_RUNNING", message: "Transport is already running" } };
    running = true;
    try {
      if (runOptions.signal?.aborted) return { ok: true, status: "aborted" };
      let response: Response;
      try {
        response = await fetchImpl(options.streamUrl, { method: "POST", headers: { Accept: "text/event-stream", "Content-Type": "application/json" }, body: JSON.stringify({ metadata: { a2uiClientCapabilities: capabilities() } }), ...(runOptions.signal === undefined ? {} : { signal: runOptions.signal }) });
      } catch { return runOptions.signal?.aborted ? { ok: true, status: "aborted" } : { ok: false, error: { code: "STREAM_FETCH_FAILED", message: "Stream request failed" } }; }
      if (!response.ok) return { ok: false, error: { code: "STREAM_HTTP_ERROR", status: response.status, message: `Stream endpoint returned HTTP ${response.status}` } };
      const mime = response.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase();
      if (mime !== "text/event-stream") return { ok: false, error: { code: "STREAM_CONTENT_TYPE_INVALID", message: "Stream response must be text/event-stream" } };
      if (response.body === null) return { ok: false, error: { code: "STREAM_BODY_MISSING", message: "Stream response has no body" } };
      const reader = response.body.getReader(); const text = new TextDecoder(); const decoder = new SseDecoder(limit);
      try {
        while (true) {
          const read = await reader.read();
          if (read.done) { decoder.finish(); return runOptions.signal?.aborted ? { ok: true, status: "aborted" } : { ok: true, status: "closed" }; }
          const decoded = decoder.push(text.decode(read.value, { stream: true }));
          for (let index = 0; index < decoded.oversized; index++) diagnostic({ code: "SSE_EVENT_TOO_LARGE", message: `SSE event exceeds ${limit} bytes` });
          for (const event of decoded.events) if (event.data !== "" && (event.type === undefined || event.type === "message" || event.type === "a2ui")) await processEvent(event.data);
        }
      } catch { return runOptions.signal?.aborted ? { ok: true, status: "aborted" } : { ok: false, error: { code: "STREAM_READ_FAILED", message: "Stream read failed" } }; }
    } finally { running = false; }
  }
  return Object.freeze({ run, sendDelivery });
}

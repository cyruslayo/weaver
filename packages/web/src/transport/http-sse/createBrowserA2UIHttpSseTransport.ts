import type { A2UIRoutedDelivery, MessageProcessorResult } from "@weaver/core";
import { SseDecoder } from "./SseDecoder.js";
import type { BrowserA2UIHttpSseDiagnostic, BrowserA2UIHttpSseRunOptions, BrowserA2UIHttpSseRunResult, BrowserA2UIHttpSseSendResult, BrowserA2UIHttpSseTransport, BrowserA2UIHttpSseTransportOptions } from "./types.js";

const DEFAULT_MAX_EVENT_BYTES = 1_048_576;
const DEFAULT_RECONNECT_DELAY_MS = 1_000;
type RetriableFailure = "STREAM_CLOSED" | "STREAM_FETCH_FAILED" | "STREAM_READ_FAILED";

export function createBrowserA2UIHttpSseTransport(options: BrowserA2UIHttpSseTransportOptions): BrowserA2UIHttpSseTransport {
  const limit = options.maxEventBytes ?? DEFAULT_MAX_EVENT_BYTES;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("maxEventBytes must be a positive safe integer");
  if (typeof options.routeId !== "string" || options.routeId.length === 0) throw new TypeError("routeId must be a non-empty string");
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new TypeError("fetch is unavailable");
  let running = false;
  let sendTail: Promise<void> = Promise.resolve();
  let lastEventId = "";

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
    } catch { return { ok: false, error: { code: "SEND_FETCH_FAILED", message: "Send request failed" } }; }
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

  async function openStream(signal: AbortSignal | undefined): Promise<BrowserA2UIHttpSseRunResult | RetriableFailure> {
    const headers: Record<string, string> = { Accept: "text/event-stream", "Content-Type": "application/json" };
    if (isHeaderSafeCursor(lastEventId) && lastEventId !== "") headers["Last-Event-ID"] = lastEventId;
    let response: Response;
    try {
      response = await fetchImpl(options.streamUrl, { method: "POST", headers, body: JSON.stringify({ metadata: { a2uiClientCapabilities: capabilities() } }), ...(signal === undefined ? {} : { signal }) });
    } catch { return signal?.aborted ? { ok: true, status: "aborted" } : "STREAM_FETCH_FAILED"; }
    if (headers["Last-Event-ID"] !== undefined && response.status === 410) {
      diagnostic({ code: "RESUME_UNAVAILABLE", message: "Server cannot resume from the stored SSE event ID" });
      return { ok: false, error: { code: "RESUME_UNAVAILABLE", status: 410, message: "Server cannot resume from the stored SSE event ID" } };
    }
    if (!response.ok) return { ok: false, error: { code: "STREAM_HTTP_ERROR", status: response.status, message: `Stream endpoint returned HTTP ${response.status}` } };
    const mime = response.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (mime !== "text/event-stream") return { ok: false, error: { code: "STREAM_CONTENT_TYPE_INVALID", message: "Stream response must be text/event-stream" } };
    if (response.body === null) return { ok: false, error: { code: "STREAM_BODY_MISSING", message: "Stream response has no body" } };
    const reader = response.body.getReader(); const text = new TextDecoder(); const decoder = new SseDecoder(limit);
    try {
      while (true) {
        const read = await reader.read();
        if (read.done) { decoder.finish(); return signal?.aborted ? { ok: true, status: "aborted" } : "STREAM_CLOSED"; }
        const decoded = decoder.push(text.decode(read.value, { stream: true }));
        for (let index = 0; index < decoded.oversized; index++) diagnostic({ code: "SSE_EVENT_TOO_LARGE", message: `SSE event exceeds ${limit} bytes` });
        for (const event of decoded.events) {
          lastEventId = event.lastEventId;
          if (event.data !== "" && (event.type === undefined || event.type === "message" || event.type === "a2ui")) await processEvent(event.data);
        }
      }
    } catch { return signal?.aborted ? { ok: true, status: "aborted" } : "STREAM_READ_FAILED"; }
  }

  async function run(runOptions: BrowserA2UIHttpSseRunOptions = {}): Promise<BrowserA2UIHttpSseRunResult> {
    if (running) return { ok: false, error: { code: "TRANSPORT_ALREADY_RUNNING", message: "Transport is already running" } };
    const reconnect = validateReconnect(runOptions.reconnect);
    running = true;
    try {
      if (runOptions.signal?.aborted) return { ok: true, status: "aborted" };
      let attempts = 0;
      while (true) {
        const result = await openStream(runOptions.signal);
        if (typeof result !== "string") return result;
        if (reconnect === undefined) {
          if (result === "STREAM_CLOSED") return { ok: true, status: "closed" };
          return { ok: false, error: { code: result, message: result === "STREAM_FETCH_FAILED" ? "Stream request failed" : "Stream read failed" } };
        }
        if (attempts >= reconnect.maxAttempts) return { ok: false, error: { code: "RECONNECT_EXHAUSTED", message: "Reconnect attempt budget exhausted", attempts, lastFailureCode: result } };
        diagnostic({ code: "RECONNECT_SCHEDULED", message: `Reconnect attempt ${attempts + 1} scheduled` });
        if (!(await abortableDelay(reconnect.delayMs, runOptions.signal))) return { ok: true, status: "aborted" };
        attempts += 1;
        if (runOptions.signal?.aborted) return { ok: true, status: "aborted" };
      }
    } finally { running = false; }
  }
  return Object.freeze({ run, sendDelivery });
}

function validateReconnect(value: BrowserA2UIHttpSseRunOptions["reconnect"]): { maxAttempts: number; delayMs: number } | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value.maxAttempts) || !Number.isInteger(value.maxAttempts) || value.maxAttempts < 0) throw new RangeError("reconnect.maxAttempts must be a finite non-negative integer");
  const delayMs = value.delayMs ?? DEFAULT_RECONNECT_DELAY_MS;
  if (!Number.isFinite(delayMs) || delayMs < 0) throw new RangeError("reconnect.delayMs must be finite and non-negative");
  return { maxAttempts: value.maxAttempts, delayMs };
}
function isHeaderSafeCursor(value: string): boolean { return !/[\0\r\n]/u.test(value); }
function abortableDelay(delayMs: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise(resolve => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = (completed: boolean) => { if (timer !== undefined) clearTimeout(timer); signal?.removeEventListener("abort", abort); resolve(completed); };
    const abort = () => done(false);
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => done(true), delayMs);
  });
}

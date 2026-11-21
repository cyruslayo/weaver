import type { A2UIRoutedDelivery, MessageProcessorResult, WeaverActionResult, WeaverRuntime } from "@cylayo/weaver-core";
import { SseDecoder } from "./SseDecoder.js";
import type { BrowserA2UIHttpSseDiagnostic, BrowserA2UIHttpSseRunOptions, BrowserA2UIHttpSseRunResult, BrowserA2UIHttpSseSendResult, BrowserA2UIHttpSseTransport, BrowserA2UIHttpSseTransportOptions } from "./types.js";

const DEFAULT_MAX_EVENT_BYTES = 1_048_576;
const DEFAULT_RECONNECT_DELAY_MS = 1_000;
type RetriableFailure = "STREAM_CLOSED" | "STREAM_FETCH_FAILED" | "STREAM_READ_FAILED";

export function createBrowserA2UIHttpSseTransport(options: BrowserA2UIHttpSseTransportOptions): BrowserA2UIHttpSseTransport {
  const limit = options.maxEventBytes ?? DEFAULT_MAX_EVENT_BYTES;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("maxEventBytes must be a positive safe integer");
  if (typeof options.routeId !== "string" || options.routeId.length === 0) throw new TypeError("routeId must be a non-empty string");
  if (typeof options.runtime !== "object" || options.runtime === null) throw new TypeError("runtime must be the WeaverRuntime that the session wraps");
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new TypeError("fetch is unavailable");
  const runtime: WeaverRuntime = options.runtime;
  let running = false;
  let sendTail: Promise<void> = Promise.resolve();
  let lastEventId = "";

  const diagnostic = (value: BrowserA2UIHttpSseDiagnostic): void => { try { options.onDiagnostic?.(value); } catch { /* trusted callback is isolated */ } };
  const capabilities = () => structuredClone(options.session.getRendererCapabilities());

  async function sendNow(delivery: A2UIRoutedDelivery): Promise<BrowserA2UIHttpSseSendResult> {
    if (delivery.routeId !== options.routeId) return { ok: false, error: { code: "DELIVERY_ROUTE_MISMATCH", message: "Delivery route does not match this adapter" } };
    const metadata: Record<string, unknown> = { a2uiRendererCapabilities: capabilities() };
    if ("rendererDataModel" in delivery && delivery.rendererDataModel !== undefined) metadata.a2uiRendererDataModel = structuredClone(delivery.rendererDataModel);
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

  /**
   * Sends one callAgentFunction. When it cannot be sent, the pending call is
   * cancelled with TRANSPORT_FAILED, and an action that the cancellation resumes
   * is delivered too.
   */
  async function sendAgentCall(delivery: A2UIRoutedDelivery): Promise<void> {
    const sent = await sendDelivery(delivery);
    if (sent.ok) return;
    diagnostic({ code: "AGENT_CALL_DELIVERY_FAILED", message: `Agent call delivery failed: ${sent.error.code}` });
    await cancelCall(delivery);
  }

  /** Cancels the call that a delivery carries with TRANSPORT_FAILED, and delivers the action that cancellation resumes. */
  async function cancelCall(delivery: A2UIRoutedDelivery): Promise<void> {
    if (!("callAgentFunction" in delivery.message)) return;
    const cancelled = runtime.cancelAgentFunctionCall(delivery.message.callAgentFunction.functionCallId, "TRANSPORT_FAILED");
    if (cancelled.ok && cancelled.value.action !== undefined) await deliverContinuation(cancelled.value.action);
  }

  /**
   * Sends the callAgentFunction messages of an action result. A message for another route
   * fails the route check in sendDelivery, so it is cancelled rather than sent elsewhere.
   * Other kinds are not handled here.
   */
  async function sendActionCallMessages(action: WeaverActionResult): Promise<void> {
    const prepared = options.session.prepareActionCallDelivery(action);
    if (!prepared.ok) return;
    await Promise.all(prepared.value.map(sendAgentCall));
  }

  /**
   * An action that a settled call resumed. A server event goes to the route that
   * owns its surface, and agent calls go through sendAgentCall. The host must not
   * send a resumed action again.
   */
  async function deliverContinuation(action: WeaverActionResult): Promise<void> {
    if (action.ok && action.value.kind === "serverEvent") {
      const prepared = options.session.prepareActionDelivery(action);
      if (!prepared.ok) return;
      const sent = await sendDelivery(prepared.value);
      if (!sent.ok) diagnostic({ code: "CONTINUATION_DELIVERY_FAILED", message: `Resumed action delivery failed: ${sent.error.code}` });
      return;
    }
    await sendActionCallMessages(action);
  }

  /** Takes the queued callAgentFunction messages now and sends each one. The drain itself is synchronous. */
  async function flushAgentCalls(): Promise<void> {
    // Deferred to a microtask: a createSurface that carries calls queues them while processing, before its route is recorded.
    await Promise.resolve();
    // Only this route's calls are taken. Calls for other routes stay queued for their own adapter.
    const deliveries = options.session.drainOutbound(options.routeId);
    await Promise.all(deliveries.map(sendAgentCall));
  }

  async function sendFunctionResponse(delivery: A2UIRoutedDelivery): Promise<void> {
    const sent = await sendDelivery(delivery);
    if (!sent.ok) diagnostic({ code: "FUNCTION_RESPONSE_DELIVERY_FAILED", message: `Function response delivery failed: ${sent.error.code}` });
  }

  async function processEvent(data: string): Promise<void> {
    let input: unknown;
    try { input = JSON.parse(data); }
    catch { diagnostic({ code: "SSE_INVALID_JSON", message: "SSE A2UI event contains invalid JSON" }); return; }
    const result = options.session.processInbound(options.routeId, input);
    if (result.ok) {
      const response = options.session.prepareFunctionResponseDelivery(options.routeId, result);
      if (response.ok) await sendFunctionResponse(response.value);
      // A settled call can resume an action. Core attaches that action to the runtime result.
      const continuation = "action" in result.value ? result.value.action : undefined;
      if (continuation !== undefined) await deliverContinuation(continuation);
      await flushAgentCalls();
      return;
    }
    // A routing refusal of a callRendererFunction carries its error response, which goes back on the inbound route.
    if ("functionResponse" in result && result.functionResponse !== undefined) await sendFunctionResponse(result.functionResponse);
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
      response = await fetchImpl(options.streamUrl, { method: "POST", headers, body: JSON.stringify({ metadata: { a2uiRendererCapabilities: capabilities() } }), ...(signal === undefined ? {} : { signal }) });
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
  return Object.freeze({
    run,
    sendDelivery,
    flushAgentCalls,
    sendActionCalls: (action: WeaverActionResult) => sendActionCallMessages(action),
  });
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

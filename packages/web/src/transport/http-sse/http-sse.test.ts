import assert from "node:assert/strict";
import { test } from "node:test";
import type { A2UIRoutedDelivery, A2UITransportSession } from "@weaver/core";
import { createBrowserA2UIHttpSseTransport } from "./createBrowserA2UIHttpSseTransport.js";

const encoder = new TextEncoder();
function response(chunks: Uint8Array[], type = "text/event-stream"): Response {
  return new Response(new ReadableStream<Uint8Array>({ start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); } }), { headers: { "Content-Type": type } });
}
function session(inputs: unknown[]): A2UITransportSession {
  return {
    processInbound(_route, input) { inputs.push(input); return { ok: true, value: { operation: "surfaceDeleted", surfaceId: "x" } }; },
    getSurfaceRoute() { return undefined; },
    prepareActionDelivery() { return { ok: false, error: { code: "ACTION_DELIVERY_UNAVAILABLE" } }; },
    prepareValidationErrorDelivery() { return { ok: false, error: { code: "NOT_A_VALIDATION_FAILURE" } }; },
    getClientCapabilities() { return { "v0.9": { supportedCatalogIds: ["basic"] } }; },
  };
}

async function decode(text: string, split?: number[]): Promise<{ inputs: unknown[]; diagnostics: string[] }> {
  const bytes = encoder.encode(text); let at = 0;
  const chunks = (split ?? [bytes.length]).map(size => { const value = bytes.slice(at, at + size); at += size; return value; });
  if (at < bytes.length) chunks.push(bytes.slice(at));
  const inputs: unknown[] = []; const diagnostics: string[] = [];
  const adapter = createBrowserA2UIHttpSseTransport({ session: session(inputs), routeId: "trusted", streamUrl: "/stream", sendUrl: "/send", fetch: async () => response(chunks), onDiagnostic: value => diagnostics.push(value.code) });
  assert.deepEqual(await adapter.run(), { ok: true, status: "closed" });
  return { inputs, diagnostics };
}

test("incrementally decodes UTF-8 and LF, CRLF, CR and split terminators", async () => {
  const value = JSON.stringify({ text: "€" }); const prefix = encoder.encode(`data: ${value}\r\n\r\n`); const euro = encoder.encode("€");
  const euroAt = prefix.findIndex((byte, index) => byte === euro[0] && prefix[index + 1] === euro[1]);
  assert.deepEqual((await decode(`data: ${value}\r\n\r\n`, [euroAt + 1, 1, 2, 1])).inputs, [{ text: "€" }]);
  assert.equal((await decode('data: {"line":"lf"}\n\n')).inputs.length, 1);
  assert.equal((await decode('data: {"line":"cr"}\r\r')).inputs.length, 1);
});

test("implements SSE fields, event filtering, comments, empty and incomplete EOF", async () => {
  const stream = ': heartbeat\n\nunknown: x\ndata: {"a":\ndata: 1}\n\nevent: ping\ndata: {"ignored":true}\n\nevent: a2ui\ndata: {"b":2}\n\ndata: {"c":3}\n\n\ndata: {"incomplete":true}';
  assert.deepEqual((await decode(stream)).inputs, [{ a: 1 }, { b: 2 }, { c: 3 }]);
});

test("processes multiple/chunked events in order and recovers after malformed JSON", async () => {
  const result = await decode('data: {bad}\n\ndata: {"n":1}\n\ndata: {"n":2}\n\n', [1, 2, 3, 4, 5]);
  assert.deepEqual(result.inputs, [{ n: 1 }, { n: 2 }]);
  assert.deepEqual(result.diagnostics, ["SSE_INVALID_JSON"]);
});

test("discards oversized event and recovers at blank line", async () => {
  const inputs: unknown[] = []; const diagnostics: string[] = [];
  const adapter = createBrowserA2UIHttpSseTransport({ session: session(inputs), routeId: "A", streamUrl: "/s", sendUrl: "/p", maxEventBytes: 8, fetch: async () => response([encoder.encode('data: 123456789\n\ndata: {"x":1}\n\n')]), onDiagnostic: d => diagnostics.push(d.code) });
  await adapter.run(); assert.deepEqual(inputs, [{ x: 1 }]); assert.deepEqual(diagnostics, ["SSE_EVENT_TOO_LARGE"]);
});

test("opens POST event stream with capabilities and validates response", async () => {
  let request: { input: RequestInfo | URL; init?: RequestInit } | undefined;
  const adapter = createBrowserA2UIHttpSseTransport({ session: session([]), routeId: "local", streamUrl: "/stream", sendUrl: "/send", fetch: async (input, init) => { request = { input, init }; return response([]); } });
  assert.deepEqual(await adapter.run(), { ok: true, status: "closed" });
  assert.equal(request?.init?.method, "POST"); assert.equal((request?.init?.headers as Record<string,string>).Accept, "text/event-stream");
  assert.deepEqual(JSON.parse(String(request?.init?.body)), { metadata: { a2uiClientCapabilities: { "v0.9": { supportedCatalogIds: ["basic"] } } } });
  assert.equal(JSON.stringify(request).includes("routeId"), false);
  const bad = createBrowserA2UIHttpSseTransport({ session: session([]), routeId: "A", streamUrl: "/", sendUrl: "/", fetch: async () => new Response("", { status: 500 }) });
  assert.equal((await bad.run()).ok, false);
  const mime = createBrowserA2UIHttpSseTransport({ session: session([]), routeId: "A", streamUrl: "/", sendUrl: "/", fetch: async () => response([], "text/html") });
  assert.equal((await mime.run()).ok, false);
});

test("serializes exact outbound wrappers, omits optional model, and recovers after failure", async () => {
  const calls: string[] = []; let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let first = true;
  const adapter = createBrowserA2UIHttpSseTransport({ session: session([]), routeId: "A", streamUrl: "/s", sendUrl: "/send", fetch: async (_input, init) => { const body = String(init?.body); calls.push(body); if (first) { first = false; await gate; return new Response("", { status: 500 }); } return new Response(null, { status: 204 }); } });
  const message = { version: "v0.9.1", action: { name: "go", surfaceId: "X", sourceComponentId: "root", timestamp: "2026-01-01T00:00:00.000Z", context: {} } } as const;
  const a = adapter.sendDelivery({ routeId: "A", message }); const b = adapter.sendDelivery({ routeId: "A", message, clientDataModel: { version: "v0.9.1", surfaces: { X: { n: 1 } } } });
  await Promise.resolve(); assert.equal(calls.length, 1); release(); assert.equal((await a).ok, false); assert.equal((await b).ok, true); assert.equal(calls.length, 2);
  const firstBody = JSON.parse(calls[0]!); const secondBody = JSON.parse(calls[1]!); assert.deepEqual(firstBody.message, message); assert.equal("a2uiClientDataModel" in firstBody.metadata, false); assert.deepEqual(secondBody.metadata.a2uiClientDataModel.surfaces.X, { n: 1 });
  const before = calls.length; const mismatch: A2UIRoutedDelivery = { routeId: "B", message }; assert.equal((await adapter.sendDelivery(mismatch)).ok, false); assert.equal(calls.length, before);
});

test("targets two routed surfaces and their data models through only the matching adapter", async () => {
  const urls: string[] = [];
  const fetch = async (input: RequestInfo | URL) => { urls.push(String(input)); return new Response(null, { status: 204 }); };
  const a = createBrowserA2UIHttpSseTransport({ session: session([]), routeId: "A", streamUrl: "/stream-a", sendUrl: "/send-a", fetch });
  const b = createBrowserA2UIHttpSseTransport({ session: session([]), routeId: "B", streamUrl: "/stream-b", sendUrl: "/send-b", fetch });
  const make = (routeId: string, surfaceId: string): A2UIRoutedDelivery => ({ routeId, message: { version: "v0.9.1", action: { name: "go", surfaceId, sourceComponentId: "root", timestamp: "2026-01-01T00:00:00.000Z", context: {} } }, clientDataModel: { version: "v0.9.1", surfaces: { [surfaceId]: { owner: routeId } } } });
  const x = make("A", "X"); const y = make("B", "Y");
  assert.equal((await a.sendDelivery(x)).ok, true); assert.equal((await b.sendDelivery(x)).ok, false);
  assert.equal((await b.sendDelivery(y)).ok, true); assert.equal((await a.sendDelivery(y)).ok, false);
  assert.deepEqual(urls, ["/send-a", "/send-b"]);
});

test("automatically posts a session-prepared validation failure", async () => {
  const requests: RequestInit[] = []; const inputs: unknown[] = [];
  const fake = session(inputs);
  fake.processInbound = () => ({ ok: false, error: { code: "PROTOCOL_VALIDATION_FAILED", issues: [{ code: "VALIDATION_FAILED", path: "/", message: "invalid" }] } });
  fake.prepareValidationErrorDelivery = routeId => ({ ok: true, value: { routeId, message: { version: "v0.9.1", error: { code: "VALIDATION_FAILED", surfaceId: "X", path: "/", message: "invalid" } } } });
  const adapter = createBrowserA2UIHttpSseTransport({ session: fake, routeId: "A", streamUrl: "/stream", sendUrl: "/send", fetch: async (input, init) => { if (String(input) === "/stream") return response([encoder.encode('data: {"version":"bad"}\n\n')]); requests.push(init ?? {}); return new Response(null, { status: 204 }); } });
  assert.equal((await adapter.run()).ok, true); assert.equal(requests.length, 1);
  assert.equal(JSON.parse(String(requests[0]?.body)).message.error.code, "VALIDATION_FAILED");
});

test("rejects concurrent run, permits rerun, and reports pre-abort deterministically", async () => {
  let close!: () => void; const stream = new ReadableStream<Uint8Array>({ start(controller) { close = () => controller.close(); } });
  let count = 0; const adapter = createBrowserA2UIHttpSseTransport({ session: session([]), routeId: "A", streamUrl: "/", sendUrl: "/", fetch: async () => { count++; return count === 1 ? new Response(stream, { headers: { "Content-Type": "text/event-stream" } }) : response([]); } });
  const active = adapter.run(); assert.equal((await adapter.run()).ok, false); close(); assert.equal((await active).ok, true); assert.deepEqual(await adapter.run(), { ok: true, status: "closed" });
  const controller = new AbortController(); controller.abort(); assert.deepEqual(await adapter.run({ signal: controller.signal }), { ok: true, status: "aborted" });
});

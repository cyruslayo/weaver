import assert from "node:assert/strict";
import { test } from "node:test";
import { createA2UITransportSession, createWeaverRuntime, type A2UIRoutedDelivery, type A2UITransportSession, type JsonObject } from "@weaver/core";
import { createBrowserA2UIHttpSseTransport } from "./createBrowserA2UIHttpSseTransport.js";
import { startReferenceServer, type ReceivedClientMessage } from "./reference-server.test-helper.js";

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

const integrationSchema: JsonObject = {
  $schema: "https://json-schema.org/draft/2020-12/schema", catalogId: "basic",
  components: {
    Button: { type: "object", properties: { id: { type: "string" }, component: { const: "Button" }, action: { $ref: "common_types.json#/$defs/Action" } }, required: ["id", "component", "action"], additionalProperties: false },
  },
  $defs: { theme: { type: "object", additionalProperties: false }, commonTypes: { $id: "common_types.json", $defs: {
    Action: { type: "object", properties: { event: { type: "object", properties: { name: { type: "string" }, context: { type: "object" } }, required: ["name", "context"], additionalProperties: false } }, required: ["event"], additionalProperties: false },
  } } },
};
function integration() { const made = createWeaverRuntime({ catalogs: [{ catalogId: "basic", schema: integrationSchema }], now: () => new Date("2026-01-01T00:00:00.000Z") }); assert.ok(made.ok); return { runtime: made.value, session: createA2UITransportSession({ runtime: made.value }) }; }
const createMessage = (surfaceId: string, sendDataModel = false) => ({ version: "v0.9.1", createSurface: { surfaceId, catalogId: "basic", sendDataModel } });
const componentsMessage = (surfaceId: string) => ({ version: "v0.9.1", updateComponents: { surfaceId, components: [{ id: "root", component: "Button", action: { event: { name: "go", context: { fixed: 1 } } } }] } });
const dataMessage = (surfaceId: string, owner: string) => ({ version: "v0.9.1", updateDataModel: { surfaceId, value: { owner } } });
async function waitFor(predicate: () => boolean): Promise<void> { for (let n = 0; n < 100 && !predicate(); n++) await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(predicate(), true); }

test("real loopback stream updates runtime, posts action/model and validation failure, and preserves ownership across reopen", async () => {
  const opened: Record<string, unknown>[] = []; const received: ReceivedClientMessage[] = [];
  const server = await startReferenceServer({ onStreamOpen: value => { opened.push(value); }, onClientMessage: value => { received.push(value); } });
  const { runtime, session: transportSession } = integration(); const diagnostics: string[] = [];
  const adapter = createBrowserA2UIHttpSseTransport({ session: transportSession, routeId: "A", streamUrl: server.streamUrl, sendUrl: server.sendUrl, onDiagnostic: d => diagnostics.push(d.message) });
  let run = adapter.run();
  try {
    await waitFor(() => opened.length === 1); assert.deepEqual(opened[0], { "v0.9": { supportedCatalogIds: ["basic"] } });
    assert.equal((await server.sendA2UI(createMessage("X", true))).ok, true);
    assert.equal((await server.sendA2UI(componentsMessage("X"))).ok, true);
    assert.equal((await server.sendA2UI(dataMessage("X", "A"))).ok, true);
    await waitFor(() => runtime.getSurface("X")?.dataModel !== undefined);
    assert.equal(runtime.getSurface("X")?.components.root?.component, "Button"); assert.deepEqual(runtime.getSurface("X")?.dataModel, { owner: "A" }); assert.equal(transportSession.getSurfaceRoute("X"), "A");
    const action = runtime.dispatchAction({ surfaceId: "X", sourceComponentId: "root", scopePath: "/", actionProperty: "action" });
    const delivery = transportSession.prepareActionDelivery(action); assert.ok(delivery.ok); assert.equal((await adapter.sendDelivery(delivery.value)).ok, true);
    await waitFor(() => received.length === 1); assert.equal(received[0]?.message.version, "v0.9.1"); assert.deepEqual(received[0]?.message.action, { name: "go", surfaceId: "X", sourceComponentId: "root", timestamp: "2026-01-01T00:00:00.000Z", context: { fixed: 1 } }); assert.deepEqual(received[0]?.clientDataModel, { version: "v0.9.1", surfaces: { X: { owner: "A" } } });
    assert.deepEqual(received[0]?.capabilities, { "v0.9": { supportedCatalogIds: ["basic"] } }); assert.equal(JSON.stringify(received).includes("routeId"), false);
    await server.sendA2UI({ version: "v0.9.1", updateComponents: { surfaceId: "X", components: [] } });
    await waitFor(() => received.length === 2); assert.deepEqual(received[1]?.message, { version: "v0.9.1", error: { code: "VALIDATION_FAILED", surfaceId: "X", path: "/updateComponents/components", message: "Expected at least one component" } });
    server.closeStream(); assert.deepEqual(await run, { ok: true, status: "closed" }); assert.equal(transportSession.getSurfaceRoute("X"), "A");
    run = adapter.run(); await waitFor(() => opened.length === 2); await server.sendA2UI({ version: "v0.9.1", deleteSurface: { surfaceId: "X" } }); await waitFor(() => runtime.getSurface("X") === undefined); assert.equal(transportSession.getSurfaceRoute("X"), undefined);
    assert.deepEqual(diagnostics, []);
  } finally { server.closeStream(); await run; await server.close(); }
});

test("two real loopback peers target only their owned route and reject cross-route mutation", async () => {
  const aReceived: ReceivedClientMessage[] = []; const bReceived: ReceivedClientMessage[] = []; let aOpen = false; let bOpen = false;
  const aServer = await startReferenceServer({ onStreamOpen: () => { aOpen = true; }, onClientMessage: m => { aReceived.push(m); } }); const bServer = await startReferenceServer({ onStreamOpen: () => { bOpen = true; }, onClientMessage: m => { bReceived.push(m); } });
  const { runtime, session: shared } = integration(); const bDiagnostics: string[] = [];
  const a = createBrowserA2UIHttpSseTransport({ session: shared, routeId: "A", streamUrl: aServer.streamUrl, sendUrl: aServer.sendUrl }); const b = createBrowserA2UIHttpSseTransport({ session: shared, routeId: "B", streamUrl: bServer.streamUrl, sendUrl: bServer.sendUrl, onDiagnostic: d => bDiagnostics.push(d.message) });
  const arun = a.run(); const brun = b.run();
  try {
    await waitFor(() => aOpen && bOpen); for (const [server, id, owner] of [[aServer, "X", "A"], [bServer, "Y", "B"]] as const) { await server.sendA2UI(createMessage(id, true)); await server.sendA2UI(componentsMessage(id)); await server.sendA2UI(dataMessage(id, owner)); }
    await waitFor(() => runtime.getSurface("Y")?.dataModel !== undefined); assert.equal(shared.getSurfaceRoute("X"), "A"); assert.equal(shared.getSurfaceRoute("Y"), "B");
    await bServer.sendA2UI(dataMessage("X", "intruder")); await waitFor(() => bDiagnostics.length === 1); assert.deepEqual(runtime.getSurface("X")?.dataModel, { owner: "A" }); assert.equal(bReceived.length, 0);
    for (const [adapter, id] of [[a, "X"], [b, "Y"]] as const) { const routed = shared.prepareActionDelivery(runtime.dispatchAction({ surfaceId: id, sourceComponentId: "root", scopePath: "/", actionProperty: "action" })); assert.ok(routed.ok); assert.equal((await adapter.sendDelivery(routed.value)).ok, true); }
    await waitFor(() => aReceived.length === 1 && bReceived.length === 1); assert.deepEqual((aReceived[0]?.clientDataModel as { surfaces: object }).surfaces, { X: { owner: "A" } }); assert.deepEqual((bReceived[0]?.clientDataModel as { surfaces: object }).surfaces, { Y: { owner: "B" } });
  } finally { aServer.closeStream(); bServer.closeStream(); await Promise.all([arun, brun]); await Promise.all([aServer.close(), bServer.close()]); }
});

test("SSE IDs persist, reset, ignore NUL, advance on ignored/malformed/empty events, and omit incomplete IDs", async () => {
  const headers: Array<Record<string, string>> = []; let call = 0; const inputs: unknown[] = []; const diagnostics: string[] = [];
  const streams = [
    'id: 1\ndata: {"n":1}\n\ndata: {bad}\n\nevent: ping\nid: 2\ndata: alive\n\nid: 3\n\nid: incomplete',
    'data: {"n":2}\n\nid:\ndata: {"reset":true}\n\nid: bad\0value\ndata: {"n":3}\n\n',
    "",
  ];
  const adapter = createBrowserA2UIHttpSseTransport({ session: session(inputs), routeId: "A", streamUrl: "/stream", sendUrl: "/send", fetch: async (_input, init) => { headers.push(init?.headers as Record<string, string>); return response([encoder.encode(streams[call++]!)]); }, onDiagnostic: d => diagnostics.push(d.code) });
  await adapter.run(); await adapter.run(); await adapter.run();
  assert.equal(headers[0]?.["Last-Event-ID"], undefined); assert.equal(headers[1]?.["Last-Event-ID"], "3"); assert.equal(headers[2]?.["Last-Event-ID"], undefined);
  assert.deepEqual(inputs, [{ n: 1 }, { n: 2 }, { reset: true }, { n: 3 }]); assert.deepEqual(diagnostics, ["SSE_INVALID_JSON"]);
});

test("bounded reconnect retries clean EOF/fetch/read failures, preserves one run, and exhausts exactly", async () => {
  let calls = 0; let reads = 0;
  const adapter = createBrowserA2UIHttpSseTransport({ session: session([]), routeId: "A", streamUrl: "/", sendUrl: "/", fetch: async () => {
    calls++; if (calls === 1) return response([]); if (calls === 2) throw new Error("network");
    return new Response(new ReadableStream<Uint8Array>({ pull(controller) { reads++; if (reads === 1) controller.error(new Error("read")); } }), { headers: { "Content-Type": "text/event-stream" } });
  } });
  const run = adapter.run({ reconnect: { maxAttempts: 2, delayMs: 0 } }); assert.equal((await adapter.run()).ok, false);
  assert.deepEqual(await run, { ok: false, error: { code: "RECONNECT_EXHAUSTED", message: "Reconnect attempt budget exhausted", attempts: 2, lastFailureCode: "STREAM_READ_FAILED" } }); assert.equal(calls, 3);
  await assert.rejects(adapter.run({ reconnect: { maxAttempts: Infinity } }), RangeError);
});

test("reconnect delay and active/reconnect fetch abort immediately without another request", async () => {
  for (const mode of ["delay", "fetch"] as const) {
    let calls = 0; const controller = new AbortController();
    const adapter = createBrowserA2UIHttpSseTransport({ session: session([]), routeId: "A", streamUrl: "/", sendUrl: "/", fetch: async (_input, init) => {
      calls++; if (calls === 1) return response([]);
      return await new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
    } });
    const run = adapter.run({ signal: controller.signal, reconnect: { maxAttempts: 2, delayMs: mode === "delay" ? 10_000 : 0 } });
    await new Promise(resolve => setTimeout(resolve, mode === "delay" ? 10 : 30)); controller.abort(); assert.deepEqual(await run, { ok: true, status: "aborted" }); assert.equal(calls, mode === "delay" ? 1 : 2);
  }
});

test("fatal reconnect responses stop and resumed 410 is distinct without clearing cursor", async () => {
  for (const fatal of [new Response("", { status: 500 }), response([], "text/html"), new Response(null, { headers: { "Content-Type": "text/event-stream" } })]) {
    let calls = 0; const adapter = createBrowserA2UIHttpSseTransport({ session: session([]), routeId: "A", streamUrl: "/", sendUrl: "/", fetch: async () => ++calls === 1 ? response([]) : fatal });
    assert.equal((await adapter.run({ reconnect: { maxAttempts: 3, delayMs: 0 } })).ok, false); assert.equal(calls, 2);
  }
  const seen: Array<Record<string,string>> = []; let calls = 0; const adapter = createBrowserA2UIHttpSseTransport({ session: session([]), routeId: "A", streamUrl: "/", sendUrl: "/", fetch: async (_i, init) => { seen.push(init?.headers as Record<string,string>); return ++calls === 1 ? response([encoder.encode('id: 8\ndata: {}\n\n')]) : new Response("", { status: 410 }); } });
  await adapter.run(); const unavailable = await adapter.run({ reconnect: { maxAttempts: 2, delayMs: 0 } }); assert.deepEqual(unavailable, { ok: false, error: { code: "RESUME_UNAVAILABLE", status: 410, message: "Server cannot resume from the stored SSE event ID" } }); assert.equal(seen[1]?.["Last-Event-ID"], "8");
});

test("reference server assigns bounded sequential IDs and replays known gaps in order", async () => {
  const cursors: Array<string | undefined> = []; const server = await startReferenceServer({ replayCapacity: 2, onStreamOpen: (_c, id) => { cursors.push(id); } });
  const body = JSON.stringify({ metadata: { a2uiClientCapabilities: {} } }); const open = (id?: string) => fetch(server.streamUrl, { method: "POST", headers: { Accept: "text/event-stream", "Content-Type": "application/json", ...(id === undefined ? {} : { "Last-Event-ID": id }) }, body });
  try {
    assert.deepEqual(await server.sendA2UI({ n: 0 }), { ok: false, error: "NO_ACTIVE_STREAM" });
    let stream = await open(); assert.equal(stream.status, 200); const one = await server.sendA2UI({ n: 1 }); const two = await server.sendA2UI({ n: 2 }); assert.ok(one.ok && two.ok); assert.deepEqual([one.eventId, two.eventId], ["1", "2"]); server.closeStream(); await stream.body?.cancel(); await waitFor(() => true);
    const three = await server.sendA2UI({ n: 3 }); assert.deepEqual(three, { ok: true, eventId: "3", status: "buffered-for-resume" }); assert.equal(server.historySize(), 2);
    stream = await open("1"); assert.equal(stream.status, 200); const reader = stream.body!.getReader(); const decoder = new TextDecoder(); let text = ""; while (!text.includes("id: 3")) { const read = await reader.read(); if (read.done) break; text += decoder.decode(read.value); } assert.ok(text.indexOf("id: 2") < text.indexOf("id: 3")); assert.deepEqual(cursors, [undefined, "1"]); server.closeStream(); await reader.cancel();
    assert.equal((await open("0")).status, 410); assert.equal((await open("99")).status, 410); assert.equal((await open("bad")).status, 400);
  } finally { await server.close(); }
});

test("automatic loopback resume replays a disconnected gap once and preserves ownership", async () => {
  const cursors: Array<string | undefined> = []; const server = await startReferenceServer({ onStreamOpen: (_c, id) => { cursors.push(id); } }); const { runtime, session: transportSession } = integration();
  const controller = new AbortController(); const adapter = createBrowserA2UIHttpSseTransport({ session: transportSession, routeId: "A", streamUrl: server.streamUrl, sendUrl: server.sendUrl }); const run = adapter.run({ signal: controller.signal, reconnect: { maxAttempts: 2, delayMs: 30 } });
  try {
    await waitFor(() => cursors.length === 1); await server.sendA2UI(createMessage("X")); await server.sendA2UI(componentsMessage("X")); await waitFor(() => runtime.getSurface("X")?.components.root !== undefined);
    server.closeStream(); await new Promise(resolve => setTimeout(resolve, 5)); const gap = await server.sendA2UI(dataMessage("X", "resumed")); assert.ok(gap.ok); await waitFor(() => cursors.length === 2 && runtime.getSurface("X")?.dataModel !== undefined);
    assert.deepEqual(cursors, [undefined, "2"]); assert.deepEqual(runtime.getSurface("X")?.dataModel, { owner: "resumed" }); assert.equal(transportSession.getSurfaceRoute("X"), "A");
  } finally { controller.abort(); server.closeStream(); assert.deepEqual(await run, { ok: true, status: "aborted" }); await server.close(); }
});

test("reference server enforces endpoint methods, exact wrappers, limits, and one active stream", async () => {
  const server = await startReferenceServer(); const post = (path: string, body: string, headers: Record<string,string> = {}) => fetch(server.url + path, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8", ...headers }, body });
  try {
    assert.equal((await fetch(server.streamUrl)).status, 405); assert.equal((await fetch(server.sendUrl)).status, 405); assert.equal((await fetch(server.url + "/missing", { method: "POST" })).status, 404);
    assert.equal((await post("/a2ui/stream", "{" , { Accept: "text/event-stream" })).status, 400);
    assert.equal((await post("/a2ui/stream", JSON.stringify({ metadata: {} }), { Accept: "text/event-stream" })).status, 400);
    assert.equal((await post("/a2ui/send", "{")).status, 400); assert.equal((await post("/a2ui/send", JSON.stringify({ message: {}, metadata: { a2uiClientCapabilities: {} }, routeId: "A" }))).status, 400);
    assert.equal((await post("/a2ui/send", `{"padding":"${"x".repeat(1_048_576)}"}`)).status, 413);
    assert.equal((await post("/a2ui/stream", `{"padding":"${"x".repeat(1_048_576)}"}`, { Accept: "text/event-stream" })).status, 413);
    let opened = false; const stream = fetch(server.streamUrl, { method: "POST", headers: { Accept: "text/event-stream", "Content-Type": "application/json" }, body: JSON.stringify({ metadata: { a2uiClientCapabilities: {} } }) }).then(r => { opened = r.ok; return r; }); await waitFor(() => opened);
    assert.equal((await post("/a2ui/stream", JSON.stringify({ metadata: { a2uiClientCapabilities: {} } }), { Accept: "text/event-stream" })).status, 409);
    assert.equal((await server.sendA2UI(undefined)).ok, false); server.closeStream(); await stream;
  } finally { await server.close(); }
});

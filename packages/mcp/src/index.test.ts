import assert from "node:assert/strict";
import test from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler, fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import type { A2UITransportSession } from "@weaver/core";
import {
  createA2UIMcpClientBridge,
  registerMcpApplicationCapabilities,
  registerMcpApplicationCapability,
} from "./index.js";

const capabilities = { "v0.9": { supportedCatalogIds: ["catalog.test"] } };
const validMessages = [
  { version: "v0.9.1", createSurface: { surfaceId: "surface", catalogId: "catalog.test" } },
  { version: "v0.9.1", updateComponents: { surfaceId: "surface", components: [{ id: "root", component: "Text", text: "Hello" }] } },
];

function recordingSession(route = "route-a") {
  const received: Array<{ route: string; input: unknown }> = [];
  const session: A2UITransportSession = {
    processInbound(routeId, input) { received.push({ route: routeId, input: structuredClone(input) }); return { ok: true, value: { operation: "surfaceDeleted", surfaceId: "surface" } }; },
    getSurfaceRoute() { return route; },
    prepareActionDelivery() { return { ok: false, error: { code: "ACTION_DELIVERY_UNAVAILABLE" } }; },
    prepareValidationErrorDelivery() { return { ok: false, error: { code: "NOT_A_VALIDATION_FAILURE" } }; },
    getClientCapabilities() { return structuredClone(capabilities); },
  };
  return { session, received };
}

async function modernHarness() {
  const observations: Array<{ method: string; meta: unknown; args?: unknown }> = [];
  const factory = () => {
    const server = new McpServer({ name: "weaver-test", version: "1.0.0" });
    server.registerResource("test-form", "a2ui://test-form", { mimeType: "application/a2ui+json" }, async (uri, ctx) => {
      observations.push({ method: ctx.mcpReq.method, meta: structuredClone(ctx.mcpReq._meta) });
      return { contents: [{ uri: uri.href, mimeType: "application/a2ui+json; charset=utf-8", text: JSON.stringify(validMessages) }] };
    });
    server.registerTool("get_test_a2ui", {}, async (ctx) => {
      observations.push({ method: ctx.mcpReq.method, meta: structuredClone(ctx.mcpReq._meta) });
      return { content: [
        { type: "text" as const, text: "host fallback" },
        { type: "resource" as const, resource: { uri: "a2ui://dynamic", mimeType: "application/a2ui+json", text: JSON.stringify(validMessages[1]) }, annotations: { audience: ["user" as const] } },
      ] };
    });
    for (const name of ["a2ui_action", "a2ui_error"]) server.registerTool(name, {}, async (ctx) => {
      observations.push({ method: name, meta: structuredClone(ctx.mcpReq._meta) });
      return { content: [{ type: "text" as const, text: "ok" }] };
    });
    return server;
  };
  const handler = createMcpHandler(factory, { legacy: "reject", responseMode: "json" });
  const fetch = (input: string | URL | Request, init?: RequestInit) => handler.fetch(input instanceof Request ? input : new Request(input, init));
  const transport = new StreamableHTTPClientTransport(new URL("https://mcp.test/mcp"), { fetch });
  const client = new Client({ name: "weaver-test-client", version: "1.0.0" }, { versionNegotiation: { mode: { pin: "2026-07-28" } } });
  await client.connect(transport);
  return { client, observations, close: async () => { await client.close(); await handler.close(); } };
}

test("modern 2026-07-28 resource, tool, and action flows use official HTTP SDK", async () => {
  const harness = await modernHarness();
  try {
    const { session, received } = recordingSession();
    const bridge = createA2UIMcpClientBridge({ client: harness.client, session, routeId: "route-a" });
    const resource = await bridge.readResource({ uri: "a2ui://test-form" });
    assert.equal(resource.ok, true);
    assert.deepEqual(received.map(({ input }) => input), validMessages);
    assert.deepEqual((harness.observations[0]!.meta as any).a2ui.clientCapabilities, capabilities);

    const tool = await bridge.callTool({ name: "get_test_a2ui", arguments: { requested: true } });
    assert.equal(tool.ok, true);
    if (tool.ok) assert.deepEqual(tool.fallbackText, ["host fallback"]);
    assert.equal(received.length, 3);

    const sent = await bridge.sendDelivery({ routeId: "route-a", message: { version: "v0.9.1", action: { name: "submit", surfaceId: "surface", sourceComponentId: "root", timestamp: "2026-08-11T00:00:00.000Z", context: { value: 1 } } }, clientDataModel: { version: "v0.9.1", surfaces: { surface: { value: 1 } } } });
    assert.deepEqual(sent, { ok: true });
    const action = harness.observations.find((item) => item.method === "a2ui_action")!;
    assert.deepEqual((action.meta as any).a2ui.action, { surfaceId: "surface", sourceComponentId: "root", timestamp: "2026-08-11T00:00:00.000Z" });
    assert.deepEqual((action.meta as any).a2ui.clientDataModel.surfaces.surface, { value: 1 });
  } finally { await harness.close(); }
});

test("MIME, audience, payload, error, and route security rules", async () => {
  const { session, received } = recordingSession();
  const calls: any[] = [];
  const client = {
    async readResource() { return { contents: [
      { uri: "x", mimeType: "application/json", text: JSON.stringify(validMessages[0]) },
      { uri: "x", mimeType: "APPLICATION/A2UI+JSON; charset=utf-8", text: "[]" },
      { uri: "x", mimeType: "application/a2ui+json", blob: "e30=" },
    ] }; },
    async callTool(params: any) { calls.push(structuredClone(params)); return { content: [
      { type: "resource_link", uri: "a2ui://hidden", name: "hidden" },
      { type: "resource", resource: { uri: "x", mimeType: "application/a2ui+json", text: JSON.stringify(validMessages[0]) }, annotations: { audience: ["assistant"] } },
      { type: "resource", resource: { uri: "x", mimeType: "text/html", text: JSON.stringify(validMessages[0]) } },
    ] }; },
  };
  const bridge = createA2UIMcpClientBridge({ client: client as unknown as Client, session, routeId: "route-a", maxPayloadBytes: 4 });
  const read = await bridge.readResource({ uri: "x" });
  assert.equal(read.ok, true);
  if (read.ok) assert.deepEqual(read.diagnostics, [{ code: "A2UI_MCP_BINARY_RESOURCE_UNSUPPORTED" }]);
  await bridge.callTool({ name: "dynamic" });
  assert.equal(received.length, 0);
  assert.equal(calls.length, 1);
  const wrong = await bridge.sendDelivery({ routeId: "route-b", message: { version: "v0.9.1", error: { code: "VALIDATION_FAILED", surfaceId: "surface", path: "/", message: "bad" } } });
  assert.deepEqual(wrong, { ok: false, error: { code: "MCP_DELIVERY_ROUTE_MISMATCH" } });
  assert.equal(calls.length, 1);
});

const emptySchema = fromJsonSchema({ type: "object", additionalProperties: false });
const valueInputSchema = fromJsonSchema<{ value: string }>({
  type: "object", properties: { value: { type: "string" } }, required: ["value"], additionalProperties: false,
});
const valueOutputSchema = fromJsonSchema<{ value: string }>({
  type: "object", properties: { value: { type: "string" } }, required: ["value"], additionalProperties: false,
});

async function applicationHarness(
  definitions: Parameters<typeof registerMcpApplicationCapabilities>[1],
  options: Parameters<typeof registerMcpApplicationCapabilities>[2] = {},
  authInfo?: any,
) {
  let factories = 0;
  const handler = createMcpHandler(() => {
    factories += 1;
    const server = new McpServer({ name: "application-test", version: "1.0.0" });
    registerMcpApplicationCapabilities(server, definitions, options);
    return server;
  }, { legacy: "reject", responseMode: "json" });
  const fetch = (input: string | URL | Request, init?: RequestInit) => handler.fetch(input instanceof Request ? input : new Request(input, init), { authInfo });
  const transport = new StreamableHTTPClientTransport(new URL("https://mcp.test/mcp"), { fetch });
  const client = new Client({ name: "application-client", version: "1.0.0" }, { versionNegotiation: { mode: { pin: "2026-07-28" } } });
  await client.connect(transport);
  return { client, get factories() { return factories; }, close: async () => { await client.close(); await handler.close(); } };
}

function textOf(result: any): string[] {
  return result.content.filter((entry: any) => entry.type === "text").map((entry: any) => entry.text);
}

test("application capability metadata, order, annotations, and destructive execution survive tools/list", async () => {
  let destructiveCalls = 0;
  const harness = await applicationHarness([
    { name: "first", title: "First tool", description: "Reads a value", inputSchema: emptySchema, annotations: { readOnlyHint: true }, execute: () => ({ success: true, text: "first" }) },
    { name: "second", description: "Changes a value", inputSchema: emptySchema, annotations: { destructiveHint: true, idempotentHint: false, openWorldHint: false, title: "Annotation title" }, execute: () => { destructiveCalls += 1; return { success: true, text: "second" }; } },
  ]);
  try {
    const listed = await harness.client.listTools();
    assert.deepEqual(listed.tools.map((tool) => tool.name), ["first", "second"]);
    assert.equal(listed.tools[0]!.title, "First tool");
    assert.equal(listed.tools[0]!.description, "Reads a value");
    assert.deepEqual(listed.tools[0]!.inputSchema, { type: "object", additionalProperties: false });
    assert.deepEqual(listed.tools[0]!.annotations, { readOnlyHint: true });
    assert.deepEqual(listed.tools[1]!.annotations, { destructiveHint: true, idempotentHint: false, openWorldHint: false, title: "Annotation title" });
    assert.deepEqual(textOf(await harness.client.callTool({ name: "second", arguments: {} })), ["second"]);
    assert.equal(destructiveCalls, 1);
  } finally { await harness.close(); }
});

test("application capability batch preflight rejects duplicate, invalid name, and empty description atomically", () => {
  for (const definitions of [
    [
      { name: "same", description: "One", inputSchema: emptySchema, execute: () => ({ success: true as const, text: "one" }) },
      { name: "same", description: "Two", inputSchema: emptySchema, execute: () => ({ success: true as const, text: "two" }) },
    ],
    [{ name: "bad name", description: "Bad", inputSchema: emptySchema, execute: () => ({ success: true as const, text: "bad" }) }],
    [{ name: "empty", description: "  ", inputSchema: emptySchema, execute: () => ({ success: true as const, text: "bad" }) }],
  ]) {
    const server = new McpServer({ name: "preflight", version: "1" });
    let registrations = 0;
    (server as any).registerTool = () => { registrations += 1; return {}; };
    assert.throws(() => registerMcpApplicationCapabilities(server, definitions));
    assert.equal(registrations, 0);
  }
});

test("official SDK validates input before execute and supports explicit empty-object schemas", async () => {
  let calls = 0;
  const harness = await applicationHarness([{ name: "input", description: "Input test", inputSchema: valueInputSchema, execute: ({ value }) => { calls += 1; return { success: true, text: value }; } }]);
  try {
    assert.deepEqual(textOf(await harness.client.callTool({ name: "input", arguments: { value: "ok" } })), ["ok"]);
    const invalid = await harness.client.callTool({ name: "input", arguments: { value: 1 } });
    assert.equal(invalid.isError, true);
    assert.equal(calls, 1);
  } finally { await harness.close(); }
});

test("application result mappings cover text, structured fallback, explicit text, and business failure", async () => {
  const definitions = [
    { name: "text", description: "Text", inputSchema: emptySchema, execute: () => ({ success: true as const, text: "Saved" }) },
    { name: "data", description: "Data", inputSchema: emptySchema, execute: () => ({ success: true as const, data: { value: "saved" } }) },
    { name: "both", description: "Both", inputSchema: emptySchema, execute: () => ({ success: true as const, text: "Custom", data: { value: "saved" } }) },
    { name: "failure", description: "Failure", inputSchema: emptySchema, execute: () => ({ success: false as const, message: "Account is already closed." }) },
  ];
  const harness = await applicationHarness(definitions);
  try {
    const text = await harness.client.callTool({ name: "text", arguments: {} });
    assert.deepEqual(text.content, [{ type: "text", text: "Saved" }]);
    assert.notEqual(text.isError, true);
    const data = await harness.client.callTool({ name: "data", arguments: {} });
    assert.deepEqual(data.structuredContent, { value: "saved" });
    assert.deepEqual(textOf(data), ['{"value":"saved"}']);
    const both = await harness.client.callTool({ name: "both", arguments: {} });
    assert.deepEqual(textOf(both), ["Custom"]);
    assert.deepEqual(both.structuredContent, { value: "saved" });
    const failure = await harness.client.callTool({ name: "failure", arguments: {} });
    assert.equal(failure.isError, true);
    assert.deepEqual(textOf(failure), ["Account is already closed."]);
  } finally { await harness.close(); }
});

test("JSON-unsafe output is controlled and structured output is defensively cloned", async () => {
  const original: any = { nested: { value: "before" } };
  const server = new McpServer({ name: "ownership", version: "1" });
  let callback: any;
  (server as any).registerTool = (_name: string, _config: unknown, cb: unknown) => { callback = cb; return {}; };
  registerMcpApplicationCapability(server, { name: "owned", description: "Ownership", inputSchema: emptySchema, execute: () => ({ success: true, data: original }) });
  const result = await callback({}, {});
  original.nested.value = "after";
  assert.deepEqual(result.structuredContent, { nested: { value: "before" } });

  const cyclic: any = {}; cyclic.self = cyclic;
  const harness = await applicationHarness([{ name: "unsafe", description: "Unsafe", inputSchema: emptySchema, execute: () => ({ success: true, data: cyclic }) }]);
  try {
    const unsafe = await harness.client.callTool({ name: "unsafe", arguments: {} });
    assert.equal(unsafe.isError, true);
    assert.deepEqual(textOf(unsafe), ["Application capability returned invalid structured data."]);
    assert.equal(unsafe.structuredContent, undefined);
  } finally { await harness.close(); }
});

test("output schemas are SDK-owned; valid, missing, and mismatched output cannot produce invalid success", async () => {
  const harness = await applicationHarness([
    { name: "valid_output", description: "Valid", inputSchema: emptySchema, outputSchema: valueOutputSchema, execute: () => ({ success: true, data: { value: "ok" } }) },
    { name: "missing_output", description: "Missing", inputSchema: emptySchema, outputSchema: valueOutputSchema, execute: () => ({ success: true, text: "only text" }) },
    { name: "invalid_output", description: "Invalid", inputSchema: emptySchema, outputSchema: valueOutputSchema, execute: () => ({ success: true, data: { value: 1 } as any }) },
  ]);
  try {
    assert.deepEqual((await harness.client.callTool({ name: "valid_output", arguments: {} })).structuredContent, { value: "ok" });
    const missing = await harness.client.callTool({ name: "missing_output", arguments: {} });
    assert.equal(missing.isError, true);
    assert.deepEqual(textOf(missing), ["Application capability returned no structured data."]);
    const invalid = await harness.client.callTool({ name: "invalid_output", arguments: {} });
    assert.equal(invalid.isError, true);
    assert.notDeepEqual(invalid.structuredContent, { value: 1 });
  } finally { await harness.close(); }
});

test("unexpected exceptions are sanitized, diagnosed, and diagnostic throws are contained", async () => {
  const secret = new Error("database password=secret");
  const diagnostics: any[] = [];
  const harness = await applicationHarness([
    { name: "throwing", description: "Throws", inputSchema: emptySchema, execute: () => { throw secret; } },
    { name: "business", description: "Expected", inputSchema: emptySchema, execute: () => ({ success: false, message: "Expected" }) },
  ], { onDiagnostic(diagnostic) { diagnostics.push(diagnostic); throw new Error("diagnostic failed"); } });
  try {
    const thrown = await harness.client.callTool({ name: "throwing", arguments: {} });
    assert.equal(thrown.isError, true);
    assert.deepEqual(textOf(thrown), ["Application capability failed."]);
    assert.doesNotMatch(JSON.stringify(thrown), /database password|secret|stack/i);
    assert.equal(diagnostics[0].capabilityName, "throwing");
    assert.equal(diagnostics[0].error, secret);
    await harness.client.callTool({ name: "business", arguments: {} });
    assert.equal(diagnostics.length, 1);
  } finally { await harness.close(); }
});

test("official ServerContext passes HTTP authInfo to host authorization on fresh per-request servers", async () => {
  const seen: any[] = [];
  const authInfo = { token: "trusted-test-token", clientId: "client", scopes: ["profile:read"] };
  const harness = await applicationHarness([{ name: "authorized", description: "Host authorization", inputSchema: emptySchema, execute: (_input, ctx) => { seen.push(ctx.http?.authInfo); return ctx.http?.authInfo?.scopes.includes("profile:read") ? { success: true, text: "allowed" } : { success: false, message: "denied" }; } }], {}, authInfo);
  try {
    assert.deepEqual(textOf(await harness.client.callTool({ name: "authorized", arguments: {} })), ["allowed"]);
    assert.deepEqual(seen, [authInfo]);
    await harness.client.listTools();
    assert.ok(harness.factories >= 3);
  } finally { await harness.close(); }
});

import assert from "node:assert/strict";
import test from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import type { A2UITransportSession } from "@weaver/core";
import { createA2UIMcpClientBridge } from "./index.js";

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

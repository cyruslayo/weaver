# Weaver A2UI over MCP

`@cylayo/weaver-mcp` targets **MCP 2026-07-28** with the official TypeScript SDK v2. It accepts an already-connected official `Client`; the bridge does not connect, authenticate, select a transport, or close that client. The same bridge can therefore operate over Streamable HTTP, stdio, or another valid MCP transport.

The A2UI-over-MCP guide's initialize-based capability-negotiation example targets the older stateful MCP model. Weaver uses per-request A2UI metadata with the current stateless MCP model. The guide's resource, tool, MIME, action, and error delivery concepts still apply.

## Inbound delivery

```text
resources/read
      ↓
TextResourceContents (application/a2ui+json)
      ↓
A2UI MCP bridge
      ↓
A2UITransportSession
      ↓
WeaverRuntime
```

```text
tools/call
      ↓
EmbeddedResource (application/a2ui+json)
      ↓
A2UI MCP bridge
```

The bridge processes text only, accepts MIME parameters, applies a 1 MiB UTF-8 default limit, parses strict JSON, and processes an object as one envelope or an array sequentially. It ignores other MIME types, fallback text, resource links, and assistant-only embedded resources. Matching blob resources are reported as unsupported and are not decoded.

## Outbound delivery

```text
A2UI renderer action → session routed delivery → a2ui_action MCP tool
A2UI validation failure → a2ui_error MCP tool
```

Action business arguments are exactly `{ name, context }`. Validation arguments are exactly `{ code, surfaceId, path, message }`, the fields of the v1.0 validation-failed renderer message `error`. Defaults may be replaced with non-empty `actionToolName` and `errorToolName` options.

## Remote function calls

A tool result cannot carry a reply, so the messages that answer or start a remote function call travel through a host-supplied `reply` callback instead of an MCP tool:

```text
rendererFunctionResponse             → reply(delivery)
generic renderer error with a functionCallId → reply(delivery)
callAgentFunction                    → reply(delivery)
```

```ts
import { createA2UIMcpClientBridge } from "@cylayo/weaver-mcp";

const bridge = createA2UIMcpClientBridge({
  client,            // an already-connected official Client
  session,
  runtime,           // the WeaverRuntime that the session wraps
  routeId: "host-assigned-route",
  reply: async (delivery) => {
    // The host sends delivery.message on its own channel, for example a separate
    // authenticated request to the agent. Throwing marks the send as failed.
    await sendToAgent(delivery);
  },
  onDiagnostic: (diagnostic) => log(diagnostic),
});
// Wire the drain from the runtime. Core calls this after it queues a call.
// agentFunctions: { onCallQueued: () => { void bridge.flushAgentCalls(); } }
```

The bridge drains the queued calls after each received payload, and `flushAgentCalls()` drains them at any other time. Several bridges may share one session, one per route. Each bridge's flush drains only its own route, so the hook must flush every bridge on the session. Calls for a route with no bridge stay queued until the host cancels them. A Web adapter and an MCP bridge can share one session. `sendActionCalls(result)` sends the calls of a `dispatchAction` result. A response that a received payload produces is replied while that payload is processed. A payload's settled action that resumes is delivered the same way.

Without `reply`, these deliveries return `MCP_DELIVERY_UNSUPPORTED`. A response the bridge cannot send is reported as `A2UI_MCP_FUNCTION_RESPONSE_UNDELIVERED`. A drained call the bridge cannot send is cancelled with `TRANSPORT_FAILED` and reported as `A2UI_MCP_AGENT_CALL_CANCELLED`, so its dependents resolve to an error state instead of waiting forever. A failed `reply` call is handled the same way.

The reply channel is host-owned. The bridge does not authenticate the agent, decide who may receive a call, or set timeouts. Cancel a stale call with `cancelAgentFunctionCall(id, "TIMEOUT")` from the host's own timer.

## Weaver/A2UI MCP metadata mapping

These are Weaver/A2UI mapping fields, not MCP core fields:

```text
_meta.a2ui = {
  rendererCapabilities: session.getRendererCapabilities(),
  action?: {
    surfaceId,
    sourceComponentId,
    timestamp
  },
  rendererDataModel?: A2UIRendererDataModel
}
```

Every bridge-owned `resources/read` and `tools/call` carries a fresh `rendererCapabilities` value. Action metadata is present for `a2ui_action`; `rendererDataModel` is present only when the session-prepared delivery includes it. The official SDK owns reserved `io.modelcontextprotocol/*` metadata.

## Application capabilities

Host applications can expose trusted domain integrations as ordinary MCP tools with `registerMcpApplicationCapability` or the batch helper `registerMcpApplicationCapabilities`. The fragment assumes that `server` is the application's MCP server, and that `emptyObjectSchema`, `profileSchema` and `profileService` come from the application. It shows the call shape only:

```ts
registerMcpApplicationCapability(server, {
  name: "get_profile",
  description: "Read the current user's profile.",
  inputSchema: emptyObjectSchema,
  outputSchema: profileSchema,
  annotations: { readOnlyHint: true },
  async execute(_input, ctx) {
    // The application authorizes every call; Weaver only passes ctx through.
    return { success: true, data: await profileService.get(ctx.http?.authInfo) };
  },
});
```

The ownership boundary is deliberate:

```text
MCP SDK       = protocol handling, tool registration, and input/output schemas
Weaver helper = batch preflight, safe application result mapping, exception boundary
application   = authorization, business rules, and domain services
```

Every capability requires a non-empty description and an explicit input schema, including tools whose schema accepts only an empty object. The host supplies an MCP-compatible `StandardSchemaWithJSON` implementation (for example Zod v4, ArkType, or Valibot); Weaver has no schema catalog and no schema-library runtime dependency. Optional output schemas are passed unchanged to the official SDK, which remains the sole output validator.

Successful text becomes `TextContent`. Successful `data` is defensively cloned as JSON-safe `structuredContent`; supplied text is preserved, otherwise compact `JSON.stringify(data)` text is included as a compatibility fallback. A declared output schema requires successful data. Expected `{ success: false, message }` results become MCP tool execution errors with that application-safe message. Unexpected throws become only `Application capability failed.`; an optional trusted `onDiagnostic` callback receives the capability name and original failure host-side, and its own failures are contained.

Official tool annotations are forwarded as hints. They are not authorization, confirmation, rate-limit, or execution policy. The helper passes the official `ServerContext` through without interpreting `authInfo`, `clientInfo`, `serverInfo`, names, or annotations. The application must authorize before invoking sensitive domain services.

MCP 2026 has no implicit application session state. Stateful applications should return explicit application-owned opaque handles and accept them in later arguments, reauthorizing every call. Weaver neither stores handles nor treats one as permission. These helpers do not register `a2ui_action`/`a2ui_error`, generate A2UI, or depend on UI packages.

## Trust and ownership

One bridge binds one connected MCP client to one trusted host-provided `A2UIRouteId` and one `A2UITransportSession`. Route identity is never inferred from MCP server/client metadata, names, URIs, results, or `_meta`, and is never placed on the MCP wire. Wrong-route outbound deliveries are rejected before an MCP call. Inbound envelopes always pass through `session.processInbound(routeId, envelope)`; routing rejection cannot become an A2UI validation error.

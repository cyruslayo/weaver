# Weaver A2UI over MCP

`@weaver/mcp` targets **MCP 2026-07-28** with the official TypeScript SDK v2. It accepts an already-connected official `Client`; the bridge does not connect, authenticate, select a transport, or close that client. The same bridge can therefore operate over Streamable HTTP, stdio, or another valid MCP transport.

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
A2UI server event → session routed delivery → a2ui_action MCP tool
A2UI validation failure → a2ui_error MCP tool
```

Action business arguments are exactly `{ name, context }`. Validation arguments are exactly `{ code, surfaceId, path, message }`. Defaults may be replaced with non-empty `actionToolName` and `errorToolName` options.

## Weaver/A2UI MCP metadata mapping

These are Weaver/A2UI mapping fields, not MCP core fields:

```text
_meta.a2ui = {
  clientCapabilities: session.getClientCapabilities(),
  action?: {
    surfaceId,
    sourceComponentId,
    timestamp
  },
  clientDataModel?: A2UIClientDataModel
}
```

Every bridge-owned `resources/read` and `tools/call` carries a fresh `clientCapabilities` value. Action metadata is present for `a2ui_action`; `clientDataModel` is present only when the session-prepared delivery includes it. The official SDK owns reserved `io.modelcontextprotocol/*` metadata.

## Trust and ownership

One bridge binds one connected MCP client to one trusted host-provided `A2UIRouteId` and one `A2UITransportSession`. Route identity is never inferred from MCP server/client metadata, names, URIs, results, or `_meta`, and is never placed on the MCP wire. Wrong-route outbound deliveries are rejected before an MCP call. Inbound envelopes always pass through `session.processInbound(routeId, envelope)`; routing rejection cannot become an A2UI validation error.

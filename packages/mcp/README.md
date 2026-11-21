# @cylayo/weaver-mcp

MCP is an optional bridge between Weaver and the
[Model Context Protocol](https://modelcontextprotocol.io). Weaver is an
[A2UI v1.0](https://a2ui.org) runtime for dynamic interfaces. The bridge targets
MCP 2026-07-28 and the official TypeScript SDK v2.

> **0.4.0 is unreleased.** This README describes the A2UI v1.0 API on the
> `0.4.0` line. The released `0.3.1` package implements A2UI v0.9.1.

## What it does

MCP carries A2UI messages over an MCP client that your code has already
connected. It reads A2UI resources and tool results, and it sends user actions
and validation errors back as MCP tool calls. It also registers your trusted
application functions as MCP tools.

## What it does not do

MCP does not connect to a server, authenticate users, or choose a transport.
Your host code owns the MCP client and its lifetime. MCP does not decide who
may call a tool. Your application must authorize each call. MCP does not render
UI. Use `@cylayo/weaver-web` for that.

## Install

```sh
npm install @cylayo/weaver-core @cylayo/weaver-mcp
```

MCP needs Node.js 20 or later. It needs `@cylayo/weaver-core` as a peer
dependency, on the `0.4.x` line. Install both packages at the same version. MCP
is ESM-only. Use `import`, not `require`.

## Example

The client and the transport session come from your host code. The bridge
does not connect or close the client. The example takes them as parameters.

```ts
import {
  createA2UIMcpClientBridge,
  type A2UIMcpClientBridgeOptions,
} from "@cylayo/weaver-mcp";

export async function receiveAgentUi(
  client: A2UIMcpClientBridgeOptions["client"],
  session: A2UIMcpClientBridgeOptions["session"],
): Promise<void> {
  const bridge = createA2UIMcpClientBridge({
    client,
    session,
    routeId: "host-assigned-route",
  });
  const received = await bridge.callTool({ name: "agent_ui" });
  if (!received.ok) console.error("MCP request failed", received.error.code);
}
```

## Which package do I need?

| Package | Use it when | Also install |
| --- | --- | --- |
| [`@cylayo/weaver-core`](https://www.npmjs.com/package/@cylayo/weaver-core) | You need the runtime and the A2UI protocol, with no DOM. | Nothing else |
| [`@cylayo/weaver-web`](https://www.npmjs.com/package/@cylayo/weaver-web) | You render a surface in a browser page. | Core, version `0.4.x` |
| [`@cylayo/weaver-mcp`](https://www.npmjs.com/package/@cylayo/weaver-mcp) (this package) | You expose A2UI over MCP from a backend. Needs Node.js 20 or later. | Core, version `0.4.x` |

## Full documentation

- [Repository README](https://github.com/cyruslayo/weaver/blob/main/README.md): Quick Start, architecture and trust model.
- [MCP integration](https://github.com/cyruslayo/weaver/blob/main/docs/mcp.md): the bridge, metadata mapping, and application capabilities.
- [Architecture](https://github.com/cyruslayo/weaver/blob/main/docs/architecture.md): route ownership and the transport session.
- [Changelog](https://github.com/cyruslayo/weaver/blob/main/CHANGELOG.md): release notes and the 0.3.x migration guide.

## License

Apache-2.0. See [LICENSE](https://github.com/cyruslayo/weaver/blob/main/LICENSE).

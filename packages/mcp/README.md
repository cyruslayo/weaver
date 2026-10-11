# @cylayo/weaver-mcp

MCP is an optional bridge between Weaver and the
[Model Context Protocol](https://modelcontextprotocol.io). Weaver is an
[A2UI v0.9.1](https://a2ui.org) runtime for dynamic interfaces. The bridge targets
MCP 2026-07-28 and the official TypeScript SDK v2.

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
dependency, on the `0.3.x` line. Install both packages at the same version.
MCP is ESM-only. Use `import`, not `require`.

## Example

Your host code connects the MCP client. This function loads one A2UI resource
into a Core runtime. The resource must return A2UI messages for surface `main`.

```ts
import { createA2UIMcpClientBridge } from "@cylayo/weaver-mcp";
import {
  createA2UITransportSession,
  createBasicCatalogV091Registration,
  createWeaverRuntime,
} from "@cylayo/weaver-core";

// Your host code connects this client. The bridge does not connect or close it.
type McpClient = Parameters<typeof createA2UIMcpClientBridge>[0]["client"];

export async function loadHomeSurface(client: McpClient) {
  const created = createWeaverRuntime({ catalogs: [createBasicCatalogV091Registration()] });
  if (!created.ok) throw new Error("runtime configuration failed");

  const session = createA2UITransportSession({ runtime: created.value });
  const bridge = createA2UIMcpClientBridge({ client, session, routeId: "home" });

  const read = await bridge.readResource({ uri: "a2ui://home" });
  if (!read.ok) throw new Error(`read failed: ${read.error.code}`);
  return created.value.resolveSurface("main");
}
```

## Which package do I need?

| Package | Use it when | Also install |
| --- | --- | --- |
| [`@cylayo/weaver-core`](https://www.npmjs.com/package/@cylayo/weaver-core) | You need the runtime and the A2UI protocol, with no DOM. | Nothing else |
| [`@cylayo/weaver-web`](https://www.npmjs.com/package/@cylayo/weaver-web) | You render a surface in a browser page. | Core, version `0.3.x` |
| [`@cylayo/weaver-mcp`](https://www.npmjs.com/package/@cylayo/weaver-mcp) (this package) | You expose A2UI over MCP from a backend. Needs Node.js 20 or later. | Core, version `0.3.x` |

## Full documentation

- [Repository README](https://github.com/cyruslayo/weaver/blob/main/README.md): Quick Start, architecture and trust model.
- [MCP bridge](https://github.com/cyruslayo/weaver/blob/main/docs/mcp.md): inbound and outbound delivery, metadata, and application capabilities.
- [Architecture](https://github.com/cyruslayo/weaver/blob/main/docs/architecture.md): package rules and trust boundaries.
- [Changelog](https://github.com/cyruslayo/weaver/blob/main/CHANGELOG.md): release notes.

## License

Apache-2.0. See [LICENSE](https://github.com/cyruslayo/weaver/blob/main/LICENSE).

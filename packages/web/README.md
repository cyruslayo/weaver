# @cylayo/weaver-web

Web is the browser renderer for Weaver. Weaver is an
[A2UI v0.9.1](https://a2ui.org) runtime for dynamic interfaces.

## What it does

Web draws an A2UI v0.9.1 surface as DOM elements that Weaver owns. It uses
renderers from a trusted catalog that your code registers. It sends user input
back to the Core runtime and dispatches explicit actions. It also ships a
browser HTTP/SSE transport adapter.

## What it does not do

Web does not run agent-provided HTML, CSS, or JavaScript. It loads no media URL
unless your host allows it. It does not open a network connection by itself,
and it does not include a server. Your application sets the trust policies.

## Install

```sh
npm install @cylayo/weaver-core @cylayo/weaver-web
```

Web needs `@cylayo/weaver-core` as a peer dependency, on the `0.3.x` line.
Install both packages at the same version. Web is ESM-only. Use `import`, not
`require`.

## Example

Put this module in a browser page. It mounts the surface into an element that
has `id="app"`.

```ts
import { createBasicWebRuntime } from "@cylayo/weaver-web";

const created = createBasicWebRuntime();
if (!created.ok) throw new Error("Web runtime configuration failed");

const web = created.value;
web.runtime.process({
  version: "v0.9.1",
  createSurface: { surfaceId: "main", catalogId: web.catalogId },
});
web.runtime.process({
  version: "v0.9.1",
  updateComponents: {
    surfaceId: "main",
    components: [{ id: "root", component: "Text", text: "Hello from Weaver" }],
  },
});

const mounted = web.mount({
  surfaceId: "main",
  target: document.querySelector("#app")!,
});
if (!mounted.ok) throw new Error(`mount failed: ${mounted.error.code}`);
```

## Which package do I need?

| Package | Use it when | Also install |
| --- | --- | --- |
| [`@cylayo/weaver-core`](https://www.npmjs.com/package/@cylayo/weaver-core) | You need the runtime and the A2UI protocol, with no DOM. | Nothing else |
| [`@cylayo/weaver-web`](https://www.npmjs.com/package/@cylayo/weaver-web) (this package) | You render a surface in a browser page. | Core, version `0.3.x` |
| [`@cylayo/weaver-mcp`](https://www.npmjs.com/package/@cylayo/weaver-mcp) | You expose A2UI over MCP from a backend. Needs Node.js 20 or later. | Core, version `0.3.x` |

## Full documentation

- [Repository README](https://github.com/cyruslayo/weaver/blob/main/README.md): Quick Start, architecture and trust model.
- [Web rendering](https://github.com/cyruslayo/weaver/blob/main/docs/web-rendering.md): renderer pipeline, and the media, theme and attribution policies.
- [HTTP/SSE transport](https://github.com/cyruslayo/weaver/blob/main/docs/http-sse-transport.md): browser transport, reconnect and resume.
- [Custom catalogs](https://github.com/cyruslayo/weaver/blob/main/docs/custom-catalogs.md): register an app-owned catalog with trusted renderers.
- [Changelog](https://github.com/cyruslayo/weaver/blob/main/CHANGELOG.md): release notes.

## License

Apache-2.0. See [LICENSE](https://github.com/cyruslayo/weaver/blob/main/LICENSE).

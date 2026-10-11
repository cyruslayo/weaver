# @cylayo/weaver-core

Core is the runtime and protocol foundation of Weaver. Weaver is an
[A2UI v0.9.1](https://a2ui.org) runtime for dynamic interfaces.

## What it does

Core checks A2UI v0.9.1 messages against the trusted catalogs that your code
registers. It stores surface state, resolves the component tree, binds user
input to the data model, and dispatches explicit actions. Core has no DOM and
no Node APIs. It runs in a browser, in Node.js, and in Cloudflare Workers.

## What it does not do

Core does not call an AI model. It does not generate interfaces, and it does
not repair invalid messages. It does not render HTML and does not open network
connections. Agent output is data. Your host code decides what is trusted.

## Install

```sh
npm install @cylayo/weaver-core
```

Core is ESM-only. Use `import`, not `require`. Core declares no minimum
Node.js version.

## Example

This example is a Cloudflare Worker module. It uses only Core. Each request
builds a runtime, applies the A2UI messages, and returns the resolved surface
as JSON.

```ts
import {
  A2UI_V091_BASIC_CATALOG_ID,
  createBasicCatalogV091Registration,
  createWeaverRuntime,
} from "@cylayo/weaver-core";

// Core only: no DOM and no Node APIs, so this module runs in a Cloudflare Worker.
export default {
  fetch(request: Request): Response {
    const name = new URL(request.url).searchParams.get("name") ?? "Weaver";
    const made = createWeaverRuntime({ catalogs: [createBasicCatalogV091Registration()] });
    if (!made.ok) return Response.json({ error: "runtime configuration failed" }, { status: 500 });

    const runtime = made.value;
    runtime.process({
      version: "v0.9.1",
      createSurface: { surfaceId: "main", catalogId: A2UI_V091_BASIC_CATALOG_ID },
    });
    const updated = runtime.process({
      version: "v0.9.1",
      updateComponents: {
        surfaceId: "main",
        components: [{ id: "root", component: "Text", text: `Hello, ${name}` }],
      },
    });
    if (!updated.ok) return Response.json({ error: updated.error }, { status: 400 });

    const resolved = runtime.resolveSurface("main");
    if (!resolved.ok) return Response.json({ error: resolved.error }, { status: 500 });
    return Response.json(resolved.value.tree);
  },
};
```

## Which package do I need?

| Package | Use it when | Also install |
| --- | --- | --- |
| [`@cylayo/weaver-core`](https://www.npmjs.com/package/@cylayo/weaver-core) (this package) | You need the runtime and the A2UI protocol, with no DOM. | Nothing else |
| [`@cylayo/weaver-web`](https://www.npmjs.com/package/@cylayo/weaver-web) | You render a surface in a browser page. | Core, version `0.3.x` |
| [`@cylayo/weaver-mcp`](https://www.npmjs.com/package/@cylayo/weaver-mcp) | You expose A2UI over MCP from a backend. Needs Node.js 20 or later. | Core, version `0.3.x` |

## Full documentation

- [Repository README](https://github.com/cyruslayo/weaver/blob/main/README.md): Quick Start, architecture and trust model.
- [Architecture](https://github.com/cyruslayo/weaver/blob/main/docs/architecture.md): runtime pipeline and trust boundaries.
- [Prompt generation](https://github.com/cyruslayo/weaver/blob/main/docs/prompt-generation.md): build model instructions from a catalog.
- [Custom catalogs](https://github.com/cyruslayo/weaver/blob/main/docs/custom-catalogs.md): register an app-owned catalog.
- [Stream ingestion](https://github.com/cyruslayo/weaver/blob/main/docs/a2ui-stream-ingestion.md): validate streamed A2UI JSONL.
- [Conformance](https://github.com/cyruslayo/weaver/blob/main/docs/conformance-v0.9.1.md): A2UI v0.9.1 requirement status.
- [Changelog](https://github.com/cyruslayo/weaver/blob/main/CHANGELOG.md): release notes.

## License

Apache-2.0. See [LICENSE](https://github.com/cyruslayo/weaver/blob/main/LICENSE).
Core also ships A2UI-derived material with its own attribution. See
[THIRD_PARTY_LICENSES.txt](https://github.com/cyruslayo/weaver/blob/main/packages/core/THIRD_PARTY_LICENSES.txt).

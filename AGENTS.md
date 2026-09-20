# Weaver agent guide

Weaver 0.2.1 is an independent, model-independent runtime for dynamic
interfaces using A2UI v0.9.1. Agent or provider output is data. Weaver does
not select or call a model and does not contain application business logic.

The packages have one-way boundaries:

- `@cylayo/weaver-core` is the required, platform-independent foundation for
  A2UI protocol processing, trusted catalogs and functions, state, resolution,
  input, actions, producers, JSONL ingestion, and transport-neutral sessions.
- `@cylayo/weaver-web` is the browser layer for trusted renderers, DOM
  rendering, browser interaction, and the browser HTTP/SSE adapter. It peer-
  depends on Core.
- `@cylayo/weaver-mcp` is optional. It provides the MCP A2UI bridge and
  application-capability helpers. It peer-depends on Core and requires Node
  20 or later.

All three packages are ESM-only and currently expose only their package-root
export. Do not use internal paths or unsupported subpath imports.

## Installing the published packages

The released version is `0.2.1`. Use npm packages in consumer applications:

```sh
npm install @cylayo/weaver-core @cylayo/weaver-web
```

This is the normal browser application installation. Core is mandatory and
Web declares `@cylayo/weaver-core` as a `0.2.x` peer dependency.

For a Core-only application:

```sh
npm install @cylayo/weaver-core
```

For MCP integration, install both the required foundation and the optional
bridge:

```sh
npm install @cylayo/weaver-core @cylayo/weaver-mcp
```

MCP uses the official MCP SDK packages and declares `node >=20`. Core and Web
do not currently declare a Node version requirement. Applications must provide
one compatible Core instance for Web or MCP; do not install MCP for an
ordinary frontend application.

The README contains historical local-tarball instructions from before npm
publication. Those instructions are not current installation guidance for
0.2.1.

## Building an application

The preferred end-to-end example is
[`examples/reference-app/`](examples/reference-app/). It demonstrates an
application-owned agent transition, the versioned producer, JSONL ingestion,
Core runtime processing, Basic Web rendering, trusted input, and an
allowlisted server-event round trip. Use
[`examples/playground/`](examples/playground/) to explore components and
renderers. Use [`examples/http-sse-server/`](examples/http-sse-server/) only as
a transport reference; it is a single-peer loopback example, not a production
server.

Follow this order for a normal browser application:

1. Install Core and Web from npm.
2. Create a runtime. For the canonical Basic Catalog browser path, prefer
   `createBasicWebRuntime`; for a platform-neutral application, use
   `createWeaverRuntime` with explicit trusted catalog registrations.
3. Register every trusted catalog during host initialization. Core does not
   install a default catalog. `createBasicWebRuntime` registers the canonical
   Basic Catalog and its trusted Basic renderer allowlist; custom catalogs and
   renderers are explicit additions.
4. Produce A2UI v0.9.1 messages in application/provider code with
   `createA2UIV091Producer` when constructing the supported lifecycle messages.
   The producer does not call a model, validate a catalog, or authorize an
   action.
5. Treat provider text as untrusted. Feed streamed JSONL text to
   `createA2UIV091StreamIngestion`; do not parse around Weaver, strip Markdown
   fences, repair JSON, or retry malformed frames as if they were valid.
6. Process messages through the runtime. Check each result object and decide
   how the application reports or handles failures.
7. In a browser, mount a surface with the Web facade. The target is a host
   DOM element; the renderer owns the Weaver-rendered subtree.
8. Bind user input through the Web interaction bridge or
   `runtime.writeInput`. Supply the exact `surfaceId`, `sourceComponentId`,
   and `scopePath` identity for the current instance.
9. Dispatch explicit actions with `runtime.dispatchAction`. Application code
   allowlists action names and validates context before invoking business
   behavior. Core does not send actions over a network.
10. Add a transport only when the application needs remote delivery. Use the
    Core `A2UITransportSession` to keep host-assigned route ownership around
    one runtime, then use a supported adapter such as the Web HTTP/SSE
    transport.
11. Add MCP only when the application needs MCP. The MCP bridge consumes an
    already-connected official MCP client; connection, authentication, route
    assignment, and lifetime remain host-owned.

### Core-only runtime and A2UI production

This is a small platform-neutral setup using the trusted canonical Basic
Catalog. A custom catalog may be supplied as a `CatalogRegistration`, but its
schema must be trusted host configuration.

```ts
import {
  createA2UIV091Producer,
  createBasicCatalogV091Registration,
  createWeaverRuntime,
  type A2UIServerMessage,
} from "@cylayo/weaver-core";

const created = createWeaverRuntime({
  catalogs: [createBasicCatalogV091Registration()],
});
if (!created.ok) {
  throw new Error(`Runtime configuration failed: ${created.error.code}`);
}

const runtime = created.value;
const producer = createA2UIV091Producer();
const messages: A2UIServerMessage[] = [
  producer.createSurface({
    surfaceId: "main",
    catalogId: "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json",
  }),
  producer.updateComponents({
    surfaceId: "main",
    components: [{ id: "root", component: "Text", text: "Hello" }],
  }),
];

for (const message of messages) {
  const processed = runtime.process(message);
  if (!processed.ok) {
    throw new Error(`A2UI processing failed: ${processed.error.code}`);
  }
}

const resolved = runtime.resolveSurface("main");
if (!resolved.ok) {
  throw new Error(`Surface resolution failed: ${resolved.error.code}`);
}
```

The producer constructs caller-owned, protocol-checked JSON. Runtime processing
still performs the authoritative protocol, catalog, and lifecycle checks.

### Safe JSONL stream ingestion

The provider or application owns the model stream and extracts text deltas.
Core owns framing and runtime processing:

```ts
import {
  createA2UIV091StreamIngestion,
  type WeaverRuntime,
} from "@cylayo/weaver-core";

function applyProviderDeltas(
  runtime: WeaverRuntime,
  deltas: Iterable<string>,
): void {
  const ingestion = createA2UIV091StreamIngestion({ runtime });
  for (const delta of deltas) {
    for (const event of ingestion.push(delta)) {
      if (!event.ok) {
        console.error("Rejected A2UI frame", event.frame, event.error.code);
      }
    }
  }
  for (const event of ingestion.finish()) {
    if (!event.ok) {
      console.error("Rejected final A2UI frame", event.frame, event.error.code);
    }
  }
}
```

`push`, `finish`, and `reset` are synchronous. Invalid JSON, oversized frames,
invalid protocol messages, catalog failures, and runtime failures remain
structured errors; invalid output is not silently repaired and failed frames
do not partially mutate runtime state.

### Browser rendering, input, and actions

For the canonical Basic Catalog, use the Web facade. Catalog and Basic
renderer registration are trusted host setup. Media remains deny-by-default
unless a host policy approves a URL; attribution is displayed only from a
trusted host provider.

`createBasicWebRuntime` does not automatically install trusted Basic function
implementations or `openUrl`. Register trusted implementations explicitly when
the application needs them.

```ts
import { createBasicWebRuntime } from "@cylayo/weaver-web";

export function start(target: Element): void {
  const created = createBasicWebRuntime({
    basic: {
      resourcePolicy: ({ url }) =>
        url.startsWith("https://assets.example/") ? url : undefined,
    },
    rendering: {
      attributionProvider: () => ({ displayName: "Trusted application" }),
    },
  });
  if (!created.ok) {
    throw new Error(`Web runtime configuration failed: ${created.error.code}`);
  }

  const web = created.value;
  const processed = web.runtime.process({
    version: "v0.9.1",
    createSurface: { surfaceId: "main", catalogId: web.catalogId },
  });
  if (!processed.ok) {
    throw new Error(`Surface creation failed: ${processed.error.code}`);
  }

  const updated = web.runtime.process({
    version: "v0.9.1",
    updateComponents: {
      surfaceId: "main",
      components: [{ id: "root", component: "Text", text: "Hello" }],
    },
  });
  if (!updated.ok) {
    throw new Error(`Component update failed: ${updated.error.code}`);
  }

  const mounted = web.mount({ surfaceId: "main", target });
  if (!mounted.ok) {
    throw new Error(`Mount failed: ${mounted.error.code}`);
  }
}
```

The Basic renderers call the runtime interaction bridge for native controls and
actions. The following assumes the surface already defines a bound `TextField`
with source ID `name` and an action-bearing `Button` with source ID `submit` at
scope `/`; component IDs are not arbitrary runtime handles. Host code that
dispatches explicitly uses the current instance identity and checks the result:

```ts
import type { BasicWebRuntime } from "@cylayo/weaver-web";

function interact(web: BasicWebRuntime): void {
  const input = web.runtime.writeInput({
    surfaceId: "main",
    sourceComponentId: "name",
    scopePath: "/",
    property: "value",
    value: "Ada",
  });
  if (!input.ok) console.error("Input rejected", input.error.code);

  const action = web.runtime.dispatchAction({
    surfaceId: "main",
    sourceComponentId: "submit",
    scopePath: "/",
    actionProperty: "action",
  });
  if (!action.ok) console.error("Action rejected", action.error.code);
}
```

For server events, configure `onServerEvent` and allowlist the action name,
surface, and context in application code. Do not use an action name as a
dynamic function or method lookup. For custom renderers, use the public
`WebComponentInteractions` bridge; do not mutate runtime or DataModel state
directly.

### Transport and MCP

HTTP/SSE is opt-in. Create one route-scoped session and one browser adapter for
trusted endpoints:

```ts
import {
  createA2UITransportSession,
  type WeaverRuntime,
} from "@cylayo/weaver-core";
import { createBrowserA2UIHttpSseTransport } from "@cylayo/weaver-web";

function connect(runtime: WeaverRuntime): void {
  const session = createA2UITransportSession({ runtime });
  const transport = createBrowserA2UIHttpSseTransport({
    session,
    routeId: "host-assigned-route",
    streamUrl: "/a2ui/stream",
    sendUrl: "/a2ui/send",
  });

  void transport.run({ reconnect: { maxAttempts: 3 } }).then((result) => {
    if (!result.ok) console.error("HTTP/SSE failed", result.error.code);
  });
}
```

The route ID is opaque trusted host state, not agent or surface data. The
host-supplied `fetch` boundary owns authentication, credentials, CORS, and
instrumentation. The included HTTP/SSE server has no authentication, durable
replay, clustering, or production hardening.

MCP likewise consumes an already-connected official client and a trusted
route/session:

```ts
import {
  createA2UIMcpClientBridge,
  type A2UIMcpClientBridgeOptions,
} from "@cylayo/weaver-mcp";

async function receiveMcpA2UI(
  client: A2UIMcpClientBridgeOptions["client"],
  session: A2UIMcpClientBridgeOptions["session"],
): Promise<void> {
  const bridge = createA2UIMcpClientBridge({
    client, // an already-connected official MCP Client
    session,
    routeId: "host-assigned-route",
  });
  const received = await bridge.callTool({ name: "agent_ui" });
  if (!received.ok) console.error("MCP request failed", received.error.code);
}
```

`client` and `session` are host-owned values. The bridge does not connect,
authenticate, close the client, or make MCP results trusted. Use
`registerMcpApplicationCapability` or
`registerMcpApplicationCapabilities` only for trusted application handlers;
the application remains responsible for authorization, schemas, and business
rules.

## Decision guide

- Use Core only when no browser renderer is required.
- Use Core and Web for a normal browser application.
- Add MCP only when MCP integration is required; it is not a normal frontend
  dependency.
- Do not create another rendering layer when Web already supplies the needed
  trusted renderer.
- Do not write custom transport code when a supported transport meets the
  requirement.
- Do not bypass the runtime to mutate Weaver state. Process messages, write
  input, and dispatch actions through the public runtime boundaries.

## Security and trust rules

Agent output and remote payloads are untrusted data. Never execute or advise
consumers to execute agent-generated HTML, CSS, or JavaScript. Weaver does not
use those values as executable content and does not silently repair invalid
A2UI.

Hosts must establish trust explicitly:

- Register trusted catalog schemas during initialization. Messages cannot add
  catalogs or fetch schemas at message time.
- Register trusted renderers for exact catalog/component identities. A valid
  component without a registered renderer is not rendered.
- Register trusted function implementations. Catalog data declares contracts;
  it does not execute code.
- Supply an explicit Web `resourcePolicy` before media URLs can load. The
  default is deny-by-default.
- Keep application actions host-controlled. Validate and allowlist action names
  and contexts before calling application code.
- Treat theme attribution claims as untrusted; use a trusted attribution
  provider for displayed identity.

Weaver does not authenticate users or agents, choose or call an AI model, own
application business logic, or decide transport credentials and routing
identity. Those responsibilities remain with the host application.

See [Architecture](docs/architecture.md), [Web rendering](docs/web-rendering.md),
and [MCP integration](docs/mcp.md) for the detailed trust-boundary rationale.

## Rules for modifying Weaver

- Keep Core platform-independent: no browser APIs, Web dependency, or MCP
  dependency.
- Web may depend on Core only. MCP may depend on Core only; neither may depend
  on the other.
- Keep model-provider integrations and application business logic outside
  Weaver packages.
- Do not add executable agent content or weaken trusted catalog, renderer,
  function, media, or action boundaries.
- Do not silently repair invalid A2UI. Preserve A2UI v0.9.1 conformance.
- Do not describe roadmap or experimental work as released functionality.
- Keep public API additions deliberate and minimal; preserve the single root
  export boundary unless the package design explicitly changes.
- Follow existing patterns, use descriptive names, extract complex conditions
  into named booleans, and add tests for changed behavior.
- Do not modify unrelated files. One numbered roadmap task equals one pull
  request.

## Validation commands

For normal repository work, the important checks are:

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm conformance:v0.9.1
pnpm verify:packages
pnpm verify:worker-core
```

During focused development, run the package check that covers the change:

```sh
pnpm --filter @cylayo/weaver-core typecheck
pnpm --filter @cylayo/weaver-core test
pnpm --filter @cylayo/weaver-web typecheck
pnpm --filter @cylayo/weaver-web test
pnpm --filter @cylayo/weaver-mcp typecheck
pnpm --filter @cylayo/weaver-mcp test
```

Documentation-only changes should at least run `git diff --check` and inspect
the final diff. Run package typechecks when examples or named public APIs
change. Run the full release gates before completing implementation changes or
claiming package/release readiness; `verify:packages` and
`verify:worker-core` are the expensive packaging and Worker checks.

## Detailed documentation

- [Architecture](docs/architecture.md)
- [Validated A2UI stream ingestion](docs/a2ui-stream-ingestion.md)
- [Web rendering](docs/web-rendering.md)
- [HTTP/SSE transport](docs/http-sse-transport.md)
- [MCP integration](docs/mcp.md)
- [Packaging](docs/packaging.md)
- [A2UI v0.9.1 conformance](docs/conformance-v0.9.1.md)

# Weaver

Weaver is an independent application runtime for dynamic interfaces built on
[A2UI](https://a2ui.org) v1.0. It is a framework, not an application: Weaver
validates A2UI messages, maintains interface state, renders surfaces in the
browser, binds user input back to state, and dispatches explicitly triggered
actions.

Weaver is model-independent. An application or agent emits A2UI messages;
Weaver does not require an AI model, does not generate interfaces itself, and
contains no application business logic. Weaver never executes agent-provided
HTML, CSS, or JavaScript. Agent input is data, and trust is always established
by host configuration (see [Security and trust model](#security-and-trust-model)).

The runtime core is platform-independent (no DOM, no Node APIs, no dynamic
JavaScript compilation) and works in browsers, Node, and Worker runtimes.

> **Status.** This branch is Weaver 0.4.0, which is **unreleased**. It implements
> A2UI v1.0 as a hard cutover and does not accept v0.9 messages. The released
> version, 0.3.1, implements A2UI v0.9.1. See [CHANGELOG.md](CHANGELOG.md) for the
> breaking changes and the migration guide.

## Architecture overview

The three packages have strict, one-directional dependencies:

```text
@cylayo/weaver-core   (protocol, runtime, catalog, state, actions)
    ^                ^
    |                |
@cylayo/weaver-web    @cylayo/weaver-mcp   (both optional, peer-depend on core)
```

- `@cylayo/weaver-core` is the browser-independent runtime foundation. It must not depend
  on Web or MCP.
- `@cylayo/weaver-web` is browser rendering and the browser HTTP/SSE transport. It may
  depend on Core only.
- `@cylayo/weaver-mcp` is the optional MCP bridge. It may depend on Core only.

```text
                  WeaverRuntime (core)
                       |
        ┌──────────────┼───────────────┐
        ↓              ↓               ↓
 message input     derived UI      interaction
        │              │               │
        ↓              ↓               ├── writeInput
MessageProcessor  resolvers             └── dispatchAction
        │              │
        └──────→ SurfaceStore ←─────────┘
```

A2UI messages arrive at the runtime, are protocol-validated, checked against
the host's trusted catalog, and applied to `SurfaceStore` state. The Web
renderer derives a hydrated component tree from the current snapshot and
rebuilds its owned DOM. User input writes back through the runtime to the
data model. Explicit actions go through `ActionDispatcher`, and they stay
transport-neutral until a host transport delivers them.

See [docs/architecture.md](docs/architecture.md) for the full architecture.

## Packages

| Package | Version | Runtime | Responsibilities |
| --- | --- | --- | --- |
| `@cylayo/weaver-core` | 0.4.0 (unreleased) | browser, Node, Workers | A2UI v1.0 protocol validation and JSONL framing; trusted catalog registration; surface and data-model state; derived component trees, instances, properties, and checks; input binding; transport-neutral action dispatch; transport-session routing; opt-in trusted Basic Catalog functions |
| `@cylayo/weaver-web` | 0.4.0 (unreleased) | browser | Trusted DOM renderer allowlist and Basic Catalog renderers; full-mount reactive rendering; browser HTTP/SSE transport adapter; attribution boundary |
| `@cylayo/weaver-mcp` | 0.4.0 (unreleased) | backend runtimes | Optional MCP A2UI bridge; application-capability registration helpers |

All three packages are ESM-only with a single root export, and they release
together at one synchronized version. Core is mandatory. Web and MCP declare
`@cylayo/weaver-core` as a peer dependency (`0.4.x` on this branch). MCP is
optional and not required by Core or Web. See [docs/packaging.md](docs/packaging.md).

## Current maturity / support status

Weaver is pre-1.0. The public API is evolving and should not be assumed stable.

- **Core** is platform-independent and has worker-safe verification: a
  packaged-Core gate runs catalog registration and A2UI validation inside
  Cloudflare `workerd` (see [docs/packaging.md](docs/packaging.md)).
- **Web** owns browser behavior: DOM rendering, interaction, and the browser
  HTTP/SSE transport, covered by browser tests.
- **MCP** is optional, separate, and only where the official MCP SDK runs.
- **Distribution.** The released 0.3.1 packages are on npm. The 0.4.0 packages are
  not published yet. Until they are, install the packed tarballs from the local
  artifact workflow in [docs/packaging.md](docs/packaging.md#local-artifact-workflow).
- **Transports** are concrete only where implemented: the browser HTTP/SSE
  adapter and the MCP bridge. The included reference server
  (`examples/http-sse-server/`) is a single-peer loopback test peer, not a
  production server.
- **Remote function calls** are supported in both directions: the agent may call a
  renderer function (`callRendererFunction`), and the renderer may call an agent
  function (`callAgentFunction`, answered by `agentFunctionResponse`). The browser
  HTTP/SSE adapter and the MCP bridge carry them. The host owns timeouts and the
  reply channel. See [docs/architecture.md](docs/architecture.md#remote-function-calls).
- **Multi-catalog surfaces.** A component resolves to its `@catalogId`, else to the surface's
  default catalog, so one surface can mix Basic and custom components. A surface may have no default.
  See [docs/architecture.md](docs/architecture.md#catalog-resolution).
- **Not yet supported in 0.4.0.** Composition constraints (`allowedParents`, `allowedChildren`)
  are accepted in catalogs but are not enforced yet. See
  [docs/conformance-v1.0.md](docs/conformance-v1.0.md).

Runtime support declarations are package-specific. `@cylayo/weaver-mcp` requires
Node >=20 (its pinned MCP runtime dependencies do). `@cylayo/weaver-core` and
`@cylayo/weaver-web` make no Node-version support declaration.

## Quick Start

Install `@cylayo/weaver-core` (required) and `@cylayo/weaver-web` for a browser, or
`@cylayo/weaver-mcp` for a backend (Node.js 20 or later):

```sh
npm install @cylayo/weaver-core @cylayo/weaver-web
```

The Quick Start examples use the 0.4.0 API. They run against the 0.4.0 packages,
which are not on npm yet, so install them from the packed tarballs
(see [docs/packaging.md](docs/packaging.md#local-artifact-workflow)). The released 0.3.1
packages implement A2UI v0.9.1 and do not accept these examples.

The three packages are ESM-only and release together at one synchronized version.
Each example below is a complete program. `pnpm verify:packages` and
`pnpm verify:registry` compile and run them against the packed and the published
packages, and the browser example also runs in happy-dom.

### Browser: render a surface with Web

```ts
import { createBasicWebRuntime } from "@cylayo/weaver-web";

const created = createBasicWebRuntime();
if (!created.ok) throw new Error("Web runtime configuration failed");

const web = created.value;
web.runtime.process({
  version: "1.0",
  createSurface: { surfaceId: "main", catalogId: web.catalogId },
});
web.runtime.process({
  version: "1.0",
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

Mount into an element with `id="app"`. Weaver renders the surface as DOM that it
owns. The [Web rendering](#web-rendering-browser) section covers the trusted media
and icon policies that a real application configures.

### Worker: Core only, no DOM

```ts
import {
  A2UI_V10_BASIC_CATALOG_ID,
  createBasicCatalogV10Registration,
  createWeaverRuntime,
} from "@cylayo/weaver-core";

// Core only: no DOM and no Node APIs, so this module runs in a Cloudflare Worker.
export default {
  fetch(request: Request): Response {
    const name = new URL(request.url).searchParams.get("name") ?? "Weaver";
    const made = createWeaverRuntime({ catalogs: [createBasicCatalogV10Registration()] });
    if (!made.ok) return Response.json({ error: "runtime configuration failed" }, { status: 500 });

    const runtime = made.value;
    runtime.process({
      version: "1.0",
      createSurface: { surfaceId: "main", catalogId: A2UI_V10_BASIC_CATALOG_ID },
    });
    const updated = runtime.process({
      version: "1.0",
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

Each request builds a runtime, applies the messages, and returns the resolved
surface as JSON. The [Core only](#core-only-any-platform) section shows the same
runtime with explicit steps, and the [Minimal working example](#minimal-working-example)
explains the trust model.

### Deterministic: a canned response, no model

```ts
import {
  A2UI_V10_BASIC_CATALOG_ID,
  createA2UIV10StreamIngestion,
  createBasicCatalogV10Registration,
  createWeaverRuntime,
} from "@cylayo/weaver-core";

// A canned agent response: A2UI v1.0 JSONL. A model would produce this text; here it is fixed.
const cannedResponse = [
  { version: "1.0", createSurface: { surfaceId: "main", catalogId: A2UI_V10_BASIC_CATALOG_ID } },
  {
    version: "1.0",
    updateComponents: {
      surfaceId: "main",
      components: [{ id: "root", component: "Text", text: "Hello from a canned response" }],
    },
  },
].map((message) => `${JSON.stringify(message)}\n`).join("");

const created = createWeaverRuntime({ catalogs: [createBasicCatalogV10Registration()] });
if (!created.ok) throw new Error("runtime configuration failed");
const runtime = created.value;

// The stream ingestion validates each frame and applies it to the runtime. No model is called.
const ingestion = createA2UIV10StreamIngestion({ runtime });
const events = ingestion.push(cannedResponse);
ingestion.finish();
if (events.length !== 2 || !events.every((event) => event.ok)) throw new Error("canned response was not applied");

const resolved = runtime.resolveSurface("main");
if (!resolved.ok) throw new Error(`surface not resolved: ${resolved.error.code}`);
if (!JSON.stringify(resolved.value.tree).includes("Hello from a canned response")) {
  throw new Error("canned text was not rendered");
}
console.log(JSON.stringify(resolved.value.tree));
```

The response is fixed text, so this runs with no model and no network. A model's
output takes the same path. Weaver validates each frame and never repairs one.
See [validated A2UI stream ingestion](docs/a2ui-stream-ingestion.md).

## Minimal working example

Weaver's trust model is explicit: the host registers every trusted A2UI catalog
and renderer during initialization. `@cylayo/weaver-core` bundles the canonical
A2UI v1.0 Basic Catalog registration helper (`createBasicCatalogV10Registration`),
so a host does not copy its schema. Custom catalogs are registered the same way.
The recipe, with a trusted renderer and its failure tests, is in
[custom catalogs](docs/custom-catalogs.md).

### Producing A2UI messages

Application code can use the version-explicit producer for the server-message
lifecycle instead of repeating the wire version and envelope keys:

```ts
import { createA2UIV10Producer } from "@cylayo/weaver-core";

const producer = createA2UIV10Producer();
const messages = [
  producer.createSurface({ surfaceId: "main", catalogId: "my-catalog" }),
  producer.updateComponents({
    surfaceId: "main",
    components: [{ id: "root", component: "Text", text: "Hello" }],
  }),
  producer.updateDataModel({ surfaceId: "main", path: "/name", value: "Ada" }),
];
```

The producer constructs caller-owned A2UI v1.0 JSON and checks the protocol envelope.
It does not call a model, validate a trusted catalog, manage runtime lifecycle,
authorize application actions, or make model output trusted. Application or provider
code owns model selection and text extraction. A runtime then processes the messages.

### Validated streamed ingestion

For untrusted provider text, use the Core stream-ingestion API with an existing runtime:

```ts
import { createA2UIV10StreamIngestion, type WeaverRuntime } from "@cylayo/weaver-core";

export function applyProviderDeltas(runtime: WeaverRuntime, providerTextDeltas: Iterable<string>): void {
  const ingestion = createA2UIV10StreamIngestion({ runtime });
  for (const textDelta of providerTextDeltas) {
    for (const event of ingestion.push(textDelta)) {
      if (!event.ok) console.error(event.frame, event.error.code);
    }
  }
  for (const event of ingestion.finish()) {
    if (!event.ok) console.error(event.frame, event.error.code);
  }
}
```

The application or provider owns the model stream and text extraction. Weaver owns strict
JSONL framing and runtime processing. It does not repair JSON, strip Markdown, retry output,
call a model, or authorize actions. See [validated A2UI stream ingestion](docs/a2ui-stream-ingestion.md).

### Prompt generation

`generateA2UIV10Prompt()` compiles a trusted catalog into model instructions. The
prompt lists only components the catalog declares, and functions that are both declared
and registered. It is deterministic and calls no model; your code sends the text to your
own provider.

```ts
import { createBasicCatalogV10Registration, generateA2UIV10Prompt } from "@cylayo/weaver-core";

const result = generateA2UIV10Prompt({
  catalogs: [createBasicCatalogV10Registration()],
  actions: [
    { name: "submit_signup", description: "Submit the sign-up form.", context: { name: { path: "/form/name" } } },
  ],
});
if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);

// Pass this text to your own model call as the system prompt.
const systemPrompt = result.value.text;
```

See [prompt generation](docs/prompt-generation.md) for modes, examples, the size budget and errors.

### Core only (any platform)

```ts
import {
  A2UI_V10_BASIC_CATALOG_ID,
  createBasicCatalogV10Registration,
  createWeaverRuntime,
} from "@cylayo/weaver-core";

// 1. Register the trusted catalog. Core installs no catalog by default.
const created = createWeaverRuntime({
  catalogs: [createBasicCatalogV10Registration()],
  // Optional host safety policy; omitted values use finite defaults.
  safety: { maxResolutionDepth: 32, maxResolvedInstances: 1000 },
});
if (!created.ok) throw new Error(`runtime configuration failed: ${created.error.code}`);
const runtime = created.value;

// 2. Process A2UI agent messages. Each result is checked, never assumed.
const catalogId = A2UI_V10_BASIC_CATALOG_ID;
const messages = [
  { version: "1.0", createSurface: { surfaceId: "main", catalogId } },
  {
    version: "1.0",
    updateComponents: {
      surfaceId: "main",
      components: [{ id: "root", component: "Text", text: "Hello from Weaver" }],
    },
  },
];
for (const message of messages) {
  const processed = runtime.process(message);
  if (!processed.ok) throw new Error(`A2UI processing failed: ${processed.error.code}`);
}

// 3. Read the current hydrated surface.
const resolved = runtime.resolveSurface("main");
if (resolved.ok) console.log(resolved.value.tree);
```

Runtime resolution has finite host safety budgets. `maxResolutionDepth` counts
root depth as 1, and `maxResolvedInstances` bounds structural node and reference work
plus materialized instances. Each resolution gets fresh counters. Exceeding a budget returns a
typed `RESOLUTION_BUDGET_EXCEEDED` policy error, never a partial tree. Hosts may configure
stricter positive safe-integer limits. Invalid policy fails runtime creation.

A custom catalog is host configuration. Declare it with `defineCatalog()`, which
attaches a catalog id to a schema. Every component then needs a trusted renderer on
the Web side, and every function needs a trusted implementation. See
[custom catalogs](docs/custom-catalogs.md).

### Web rendering (browser)

The recommended path for the canonical Basic Catalog uses the high-level Web facade:

```ts
import { createBasicWebRuntime } from "@cylayo/weaver-web";

const created = createBasicWebRuntime({
  basic: {
    // Trusted host policies. Omitted policies remain deny-by-default.
    resourcePolicy: ({ url }) => (url.startsWith("https://assets.example/") ? url : undefined),
    iconResolver: ({ name }) => ({ home: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" }[name]),
  },
  rendering: {
    attributionProvider: () => ({ displayName: "Trusted host" }),
  },
});
if (!created.ok) throw new Error("Web runtime configuration failed");

const web = created.value;
web.runtime.process({
  version: "1.0",
  createSurface: { surfaceId: "main", catalogId: web.catalogId },
});
web.runtime.process({
  version: "1.0",
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

`createBasicWebRuntime` supplies the canonical Basic catalog registration and its 18
trusted renderer registrations. Media, icons, datetime-local resolution, attribution, and
all functions are explicit host choices. No Basic functions and no `openUrl` implementation
are installed automatically. The facade creates no transport and opens no network
connection. Additional trusted catalogs and renderers come through its grouped options
(`additionalCatalogs`, `additionalRenderers`). See [docs/web-rendering.md](docs/web-rendering.md).

The canonical runnable examples have different purposes. The
[playground](examples/playground/) explores renderers and Basic components, and its
[Playground page](examples/playground/README.md) edits A2UI JSONL live. The
[reference application](examples/reference-app/) demonstrates the full
application-agent, producer, JSONL ingestion, runtime, Web, and trusted action round trip.
The loopback browser transport is shown by the [HTTP/SSE reference server](examples/http-sse-server/).

### Debugging and replay

An opt-in runtime observer and trace recorder keep what a runtime was given and what it
returned. `replayWeaverTrace()` re-applies a saved trace to a fresh runtime, and the
[trace inspector](examples/playground/inspector.html) steps through it. These are development
tools. A trace holds data-model values and user input, so Weaver never sends or persists one.
See [debugging, replay and the inspector](docs/debugging.md).

## A2UI conformance

Weaver targets A2UI **v1.0**. The only accepted wire version is `"1.0"`. Messages
with `v0.9` or `v0.9.1` are rejected, and Weaver never rewrites them. Renderer
capabilities use the namespace key `"1.0"`.

The requirement tracker is [docs/conformance-v1.0.md](docs/conformance-v1.0.md). It lists
what is implemented, what is planned, and the not-yet-supported items above.

## Optional MCP integration

`@cylayo/weaver-mcp` is optional. A frontend-only installation (`@cylayo/weaver-core` and
`@cylayo/weaver-web`) needs no MCP. Core and Web have no MCP dependency.

The MCP package targets MCP **2026-07-28** with the official TypeScript SDK v2:

- `createA2UIMcpClientBridge` maps A2UI over an already-connected official MCP
  client, binding one client to one trusted host-assigned route.
- `registerMcpApplicationCapability` and `registerMcpApplicationCapabilities`
  register trusted application handlers as ordinary MCP tools.

Connection, authentication, and lifetime are host-owned. See [docs/mcp.md](docs/mcp.md).

## Security and trust model

Agent-controlled input is data and is never executable. Trust comes from explicit host
configuration:

- **Trusted catalogs only.** The host registers every trusted catalog during
  initialization. A2UI messages cannot modify the trust set, and no schema is fetched at
  message time. The standard `common_types.json` is built into Weaver and cannot be embedded
  in a catalog.
- **No executable content.** Weaver never uses `eval`, `new Function`, dynamic imports,
  script URLs, or HTML-string parsing.
- **Trusted renderer allowlist.** A validated component still needs an explicitly
  registered renderer for its exact `catalogId + component` identity. There is no fallback.
- **Trusted function implementations.** Catalog JSON declares contracts only. A function
  declares whether it `requiresUserActivation` and which callers may use it (`allowedCallers`),
  and the runtime enforces both. Implementations are host-registered code.
- **Gesture-gated navigation.** `openUrl` requires user activation. The runtime grants
  it only for an explicit user gesture (`dispatchAction` with `userActivation: true`).
- **Deny-by-default media.** `@cylayo/weaver-web` loads no agent-supplied media URL unless
  the host installs a `resourcePolicy`. The spec's media URL rule is checked before the
  policy is consulted.
- **Trusted attribution only.** Only the output of a trusted host `attributionProvider` is
  displayed. The agent cannot supply a display name or icon.
- **Host-owned identity and routing.** Route IDs are opaque host-assigned values. Weaver
  performs no authentication, and a surface belongs to the route that created it.

Host configuration is the trusted side. Everything arriving over the wire is untrusted input.
See [docs/architecture.md](docs/architecture.md) and [docs/web-rendering.md](docs/web-rendering.md).

## Repository layout / deeper documentation

```text
packages/
  core/    @cylayo/weaver-core    protocol, runtime, catalog, state, actions
  web/     @cylayo/weaver-web     browser rendering + HTTP/SSE transport
  mcp/     @cylayo/weaver-mcp     optional MCP bridge + capability helpers
examples/
  playground/              renderer and Basic component exploration
  reference-app/           full producer/ingestion/runtime/action round trip
  http-sse-server/         loopback reference peer for the HTTP/SSE binding
integration/
  package-consumer/        isolated consumer for packed-tarball verification
  workerd-consumer/        Cloudflare workerd gate for packaged Core
scripts/                   pack and verify scripts
docs/                      detailed documentation (below)
```

| Document | Covers |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | Package rules, runtime pipeline, trust boundaries, derived state, transport sessions |
| [docs/a2ui-stream-ingestion.md](docs/a2ui-stream-ingestion.md) | Validated JSONL framing and runtime application |
| [docs/prompt-generation.md](docs/prompt-generation.md) | Model prompt compiler: modes, sections, budget, errors |
| [docs/custom-catalogs.md](docs/custom-catalogs.md) | Recipe for an app-owned catalog with trusted renderers and the security checklist |
| [docs/web-rendering.md](docs/web-rendering.md) | Renderer pipeline, Basic Catalog renderers, media and attribution policies |
| [docs/debugging.md](docs/debugging.md) | Runtime observer, trace recording and replay, the trace inspector, trace privacy |
| [docs/http-sse-transport.md](docs/http-sse-transport.md) | Browser HTTP/SSE binding, reconnect and resume |
| [docs/mcp.md](docs/mcp.md) | MCP A2UI bridge and application-capability helpers |
| [docs/packaging.md](docs/packaging.md) | ESM packaging, local tarball workflow, release gates, versioning |
| [docs/conformance-v1.0.md](docs/conformance-v1.0.md) | A2UI v1.0 requirement tracker |

Historical planning documents (`docs/PLAN.md`, `docs/weaver-dev-plan.md`,
`docs/prototype-notes.md`, `docs/zynra-v2-readiness.md`) describe the v0.9.1 era and
are kept as history.

## Contributing locally

Weaver is developed in this repository with pnpm. To work on the packages:

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm conformance:v1.0
pnpm check:docs
pnpm verify:packages
pnpm verify:worker-core
```

Scope boundaries to respect:

- `@cylayo/weaver-core` must remain browser-independent and free of MCP and Web dependencies.
- MCP remains optional. Model providers remain outside Weaver. Weaver must work without an
  AI model and must not contain application business logic.
- Never execute agent-provided HTML, CSS, or JavaScript, and never silently repair invalid A2UI.
- Preserve A2UI v1.0 conformance and do not claim features the code does not provide.

Documentation lives in `docs/`. Internal roadmap and status decisions belong in
[docs/PLAN.md](docs/PLAN.md), which describes the v0.9.1 era.

## License

Weaver is licensed under the Apache License 2.0 (SPDX: `Apache-2.0`). The project license is
in [`LICENSE`](LICENSE). The A2UI-derived material redistributed by Core retains separate
provenance and attribution in
[`packages/core/THIRD_PARTY_LICENSES.txt`](packages/core/THIRD_PARTY_LICENSES.txt). That file
is not Weaver's project license.

# Weaver

Weaver is an independent application runtime for dynamic interfaces built on
[A2UI](https://a2ui.org) v0.9.1. It is a framework, not an application: Weaver
validates A2UI messages, maintains interface state, renders surfaces in the
browser, binds user input back to state, and dispatches explicitly triggered
actions.

Weaver is model-independent. An application or agent emits A2UI messages;
Weaver does not require an AI model, does not generate interfaces itself, and
contains no application business logic. Weaver never executes agent-provided
HTML, CSS, or JavaScript — agent input is data, and trust is always established
by host configuration (see [Security and trust model](#security-and-trust-model)).

The runtime core is platform-independent (no DOM, no Node APIs, no dynamic
JavaScript compilation) and works in browsers, Node, and Worker runtimes.

## Architecture overview

The three packages have strict, one-directional dependencies:

```text
@weaver/core   (protocol, runtime, catalog, state, actions)
    ^                ^
    |                |
@weaver/web    @weaver/mcp   (both optional, peer-depend on core)
```

- `@weaver/core` — browser-independent runtime foundation. It must not depend
  on Web or MCP.
- `@weaver/web` — browser rendering and the browser HTTP/SSE transport. It may
  depend on Core only.
- `@weaver/mcp` — optional MCP bridge. It may depend on Core only.

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
`DataModel`; explicit actions dispatch through `ActionDispatcher` and remain
transport-neutral until a host transport delivers them.

See [docs/architecture.md](docs/architecture.md) for the full architecture.

## Packages

| Package | Version | Runtime | Responsibilities |
| --- | --- | --- | --- |
| `@weaver/core` | 0.1.x | browser, Node, Workers | A2UI v0.9.1 protocol validation and JSONL framing; trusted catalog registration; surface and data-model state; derived component trees, instances, properties, and checks; input binding; transport-neutral action dispatch; transport-session routing; opt-in trusted Basic Catalog functions |
| `@weaver/web` | 0.1.x | browser | Trusted DOM renderer allowlist and Basic Catalog renderers; full-mount reactive rendering; browser HTTP/SSE transport adapter; theme and attribution boundaries |
| `@weaver/mcp` | 0.1.x | backend runtimes | Optional MCP 2026-07-28 A2UI bridge; application-capability registration helpers |

All three packages are ESM-only with a single root export, and they release
together at one synchronized version. Core is mandatory; Web and MCP declare
`@weaver/core` as a peer dependency (`0.1.x`). MCP is optional and not required
by Core or Web. See [docs/packaging.md](docs/packaging.md).

## Current maturity / support status

Weaver is pre-1.0. The public API is evolving and should not be assumed stable.

- **Core** is platform-independent and has worker-safe verification: a
  packaged-Core gate runs catalog registration and A2UI validation inside
  Cloudflare `workerd` (see [docs/packaging.md](docs/packaging.md)).
- **Web** owns browser behavior: DOM rendering, interaction, and the browser
  HTTP/SSE transport, all covered by browser tests.
- **MCP** is optional, separate, and only where the official MCP SDK runs.
- **Transports** are concrete only where implemented: the browser HTTP/SSE
  adapter and the MCP bridge. The included reference server
  (`examples/http-sse-server/`) is a single-peer loopback test peer, not a
  production server.

Runtime support declarations (Node version policy, and so on) are not yet
established; this document does not claim any.

## Current consumption / install workflow

Weaver is not currently published to a package registry. Today's verified
workflow is local packed tarballs:

```sh
pnpm install
pnpm verify:packages
```

This builds the workspace and produces three ignored tarballs in `artifacts/`:

```text
artifacts/weaver-core-0.1.2.tgz
artifacts/weaver-web-0.1.2.tgz
artifacts/weaver-mcp-0.1.2.tgz
```

An external application installs them by relative file path:

```json
{
  "dependencies": {
    "@weaver/core": "file:../weaver/artifacts/weaver-core-0.1.2.tgz",
    "@weaver/web": "file:../weaver/artifacts/weaver-web-0.1.2.tgz"
  }
}
```

`verify:packages` also installs the tarballs into an isolated consumer outside
the workspace and runs strict declaration and runtime-import checks against
them, so a passing run demonstrates the artifacts are consumable. `pnpm
verify:worker-core` runs the same packaged Core inside `workerd`.

See [docs/packaging.md](docs/packaging.md) for the complete local artifact
workflow and release gate.

## Minimal working example

Weaver's trust model is explicit: the host registers every trusted A2UI catalog
and renderer during initialization. There is no built-in catalog or
"create an app" helper, so the quick-start is deliberately low-level.

### Core only (any platform)

```ts
import { createWeaverRuntime } from "@weaver/core";

// 1. Build a trusted A2UI v0.9.1 catalog JSON Schema (only a fragment shown).
const catalogId = "basic";
const schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  catalogId,
  components: {
    Text: {
      type: "object",
      properties: {
        id: { type: "string" },
        component: { const: "Text" },
        text: { $ref: "common_types.json#/$defs/DynamicString" },
      },
      required: ["id", "component", "text"],
      additionalProperties: false,
    },
  },
  functions: {},
  $defs: {
    theme: { type: "object", additionalProperties: false },
    commonTypes: {
      $id: "common_types.json",
      $defs: {
        DynamicString: {
          oneOf: [
            { type: "string" },
            { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
            { type: "object" },
          ],
        },
      },
    },
  },
};

// 2. Create the runtime with the trusted catalog (returns { ok, value }).
const created = createWeaverRuntime({ catalogs: [{ catalogId, schema }] });
if (!created.ok) throw new Error("runtime configuration failed");

// 3. Process A2UI server messages.
created.value.process({ version: "v0.9.1", createSurface: { surfaceId: "main", catalogId } });
created.value.process({
  version: "v0.9.1",
  updateComponents: {
    surfaceId: "main",
    components: [
      { id: "root", component: "Text", text: "Hello from Weaver" },
    ],
  },
});

// 4. Read the current hydrated surface.
const resolved = created.value.resolveSurface("main");
if (resolved.ok) console.log(resolved.value.tree);
```

### Web rendering (browser)

```ts
import { createWeaverRuntime } from "@weaver/core";
import {
  RendererRegistry,
  WebSurfaceRenderer,
  createBasicCatalogRendererRegistrations,
} from "@weaver/web";

// runtime created as above with a registered trusted catalog
const runtime = created.value;

// The host opts into the trusted Basic Catalog renderer allowlist.
const renderers = new RendererRegistry(
  createBasicCatalogRendererRegistrations({ catalogId }),
);

const mount = new WebSurfaceRenderer({ runtime, renderers }).mount({
  surfaceId: "main",
  target: document.querySelector("#app")!,
});
```

`createBasicCatalogRendererRegistrations` returns an explicit allowlist of 18
Basic Catalog renderers and accepts optional host-provided policies
(`resourcePolicy`, `iconResolver`, `regexMatcher`,
`dateTimeInputLocalValueResolver`). `RendererRegistry` accepts application
renderers alongside them. See
[docs/web-rendering.md](docs/web-rendering.md).

The canonical runnable example is the
[playground](examples/playground/), and the loopback browser transport is
demonstrated by the [HTTP/SSE reference
server](examples/http-sse-server/).

## A2UI conformance

Weaver targets A2UI **v0.9.1**. Accepted wire versions are `v0.9` and `v0.9.1`;
messages generated by Weaver prefer `v0.9.1`, and the client capability key is
exactly `v0.9`.

The canonical requirement-by-requirement status tracker is
[docs/conformance-v0.9.1.md](docs/conformance-v0.9.1.md). A known, accepted
renderer limitation (eager detached construction of inactive/closed
descendants) is documented there.

## Optional MCP integration

`@weaver/mcp` is optional. A frontend-only installation (`@weaver/core` +
`@weaver/web`) needs no MCP at all, and Core/Web have no MCP dependency.

The MCP package targets MCP **2026-07-28** with the official TypeScript SDK v2:

- `createA2UIMcpClientBridge` maps A2UI over an already-connected official MCP
  client, binding one client to one trusted host-assigned route.
- `registerMcpApplicationCapability` / `registerMcpApplicationCapabilities`
  register trusted application handlers as ordinary MCP tools.

Connection, authentication, and lifetime are host-owned. See
[docs/mcp.md](docs/mcp.md).

## Security and trust model

Weaver's security model is a set of explicit, host-established trust
boundaries. Agent-controlled input is data and never executable:

- **Trusted catalogs only.** The host registers every trusted A2UI catalog
  JSON Schema during initialization. A2UI messages can never modify the trust
  set, and no schema is fetched at message time.
- **No executable content.** Weaver never uses `eval`, `new Function`, dynamic
  imports, script URLs, or HTML-string parsing. Agent-provided HTML, CSS, and
  JavaScript are never executed.
- **Trusted renderer allowlist.** A validated component still requires an
  explicitly registered trusted renderer for its exact `catalogId + component`
  identity; there is no fallback.
- **Trusted function implementations.** Catalog JSON declares contracts only.
  Implementations are host-registered trusted code; catalog data is never
  executed. Function effects are classified `pure` or `action` by the host and
  can only run at the root of a direct local action.
- **Deny-by-default media.** `@weaver/web` loads no agent-supplied media URL
  unless the host installs a `resourcePolicy`. `openUrl` requires an explicit
  host-installed factory plus policy.
- **Inert attribution claims.** `theme.agentDisplayName` / `theme.iconUrl` are
  untrusted claims; only a trusted host `WebSurfaceAttributionProvider` output
  is displayed.
- **Host-owned identity and routing.** Route IDs are opaque host-assigned
  values; Weaver performs no authentication, and surfaces are owned by the
  route that created them.

Host configuration is the trusted side; everything arriving over the wire is
untrusted input. See [docs/architecture.md](docs/architecture.md) and
[docs/web-rendering.md](docs/web-rendering.md).

## Repository layout / deeper documentation

```text
packages/
  core/    @weaver/core    protocol, runtime, catalog, state, actions
  web/     @weaver/web     browser rendering + HTTP/SSE transport
  mcp/     @weaver/mcp     optional MCP bridge + capability helpers
examples/
  playground/              runnable browser example (core + web)
  http-sse-server/         loopback reference peer for the HTTP/SSE binding
integration/
  package-consumer/        isolated consumer for packed-tarball verification
  workerd-consumer/        Cloudflare workerd gate for packaged Core
scripts/                   pack and verify scripts
docs/                      detailed documentation (below)
```

| Document | Covers |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | Package rules, runtime pipeline, trust boundaries, derived state, transport sessions, rendering |
| [docs/packaging.md](docs/packaging.md) | ESM packaging, local tarball workflow, release gate, versioning |
| [docs/web-rendering.md](docs/web-rendering.md) | Renderer pipeline, Basic Catalog renderers, media/theme/attribution policies, focus |
| [docs/http-sse-transport.md](docs/http-sse-transport.md) | Browser HTTP/SSE binding, reconnect and resume |
| [docs/mcp.md](docs/mcp.md) | MCP A2UI bridge and application-capability helpers |
| [docs/conformance-v0.9.1.md](docs/conformance-v0.9.1.md) | Requirement-by-requirement A2UI v0.9.1 conformance tracker |
| [docs/PLAN.md](docs/PLAN.md) | Internal roadmap and milestone tracker (maintained by the team, not an entry point) |

## Contributing locally

Weaver is developed in this repository with pnpm. To work on the packages:

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm conformance:v0.9.1
pnpm verify:packages
pnpm verify:worker-core
```

Scope boundaries to respect:

- `@weaver/core` must remain browser-independent and free of MCP and Web
  dependencies.
- MCP remains optional; model providers remain outside Weaver; Weaver must work
  without an AI model and must not contain application business logic.
- Never execute agent-provided HTML, CSS, or JavaScript, and never silently
  repair invalid A2UI.
- Preserve A2UI v0.9.1 conformance and do not claim features the code does not
  provide.

Documentation lives in `docs/`; internal roadmap and status decisions belong in
[docs/PLAN.md](docs/PLAN.md). Prototype design notes are preserved (historical)
in [docs/prototype-notes.md](docs/prototype-notes.md).

## License status

Weaver currently has **no project license selected**. No license file exists
in this repository, and this document does not imply one.

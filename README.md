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
@cylayo/weaver-core   (protocol, runtime, catalog, state, actions)
    ^                ^
    |                |
@cylayo/weaver-web    @cylayo/weaver-mcp   (both optional, peer-depend on core)
```

- `@cylayo/weaver-core` — browser-independent runtime foundation. It must not depend
  on Web or MCP.
- `@cylayo/weaver-web` — browser rendering and the browser HTTP/SSE transport. It may
  depend on Core only.
- `@cylayo/weaver-mcp` — optional MCP bridge. It may depend on Core only.

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
| `@cylayo/weaver-core` | 0.2.1 | browser, Node, Workers | A2UI v0.9.1 protocol validation and JSONL framing; trusted catalog registration; surface and data-model state; derived component trees, instances, properties, and checks; input binding; transport-neutral action dispatch; transport-session routing; opt-in trusted Basic Catalog functions |
| `@cylayo/weaver-web` | 0.2.1 | browser | Trusted DOM renderer allowlist and Basic Catalog renderers; full-mount reactive rendering; browser HTTP/SSE transport adapter; theme and attribution boundaries |
| `@cylayo/weaver-mcp` | 0.2.1 | backend runtimes | Optional MCP 2026-07-28 A2UI bridge; application-capability registration helpers |

All three packages are ESM-only with a single root export, and they release
together at one synchronized version. Core is mandatory; Web and MCP declare
`@cylayo/weaver-core` as a peer dependency (`0.2.x`). MCP is optional and not required
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

Runtime support declarations are package-specific: `@cylayo/weaver-mcp` requires
Node >=20 (its pinned MCP runtime dependencies do), while `@cylayo/weaver-core` and
`@cylayo/weaver-web` currently make no Node-version support declaration.

## Current consumption / install workflow

Weaver is not currently published to a package registry. Today's verified
workflow is local packed tarballs:

```sh
pnpm install
pnpm verify:packages
```

This builds the workspace and produces three ignored tarballs in `artifacts/`:

```text
artifacts/cylayo-weaver-core-0.2.1.tgz
artifacts/cylayo-weaver-web-0.2.1.tgz
artifacts/cylayo-weaver-mcp-0.2.1.tgz
```

An external application installs them by relative file path (shown with a
placeholder for the Weaver checkout directory):

```json
{
  "dependencies": {
    "@cylayo/weaver-core": "file:<path-to-weaver>/artifacts/cylayo-weaver-core-0.2.1.tgz",
    "@cylayo/weaver-web": "file:<path-to-weaver>/artifacts/cylayo-weaver-web-0.2.1.tgz"
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
and renderer during initialization. `@cylayo/weaver-core` bundles the canonical A2UI
v0.9.1 Basic Catalog registration helper (`createBasicCatalogV091Registration`)
for hosts that want the canonical catalog without hand-copying its schema;
custom catalogs are registered the same low-level way.

### Producing A2UI messages

Application code can use the version-explicit producer for the common server-message lifecycle instead of repeating the wire version and envelope keys:

```ts
import { createA2UIV091Producer } from "@cylayo/weaver-core";

const producer = createA2UIV091Producer();
const messages = [
  producer.createSurface({ surfaceId: "main", catalogId: "my-catalog" }),
  producer.updateComponents({
    surfaceId: "main",
    components: [{ id: "root", component: "Text", text: "Hello" }],
  }),
  producer.updateDataModel({ surfaceId: "main", path: "/name", value: "Ada" }),
];
```

The producer constructs caller-owned A2UI v0.9.1 JSON and checks the protocol envelope. Invalid JSON-like caller values fail with `TypeError`; the producer never repairs them. It does not call a model, validate a trusted catalog, manage runtime lifecycle, authorize application actions, or make model output trusted. Application/provider code owns model selection and text extraction; a transport or runtime then processes the produced messages.

### Validated streamed ingestion

For untrusted provider text, use the Core stream-ingestion API with an existing runtime:

```ts
import { createA2UIV091StreamIngestion } from "@cylayo/weaver-core";

const ingestion = createA2UIV091StreamIngestion({ runtime });
for (const textDelta of providerTextDeltas) {
  for (const event of ingestion.push(textDelta)) {
    if (!event.ok) console.error(event.frame, event.error.code);
  }
}
ingestion.finish();
```

The application/provider owns the model stream and text extraction. Weaver owns strict JSONL framing and canonical runtime processing; it does not repair JSON, strip Markdown, retry output, call a model, or authorize actions. See [validated A2UI stream ingestion](docs/a2ui-stream-ingestion.md).

### Prompt generation

`generateA2UIV091Prompt()` compiles a trusted catalog into model instructions, so the
prompt lists only components the catalog declares and functions that are both declared and
registered. It is deterministic and calls no model; your code sends the text to your own provider.

```ts
import { createBasicCatalogV091Registration, generateA2UIV091Prompt } from "@cylayo/weaver-core";

const result = generateA2UIV091Prompt({
  catalogs: [createBasicCatalogV091Registration()],
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
import { createWeaverRuntime, type JsonObject } from "@cylayo/weaver-core";

// 1. Build a minimal Text-only A2UI v0.9.1 catalog for this example.
const catalogId = "basic";
const schema: JsonObject = {
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
const created = createWeaverRuntime({
  catalogs: [{ catalogId, schema }],
  // Optional host safety policy; omitted values use finite defaults.
  safety: { maxResolutionDepth: 32, maxResolvedInstances: 1000 },
});
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

Runtime resolution has finite host safety budgets. `maxResolutionDepth` counts
root depth as 1; `maxResolvedInstances` bounds both structural node/reference
work and materialized instances, including their roots. Each resolution gets fresh
counters. Exceeding a budget returns a typed `RESOLUTION_BUDGET_EXCEEDED`
policy error rather than a schema error, partial tree, or truncated prefix.
Hosts may configure stricter positive safe-integer limits; invalid policy fails
runtime creation. Core's JSON ownership and inspection paths are iterative, so
deep non-structural JSON remains stack-safe without silently truncating data.

### Web rendering (browser)

The recommended canonical Basic Catalog path uses the high-level Web facade:

```ts
import { createBasicWebRuntime } from "@cylayo/weaver-web";

const created = createBasicWebRuntime({
  basic: {
    // These are trusted host policies; omitted policies remain deny-by-default.
    resourcePolicy: ({ url }) => url.startsWith("https://assets.example/") ? url : undefined,
    iconResolver: ({ name }) => ({ home: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" }[name]),
    regexMatcher: ({ value, pattern }) => pattern === "^[A-Za-z ]+$" && /^[A-Za-z ]+$/.test(value),
  },
  rendering: {
    attributionProvider: () => ({ displayName: "Trusted host" }),
  },
});
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

`createBasicWebRuntime` supplies the canonical Basic catalog registration, its
18 trusted renderer registrations, and the safe Basic theme adapter. Media,
icons, regex matching, custom datetime-local resolution, attribution, and all
functions remain explicit host choices; built-in datetime-local compatibility
conversion remains available, while no Basic functions or `openUrl` implementation is
installed automatically. The facade does not create transports or network
connections. Additional trusted catalogs and renderers can be supplied through
its grouped options, while `RendererRegistry`, `WebSurfaceRenderer`, and the
Basic factories remain public for advanced composition. See
[docs/web-rendering.md](docs/web-rendering.md).

The canonical runnable examples distinguish two purposes: the
[playground](examples/playground/) explores renderers and Basic components,
while the [reference application](examples/reference-app/) demonstrates the
full application-agent -> producer -> JSONL ingestion -> runtime -> Web ->
trusted action round trip. The loopback browser transport is demonstrated by
the [HTTP/SSE reference server](examples/http-sse-server/).

### Debugging and replay

An opt-in runtime observer and trace recorder keep what a runtime was given and what it
returned. `replayWeaverTrace()` re-applies a saved trace to a fresh runtime, and the
[trace inspector](examples/playground/inspector.html) steps through it. These are development
tools. A trace holds data-model values and user input, so Weaver never sends or persists one.
See [debugging, replay and the inspector](docs/debugging.md).

## A2UI conformance

Weaver targets A2UI **v0.9.1**. Accepted wire versions are `v0.9` and `v0.9.1`;
messages generated by Weaver prefer `v0.9.1`, and the client capability key is
exactly `v0.9`.

The canonical requirement-by-requirement status tracker is
[docs/conformance-v0.9.1.md](docs/conformance-v0.9.1.md). A known, accepted
renderer limitation (eager detached construction of inactive/closed
descendants) is documented there.

## Optional MCP integration

`@cylayo/weaver-mcp` is optional. A frontend-only installation (`@cylayo/weaver-core` +
`@cylayo/weaver-web`) needs no MCP at all, and Core/Web have no MCP dependency.

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
- **Deny-by-default media.** `@cylayo/weaver-web` loads no agent-supplied media URL
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
| [docs/architecture.md](docs/architecture.md) | Package rules, runtime pipeline, trust boundaries, derived state, transport sessions, rendering |
| [docs/packaging.md](docs/packaging.md) | ESM packaging, local tarball workflow, release gate, versioning |
| [docs/web-rendering.md](docs/web-rendering.md) | Renderer pipeline, Basic Catalog renderers, media/theme/attribution policies, focus |
| [docs/debugging.md](docs/debugging.md) | Runtime observer, trace recording and replay, the development-only trace inspector, security and privacy of traces |
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

- `@cylayo/weaver-core` must remain browser-independent and free of MCP and Web
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

## License

Weaver is licensed under the Apache License 2.0 (SPDX: `Apache-2.0`). The
project license is provided in [`LICENSE`](LICENSE). The A2UI-derived material
redistributed by Core retains separate provenance and attribution in
[`packages/core/THIRD_PARTY_LICENSES.txt`](packages/core/THIRD_PARTY_LICENSES.txt); that file is not Weaver's project license.

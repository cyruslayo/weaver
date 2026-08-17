# Packaging Weaver

Weaver produces three independently consumable, ESM-only packages:

- `@weaver/core`: protocol, runtime, catalog, state, and action foundation.
- `@weaver/web`: browser renderer plus browser transport and policies.
- `@weaver/mcp`: MCP A2UI bridge plus application capability helpers.

All intended APIs are reachable from each package's root export. Internal directories are not package subpath exports.

## Dependency direction

```text
@weaver/web --peer--> @weaver/core
@weaver/mcp --peer--> @weaver/core

@weaver/core -X-> web
@weaver/core -X-> mcp
@weaver/web  -X-> mcp
```

Web and MCP accept and expose Core runtime/session types. They therefore use a strict `0.1.x` Core peer so an application supplies one compatible Core instance. MCP additionally installs its official client and server SDK runtime dependencies.

A frontend application normally installs:

```text
external frontend
  @weaver/core
  @weaver/web
```

A backend integration installs:

```text
external backend
  @weaver/core
  @weaver/mcp
```

Core is mandatory in both examples because Web and MCP declare it as a peer dependency.

## Local artifact workflow

In Weaver:

```sh
pnpm verify:packages
```

This builds the workspace, creates three ignored tarballs in `artifacts/`, inspects their files and packed manifests, repacks to check structural reproducibility, and installs copies into a temporary consumer outside the workspace. The consumer uses normal NodeNext package resolution without path mappings and runs strict declaration and Node ESM runtime-import checks.

Core also has a packaged Cloudflare Workers runtime gate:

```sh
pnpm verify:worker-core
```

It packs Core, installs the tarball in an isolated non-workspace consumer, and executes request-time catalog registration plus valid and invalid A2UI validation inside workerd. The fixture enables neither startup evaluation nor Node compatibility.

An external repository can then install the generated `.tgz` files by relative path. It must not copy Weaver source or use workspace/link dependencies.

## Release candidate gate

Run these visible checks:

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm conformance:v0.9.1
pnpm verify:packages
pnpm verify:worker-core
```

## Versioning and publishing

Core, Web, and MCP release together at one synchronized version. During `0.x`, version bumps remain deliberate manual updates across all three manifests; `WEAVER_CORE_VERSION` in `packages/core/src/index.ts` must be updated with each release version.

The release gates above remain the readiness checks for any release:

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm conformance:v0.9.1
pnpm verify:packages
pnpm verify:worker-core
```

No automatic publishing exists. Weaver manages no registry credentials. Changesets, semantic-release, and release-please are not being introduced; CI belongs to Task 57.

`@weaver/mcp` declares `engines.node >= 20` because its pinned MCP runtime dependencies (`@modelcontextprotocol/client`, `@modelcontextprotocol/server`) require it. Core and Web make no Node-version support declaration yet.

A Weaver project-license decision is still required before the intended public release/publishing process. Task 56 does not select that license.

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

Core, Web, and MCP release together at one synchronized version. During `0.x`, intentional API evolution may occur; consumers should not assume pre-1.0 API stability beyond the declared compatible release line. Version bumps are deliberate manual updates across all three manifests until release frequency justifies automation.

Task 48 stops at verified local tarballs. Registry selection and publishing are later work; no registry account or credentials are required.

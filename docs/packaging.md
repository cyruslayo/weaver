# Packaging Weaver

Weaver produces three independently consumable, ESM-only packages:

- `@cylayo/weaver-core`: protocol, runtime, catalog, state, and action foundation.
- `@cylayo/weaver-web`: browser renderer plus browser transport and policies.
- `@cylayo/weaver-mcp`: MCP A2UI bridge plus application capability helpers.

All intended APIs are reachable from each package's root export. Internal directories are not package subpath exports.

## Dependency direction

```text
@cylayo/weaver-web --peer--> @cylayo/weaver-core
@cylayo/weaver-mcp --peer--> @cylayo/weaver-core

@cylayo/weaver-core -X-> web
@cylayo/weaver-core -X-> mcp
@cylayo/weaver-web  -X-> mcp
```

Web and MCP accept and expose Core runtime/session types. They therefore use a strict `0.3.x` Core peer so an application supplies one compatible Core instance. MCP additionally installs its official client and server SDK runtime dependencies.

A frontend application normally installs:

```text
external frontend
  @cylayo/weaver-core
  @cylayo/weaver-web
```

A backend integration installs:

```text
external backend
  @cylayo/weaver-core
  @cylayo/weaver-mcp
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

### Windows

The repository's `.gitattributes` sets `* text=auto eol=lf`, so a clone has LF files even when `core.autocrlf` is `true`. You can also run `git config core.autocrlf false` before cloning. Packed files are LF either way, and `pnpm verify:packages` is expected to pass on a Windows checkout.

If you cloned before `.gitattributes` existed, your working tree may hold CRLF files. Save any work you need first, then reset the checkout to the committed LF files:

```sh
git rm -r --cached .
git reset --hard
```

`git reset --hard` discards uncommitted changes to tracked files. Untracked files, such as `artifacts/` and `node_modules/`, are kept.

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

Semver policy while Weaver is `0.x`:

- A MINOR bump (`0.3.0` to `0.4.0`) may contain breaking changes. Each one is called out in `CHANGELOG.md` with an upgrade note.
- A PATCH bump (`0.3.0` to `0.3.1`) is for bug fixes.
- The three packages always share one version. Web and MCP peer on Core with the range `0.N.x`, where `0.N` is the current minor, so a MINOR release also moves both peer ranges.
- `WEAVER_CORE_VERSION` is updated in every release.
- A deprecation is noted in the `CHANGELOG.md` entry of the release that introduces it, with its replacement when one exists.

This policy covers the `0.x` line only. It makes no promise about a future 1.0.

The release gates above remain the readiness checks for any release:

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm conformance:v0.9.1
pnpm verify:packages
pnpm verify:worker-core
```

After a release is on the npm registry, run the registry check by hand:

```sh
pnpm verify:registry 0.3.0
```

It installs `@cylayo/weaver-core`, `@cylayo/weaver-web` and `@cylayo/weaver-mcp` at that exact version into a temporary consumer outside the workspace. It then runs the TypeScript and ESM consumer checks, the documentation and Quick Start snippets, and the Worker smoke against the registry Core. The check only reads the registry. It is not a release gate and is not run by CI. Without a version it checks the one in `packages/core/package.json`.

No automatic publishing exists. Weaver manages no registry credentials. Changesets, semantic-release, and release-please are not being introduced. The existing Ubuntu CI Verify job runs every release gate, including `verify:worker-core`.

`@cylayo/weaver-mcp` declares `engines.node >= 20` because its pinned MCP runtime dependencies (`@modelcontextprotocol/client`, `@modelcontextprotocol/server`) require it. Core and Web make no Node-version support declaration yet.

Weaver is licensed under the Apache License 2.0 (SPDX: `Apache-2.0`). The canonical project license is in the repository root and is copied into each publishable package so packed artifacts carry it. `packages/core/THIRD_PARTY_LICENSES.txt` remains separate provenance and attribution for redistributed A2UI-derived material; it is not Weaver's project license.

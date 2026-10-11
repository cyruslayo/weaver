---
id: WVR-070
title: Package READMEs and npm keywords so the npm pages are not empty
epic: F Follow-ups
audit_ref: follow-up to WVR-081 (npm publish, npm pages)
priority: P2
status: done
depends_on: []
estimate: S
---

## Context

The npm pages of `@cylayo/weaver-core`, `@cylayo/weaver-web` and `@cylayo/weaver-mcp` at 0.3.0 say
"ERROR: No README data found!" and list no keywords. No package folder contained a `README.md`. The
README sits at the repository root, outside the packages, and `npm pack` does not include it. A new
user who finds a package on npm sees an empty page. npm cannot change a published version, so the new
READMEs reach npm only with the next published version. This issue does not bump any version.

## Scope

- One `README.md` in each of `packages/core`, `packages/web` and `packages/mcp`. Each has a description
  of what the package does and does not do, an install line (web and mcp include core, because core is
  a peer dependency on `0.3.x`), one complete ts example, a "Which package do I need?" table, the ESM-only
  note, the Apache-2.0 license link, and "Full documentation" links. Every link is absolute.
- A `keywords` array in each `package.json`. No other manifest field changes.
- `packageReadmeSnippets()` (end of `integration/package-consumer/doc-snippets.mjs`) extracts the ts block
  of each README. It throws unless each README has exactly one.
- `verify:packages` typechecks those examples against the packed packages, runs the core Worker and web
  browser examples (`integration/package-consumer/package-readme-check.mjs`, with happy-dom for web), checks
  that the packed `package/README.md` matches its source, and rejects relative links and links to repository
  files that do not exist.
- CHANGELOG `## [Unreleased]` entry, one line in `docs/packaging.md`, `docs/PLAN.md` Task 93, and the board row.

## Out of scope

- Any version bump, publish, or change to package source, dependencies, `files` or the lockfile.
- Changes to `scripts/verify-registry.mjs`. It does not need the new READMEs, and it still passes against 0.3.0.
- A browser run of the web example. It runs in happy-dom only, as the root Quick Start does.
- Relative-link checks for other Markdown files. `scripts/check-doc-links.mjs` already covers those.

## Files

- `packages/core/README.md`, `packages/web/README.md`, `packages/mcp/README.md` (new)
- `packages/core/package.json`, `packages/web/package.json`, `packages/mcp/package.json` (`keywords` only)
- `integration/package-consumer/doc-snippets.mjs` (`packageReadmeSnippets`, appended)
- `integration/package-consumer/package-readme-check.mjs` (new driver)
- `scripts/verify-packages.mjs` (snippet wiring, README checks)
- `CHANGELOG.md`, `docs/packaging.md`, `docs/PLAN.md`, `scratch/BOARD.md`, this issue file

## Acceptance criteria

- [x] Each of the three packages has a `README.md` with the sections in Scope, and each example is copied from or checked against the root Quick Start (core: Worker; web: browser; mcp: a new compile-checked example).
- [x] Each `package.json` has a `keywords` array of 6 to 8 lowercase terms. A diff against the base shows no other change.
- [x] Each README holds exactly one ts block, and `verify:packages` compiles it against the packed packages.
- [x] `verify:packages` runs the core Worker and web browser examples, and both pass.
- [x] Mutation checks: a broken example, a relative link and a link to a missing file each make `verify:packages` fail, and each failure names the snippet or link. Each file is restored (see Log).
- [x] The packed tarballs contain `package/README.md`, which matches its source and has no `\r`. Counts: core 440, web 127, mcp 11.
- [x] `pnpm check:docs` covers the three READMEs and passes, with no relative links in them.
- [x] Live docs state no tarball counts, so none needed an update. Old Log entries are not changed.
- [x] Test counts are the same before and after (727).

## Verification

```sh
pnpm install --frozen-lockfile
pnpm check:generated && pnpm check:docs && pnpm typecheck && pnpm test && pnpm build
pnpm verify:packages && pnpm verify:worker-core
pnpm verify:registry            # read-only check of the published 0.3.0; not a gate
ls artifacts/*.tgz && tar -tzf <each tarball> | grep README.md
```

## Definition of done

Merged to `main`. The READMEs appear on npm only with the next published version (not 0.3.0).

## Log

- 2026-10-11: **in-progress, then done.** Branch `wvr-070-package-readmes` from `930fb58` (Merge pull request #38). `pnpm install --frozen-lockfile` succeeded and left `pnpm-lock.yaml` unchanged (pnpm 10.15.0).
  - **Facts.** The npm pages showed "ERROR: No README data found!" because no `packages/*/README.md` existed. The root README sits outside the packages, so `npm pack` skipped it. Each package's `files` list omits README, but npm always packs it from the package folder. The packed tarball confirmed this.
  - **Examples.** Core uses the root Quick Start Worker example, unchanged. Web uses the root Quick Start browser example, unchanged. Both are run by `package-readme-check.mjs`: core through `fetch` under Node, and web under happy-dom with an `#app` element. The mcp example is new. It loads a resource through a connected client, and a README-sized example cannot run without a server. It is typechecked against the packed packages only. The mcp example was typechecked, not executed.
  - **Commit 1 `7df7630`:** the three READMEs and the three `keywords` arrays (core 7, web 8, mcp 6 terms).
  - **Commit 2 `91bd910`:** `packageReadmeSnippets()`, `package-readme-check.mjs`, and the `scripts/verify-packages.mjs` wiring (the README packed-copy check and the link check).
  - **Gate on the final tree** (all exit 0): `check:generated`, `check:docs` (167 relative links in 70 Markdown files, 0 broken; base had 67 tracked Markdown files, and the three READMEs add 0 checked links because their links are absolute, confirmed with `node scripts/check-doc-links.mjs packages/*/README.md`, which prints "Checked 0 relative links in 3 Markdown files"), `typecheck`, `test`, `build`, `verify:packages`, `verify:worker-core`.
  - **Test counts, before and after: 727 both.** Base per package: core 442, examples/shared 11, mcp 10, web 139, cookbook 99, playground 15, reference-app 8, doc-snippets 3. After: unchanged for each package. WVR-081 recorded 437 core tests, which is older. The base is 442 now.
  - **Tarballs.** `package/README.md` is present in all three. Entry counts are core 440 (439 + README), web 127 (126 + README) and mcp 11 (10 + README). Byte count with and without `\r` is equal for all three READMEs. `verify:packages` also checks that each packed README matches its source. The core tarball contains no fixtures.
  - **Mutation checks (`pnpm verify:packages` output, then restored, `git diff` clean).**
    1. Web example `createBasicWebRuntime()` changed to `createBasicWebRuntimes()`: exit 1, `doc-snippets/pkg-web-readme-0.ts(3,17): error TS2552: Cannot find name 'createBasicWebRuntimes'. Did you mean 'createBasicWebRuntime'?`, under the "Documentation snippets failed to compile" header, which now names the pkg snippets.
    2. Core README license link changed to the relative `[LICENSE](LICENSE)`: exit 1, `Error: packages/core/README.md: relative link LICENSE`.
    3. Core README license link changed to `https://github.com/cyruslayo/weaver/blob/main/docs/no-such-file.md#anchor`: exit 1, `Error: packages/core/README.md: link to missing file https://github.com/cyruslayo/weaver/blob/main/docs/no-such-file.md#anchor`. The `#anchor` is stripped before the file check.
    4. Extra mutation: core Worker output changed from `Hello, ${name}` to `Hi, ${name}`. The typecheck passed, and the driver failed: `Package README example FAILED: pkg-core-readme-0.ts: status 200, body {...,"text":"Hi, Ada",...}`. Exit 1.
  - **Live docs.** `grep` for the old counts (439, 126, 10, 168.7 kB) found them only in old Log entries (WVR-060, WVR-081), which are left unchanged. No live doc states tarball counts. `docs/packaging.md` had none, so there was nothing to update. Added the one-line `verify:packages` note in "Versioning and publishing".
  - **Registry.** `pnpm verify:registry` (read-only, against the published 0.3.0) exits 0. It needs no new README.
  - **Status.** `done` is set as the brief directs. The Definition of done also says "Merged to `main`", and this branch is not pushed and has no PR. The orchestrator must merge the branch, or set the status back to `in-review` until it is merged.

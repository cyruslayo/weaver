---
id: WVR-081
title: Publish @cylayo/weaver-* to npm (stable preview)
epic: Gated
audit_ref: WVR-06, Slice 5
priority: P1
status: in-review
depends_on: [WVR-060]
estimate: M
---

## Gate
Start after 0.3.0 and an explicit API review. The maintainer must decide to
publish and own the registry credentials. `docs/packaging.md` states that no
automatic publishing exists. Keep publishing manual unless the maintainer
decides otherwise.

## Scope (when ungated)
- Add `CHANGELOG.md` and a semver policy note.
- Run a dry-run publish (`pnpm publish --dry-run`) for all three packages
  and confirm the file lists.
- After publishing, run a clean consumer from the registry: TypeScript, ESM,
  and the Worker smoke, reusing `integration/package-consumer` with registry
  specifiers.
- Rewrite the README "install" section as a concise Quick Start. It should
  include one browser example, one Worker example, and one deterministic
  non-LLM example.

## Acceptance criteria
- [x] Installing from the registry passes the same smoke tests as the
      tarballs.
- [x] The Quick Start works verbatim.

## Log
- 2026-10-11: **ungated; ready.** WVR-060 is `done` (0.3.0 merged and tagged, see its Log). The Gate is met: 0.3.0 is released, the API review is done under WVR-060, and the maintainer decided to publish and owns the registry credentials. Status moved from `gated` to `ready` per the promotion rule in `scratch/README.md`. It is not `done`, and its acceptance boxes stay unticked, because the evidence below is partial.
  - **Done.** `@cylayo/weaver-core@0.3.0`, `@cylayo/weaver-web@0.3.0` and `@cylayo/weaver-mcp@0.3.0` are published to npm on 2026-10-11 (UTC), core first, then web, then mcp. Each was published with `pnpm --filter <pkg> publish --access public --no-git-checks` from a checkout of `v0.3.0`.
  - **Done.** Dry-run file lists (from WVR-060): core 439 files / 168.7 kB, web 126 files / 52.4 kB, mcp 10 files / 11.8 kB.
  - **Done.** `CHANGELOG.md` exists (added under WVR-060).
  - **Done, ad hoc only.** An install smoke against the registry: all three `@0.3.0` installed into an empty directory. Versions are correct. Core has 0 `fixtures.*` files and no CRLF. `WEAVER_CORE_VERSION` is "0.3.0". `generateA2UIV091Prompt()` and `createWeaverRuntime({ observer })` work. The registry took a few minutes to show web and mcp, and a stale npm cache needed `--prefer-online`. This is not the full acceptance check (see below).
  - **Remaining, to tick the acceptance boxes:**
    1. A semver policy note, for example in `docs/packaging.md` (its "Versioning and publishing" section).
    2. A registry-specifier run of `integration/package-consumer` (TypeScript, ESM), using registry specifiers instead of tarballs, and the Worker smoke against the registry install. The ad-hoc smoke above does not cover this.
    3. The README install section rewritten as a Quick Start, with one browser example, one Worker example and one deterministic non-LLM example, each verified verbatim.
    4. Only then tick "Installing from the registry passes the same smoke tests as the tarballs" and "The Quick Start works verbatim".
- 2026-10-11: **in-review.** Branch `wvr-081-quickstart`, from `83cbe81` (Merge pull request #34). Three commits: A `a6bb629` semver policy, C `eb9e8a3` README Quick Start and its verification, and B (the commit that holds this entry) `verify:registry`. Not pushed, no PR. `scratch/BOARD.md` is not changed; the orchestrator updates it. Both acceptance boxes are ticked because the evidence below covers them. The boxes depend on `verify:registry` passing for 0.3.0, which it does.
  - **A. Semver policy.** `docs/packaging.md`, "Versioning and publishing" only. Covers MINOR may break during `0.x` (called out in CHANGELOG.md), PATCH is for fixes, one synchronized version, Web/MCP peer `0.N.x`, `WEAVER_CORE_VERSION` updated per release, deprecations noted in CHANGELOG.md, and no 1.0 promise. Also a pointer to `pnpm verify:registry`. The "Local artifact workflow" section is untouched.
  - **C. Quick Start.** README "Current consumption / install workflow" is replaced by `## Quick Start`: `npm install @cylayo/weaver-core @cylayo/weaver-web` (`-mcp` for a backend), then three full ts examples: Browser (`createBasicWebRuntime` + `mount` into `#app`), Worker (Core only, `export default { fetch }`), and Deterministic (a fixed A2UI v0.9.1 JSONL response through `createA2UIV091StreamIngestion`, no model). Each links to the detailed README section. The stale "not currently published" text is gone; the maturity section gained a Distribution bullet; `docs/PLAN.md` Task 91 no longer says "pending publish". The local-tarball JSON `file:` example was dropped: `docs/packaging.md` "Local artifact workflow" already says external repos install the `.tgz` files by relative path, and that section is not mine to edit. The README keeps a one-line pointer to it.
    - `quickstartSnippets()` (new export at the end of `integration/package-consumer/doc-snippets.mjs`) extracts the ts blocks between `## Quick Start` and the next `## ` heading and throws unless there are exactly three.
    - `integration/package-consumer/quickstart-check.mjs` (new) runs them: the browser example under happy-dom with an `#app` element and a check that the text rendered; the Worker example through `fetch` with `?name=Ada`; the deterministic example, which checks itself.
    - `scripts/verify-packages.mjs` (smallest edit): imports the extractor, writes the three snippets into `doc-snippets/` before the existing `tsc -p tsconfig.doc-snippets.json` typecheck, copies the driver, and runs it after the existing snippet loop.
  - **B. Registry check.** `scripts/verify-registry.mjs` (new) and `pnpm verify:registry [version]` (default: `packages/core/package.json`, so 0.3.0 today). It runs `npm install --prefer-online --no-audit --no-fund` in a temp consumer for the three packages at the exact version, retried 4 times with 20 s between attempts. It then checks installed versions, one Core instance, and the MCP runtime deps. Then it runs the copied `consumer.ts` typecheck, `smoke.mjs`, the docs and Quick Start snippets, and the driver. For the Worker it installs `@cylayo/weaver-core` from the registry into a second temp folder with the `workerd-consumer` devDependencies and runs `worker.test.js` plus the README Worker example in workerd. `verify:worker-core` is not changed. It is not in `verify:packages` or `.github/workflows`, and it writes nothing to the registry.
  - **Full `pnpm verify:registry` for 0.3.0 (pass):**
    ```
    Verifying @cylayo/weaver-core, @cylayo/weaver-web, @cylayo/weaver-mcp at 0.3.0 from the npm registry
    Consumer: npm install from the registry succeeded (attempt 1 of 4)
    > typecheck  (tsc -p tsconfig.json: no output)
    > smoke
    tarball runtime imports and packed DateTimeInput resolver proof: core, web, mcp OK
    packed 0.3.0 exports: prompt generation, observer trace record and replay, error descriptions OK
    Quick Start ok: quickstart-browser.ts
    Quick Start ok: quickstart-worker.ts
    {"ready":true,"root":{"sourceComponentId":"root","component":"Text","scopePath":"/","properties":{"text":"Hello from a canned response"},"relationships":[],"unresolved":[]},"instanceIssues":[],"issues":[]}
    Quick Start ok: quickstart-deterministic.ts
    Ran 11 documentation snippets and 3 Quick Start examples against the registry installs
    Worker consumer: npm install from the registry succeeded (attempt 1 of 4)
    > test > vitest run
     ✓ worker.test.js (2 tests) 44ms
     ✓ quickstart.test.js (1 test) 172ms
     Test Files  2 passed (2)
      Tests  3 passed (3)
    Verified @cylayo/weaver-core, @cylayo/weaver-web, @cylayo/weaver-mcp at 0.3.0 from the npm registry. Consumer: /tmp/weaver-registry-verification-oMhCCQ/consumer. Worker: /tmp/weaver-registry-verification-oMhCCQ/worker
    ```
    Exit 0. The consumer lockfile resolves all three packages from `https://registry.npmjs.org/` (28 registry entries, no `file:`). The Worker folder resolves `@cylayo/weaver-core` the same way. The "tarball" wording in the smoke line is the existing `smoke.mjs` text, which this change does not touch.
  - **Failing version (`pnpm verify:registry 0.0.1`).** Exit 1. npm returned ETARGET "No matching version found for @cylayo/weaver-core@0.0.1" on each of the 4 attempts (3 retries, 20 s apart). The script printed: `Version 0.0.1 is not on the npm registry for @cylayo/weaver-core, @cylayo/weaver-web, @cylayo/weaver-mcp (npm reported "No matching version" after 4 attempts). Check the version, or wait for the publish to appear.` No later step ran.
  - **Mutation checks (verification proven to fail).** (1) Changed the README Worker block `return Response.json(resolved.value.tree);` to `...treeMissing`. `pnpm verify:packages` exited 1 with `doc-snippets/quickstart-worker.ts(30,41): error TS2339: Property 'treeMissing' does not exist...`, and the header names the three quickstart files. (2) Changed the deterministic block's text to "Changed text". `pnpm verify:packages` exited 1 with `Quick Start FAILED: quickstart-deterministic.ts: canned text was not rendered`, and the other two passed. Both times `README.md` was restored from a saved copy and checked identical (`cmp`).
  - **Gate before commit** (on the final tree; the B-only changes were run after the test step too):
    - `pnpm check:generated`: up to date, exit 0.
    - `pnpm check:docs`: 166 links in 66 Markdown files, 0 broken (was 161 before the README rewrite; the new links are the Quick Start anchors and `docs/packaging.md#local-artifact-workflow`).
    - `pnpm typecheck`: exit 0.
    - `pnpm test`: 437 + 11 + 10 + 139 + 99 + 15 + 8 = **719 tests, 0 failing**, before and after (no test files added).
    - `pnpm build`: exit 0. `pnpm verify:packages`: exit 0, 11 doc snippets plus the 3 Quick Start examples against the packed tarballs. `pnpm verify:worker-core`: exit 0, 2 tests. `pnpm conformance:v0.9.1`: exit 0 (437 and 139, all passing).
  - **Typechecked and executed.** Typechecked with the consumer's strict NodeNext settings and DOM lib: all three Quick Start examples, in both the tarball and registry consumers. Executed: the browser example under happy-dom (text confirmed in `#app`), the Worker example through `fetch` in Node and in workerd (registry Core), the deterministic example in Node. The browser example was not run in a real browser.
  - **Caveats, not blocking.** (a) `verify:registry` resolves the Worker's transitive dependencies fresh with npm, so it does not reuse the pnpm lock in `integration/workerd-consumer`. The two Worker devDependencies are pinned exact as there. (b) The snippets come from this checkout's `README.md` and `docs/`, so the registry check covers the published Core, not the published README. (c) `consumer.ts`, `smoke.mjs` and `WEAVER_CORE_VERSION` checks hard-code 0.3.0, as `verify:packages` does. A later release needs those updated. (d) Commit B's trailer names Claude Haiku 5.5, not the Sonnet 5.5 line in the brief, because the session's attribution rule names Haiku.

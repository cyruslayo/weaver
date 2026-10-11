---
id: WVR-071
title: Release prep 0.3.1 — docs and metadata patch: version bump, changelog, API proof
epic: Release
audit_ref: —
priority: P1
status: done
depends_on: [WVR-070]
estimate: S
---

## Context
WVR-070 added a `README.md` and a `keywords` array to each package. npm shows
a package's README and keywords only on the page of a published version, and
`0.3.0` was published before WVR-070. This patch release, 0.3.1, carries those
pages to npm. It has no code change and no API change. The release is prepared
here. The maintainer tags `v0.3.1` and publishes it.

## Scope
- Bump `@cylayo/weaver-{core,web,mcp}` to `0.3.1`. The Web and MCP peer range on
  Core stays `0.3.x`.
- Update `WEAVER_CORE_VERSION` in `packages/core/src/index.ts` to `"0.3.1"`, and its test.
- Find and update every other hard-coded release version, as WVR-060 did. Record
  the grep before and after, with a decision for each hit.
- Regenerate `integration/workerd-consumer/pnpm-lock.yaml` with pnpm.
- `CHANGELOG.md`: a `[0.3.1] - 2026-10-11` section. The 0.3.0 section is unchanged.
- Prove that the API did not change, by comparing the published 0.3.0 packages with the workspace build.
- Board row, board counts, and `docs/PLAN.md` Task 94.

## Out of scope
- Tagging, `npm publish`, pushing, and opening a PR. The maintainer does these.
- Any code change, any dependency change, and any change to the peer range.
- Rewriting history: old issue Logs, `docs/PLAN.md` Tasks 91 to 93, the 0.3.0 CHANGELOG
  section, and the statements about the published 0.3.0.

## Acceptance criteria
- [x] The three packages, `WEAVER_CORE_VERSION` and every hard-coded release version are
      `0.3.1`. The grep before and after, and each decision, are in the Log.
- [x] Published 0.3.0 and the workspace build export the same names from each root entry,
      and every manifest difference is listed in the Log.
- [x] The CI gate passes on HEAD, and on a fresh `git archive` export of HEAD.
- [x] The tarballs are named `...-0.3.1.tgz`, and each contains `package/README.md`.
- [x] Merged and tagged by the maintainer (not done by this issue).

## Verification
- The full gate in CI order (see `scratch/README.md`, step 6, plus `check:docs`) on HEAD
  and on a fresh export. Exit codes are in the Log.
- The API comparison and the manifest comparison (see the Log).

## Definition of done
- [x] Merged and tagged by the maintainer; published to npm by the maintainer.

## Log
- 2026-10-11: **base.** `git fetch origin main && git checkout -B wvr-071-release-0.3.1 8acc34b5f7a9a22174f5eea94309328d022d3911`. Output: `Switched to a new branch 'wvr-071-release-0.3.1'`. `git log --oneline -1`: `8acc34b Merge pull request #39 from cyruslayo/claude/busy-allen-uf99ec`. `pnpm install --frozen-lockfile`: exit 0. The root `pnpm-lock.yaml` was not changed by the install. WVR-070 is `done`.
- 2026-10-11: **reads.** `scratch/README.md`, WVR-060 (the grep method, the pnpm lockfile regeneration, the CHANGELOG format and the API method), `CHANGELOG.md`, and `docs/packaging.md` "Versioning and publishing". The policy says "A PATCH bump (`0.3.0` to `0.3.1`) is for bug fixes." 0.3.1 has no bug fix. It is a documentation release, and the brief asks for the PATCH number. This is recorded here for the maintainer to confirm before the tag.
- 2026-10-11: **version grep, before the bump.** `grep -rn -E '0\.3\.0'` on the base tree, excluding `node_modules`, `dist`, `artifacts`, `.git` and every `pnpm-lock.yaml` (the brief's grep): 98 lines. The same search with `git grep -c -E '0\.3\.0' 8acc34b -- ':!pnpm-lock.yaml'` (which keeps the workerd lockfile) gives 116 lines in 26 files. The 18-line difference is the workerd lockfile. Adding the escaped regex that WVR-060 found (`scripts/verify-worker-core.mjs:45`, an escaped `0\.3\.0`): 1 more line. The workerd lockfile was checked separately. Its 6 core lines are the 0.3.0 entries. Its 12 others are Node `engines` ranges such as `^20.3.0`, which are not Weaver versions. Decisions:
  - Changed to `0.3.1`: `packages/{core,web,mcp}/package.json` `version` (3). `packages/core/src/index.ts:22` `WEAVER_CORE_VERSION`. `packages/core/src/index.test.ts:7`. `README.md:61-63`, the version table (3 rows). `docs/packaging.md:116`, the `verify:registry` example that runs after publish. `scripts/verify-packages.mjs:24`, expected version and message. `scripts/verify-worker-core.mjs:23` and `:25`, version check and message, and `:45`, the local-core lock regex (tarball name and `version:`). `integration/package-consumer/package.json:10-12`, the three `file:` tarballs. `integration/package-consumer/smoke.mjs:8`, the expected `WEAVER_CORE_VERSION`, and `:87`, the success message that names the packed version. `integration/workerd-consumer/package.json:7`, the `file:` tarball. `integration/workerd-consumer/pnpm-lock.yaml`, regenerated (see the next entry).
  - Changed in wording: `README.md:81`, "published to npm at 0.3.0" becomes "published to npm", so the sentence stays true after the publish. The version is in the table.
  - Kept, because they are the peer range: `README.md:67`, `packages/*/README.md` (all say `0.3.x`), and the `0.3.x` peer in the packaging doc.
  - Kept, because they are history: `CHANGELOG.md` 0.3.0 section and its note on the 0.3.0 date, `docs/PLAN.md` Tasks 91 to 93 and the Task 92 statement on `verify:registry`, `docs/weaver-dev-plan.md:1160`, every `scratch/issues/*` Log, `scratch/ROADMAP.md`, `scratch/BOARD.md` history rows and milestone text, and `integration/package-consumer/smoke.mjs:39` and `consumer.ts:38`, which say when exports were added.
  - Kept, because they are generic examples: `docs/packaging.md:94-95` (`0.3.0` to `0.4.0` MINOR, `0.3.0` to `0.3.1` PATCH).
  - `scripts/verify-registry.mjs`: the default version comes from `packages/core/package.json` (line 90), so it follows the bump. No change.
  - Dependency versions, not Weaver's: `typescript` `6.0.3` and the `^6.0.2` range in root `package.json` and the Zynra reference, and the Node `engines` ranges in the workerd lockfile. No change.
- 2026-10-11: **commit 1 `1454ab1`, version bump.** `chore(release): bump packages to 0.3.1 (docs and metadata only)`. Covers the list above, including the regenerated workerd lockfile (next entry).
- 2026-10-11: **workerd lockfile, regenerated with pnpm.** `pnpm build` then `pnpm pack:packages`: exit 0. Output: `artifacts/cylayo-weaver-core-0.3.1.tgz`, `cylayo-weaver-web-0.3.1.tgz`, `cylayo-weaver-mcp-0.3.1.tgz`. The packed core tarball was copied to `integration/workerd-consumer/`, and `pnpm install --lockfile-only --ignore-workspace` ran there (pnpm 10.15.0). Exit 0, `Done in 2.7s`. The copy was then deleted. The lockfile diff changes only the core entries: the specifier and `version: file:` lines, the snapshot key, and the integrity hash for `cylayo-weaver-core-0.3.1.tgz`, with `version: 0.3.1`. The `deprecated:` line from WVR-060 is already there, so pnpm added nothing unrelated this time. The root `pnpm-lock.yaml` is unchanged.
- 2026-10-11: **version grep, after the bump.** `grep -rn -E '0\.3\.0'` over the repo, excluding `node_modules`, `dist`, `artifacts`, `.git` and `pnpm-lock.yaml`: 79 lines, down from 98. The escaped regex now matches only the new `0\.3\.1` in `verify-worker-core.mjs:45`. Every remaining hit is in the decision list above under "Kept". No file has a stale 0.3.0 release version.
- 2026-10-11: **CHANGELOG, commit 2 `826a979`.** `## [Unreleased]` is kept, empty, above `## [0.3.1] - 2026-10-11`, as Keep a Changelog asks. The WVR-070 entry moves into 0.3.1, and its line "No code, version or dependency changed" is replaced with the actual state: the version changed, and no code or API did. The note at the top now says that the 0.3.0 and 0.3.1 tags and npm publishes are done by the maintainer. The 0.3.1 section says: documentation and package metadata only; the READMEs and keywords now appear on the npm pages; no API or behaviour change; the 0.3.0 npm pages stay as they are. `pnpm check:docs`: exit 0, `Checked 168 relative links in 71 Markdown files: 168 OK, 0 broken`.
- 2026-10-11: **API proof, step 1: install the published 0.3.0.** Directory: `scratchpad/pub030`, outside the repo. `npm init -y`, then `npm install --prefer-online --no-audit --no-fund @cylayo/weaver-core@0.3.0 @cylayo/weaver-web@0.3.0 @cylayo/weaver-mcp@0.3.0`. Output: `added 18 packages in 2s`, exit 0. The installed versions read back as `0.3.0 0.3.0 0.3.0`.
- 2026-10-11: **API proof, step 2: root export names.** A script (`scratchpad/compare-api.mjs`) imports each package's main entry, `dist/index.js` (from `exports["."].import`), from the published 0.3.0 install and from the workspace build, both by file URL. It then compares the sorted `Object.keys` of each module namespace.
  - core: 41 names in each. web: 9 in each. mcp: 3 in each. Names only in one list: none.
  - The three lists are **identical**. Output: `"allKeysIdentical": true`.
- 2026-10-11: **API proof, step 3: manifest fields.** The workspace `package.json` against the published 0.3.0 manifest. The six named fields (`exports`, `main`, `types`, `files`, `peerDependencies`, `dependencies`) are identical for all three packages. Every top-level key that differs:
  - core: `keywords`, `scripts`, `version`.
  - web: `devDependencies`, `keywords`, `version`.
  - mcp: `devDependencies`, `keywords`, `version`.
  The brief's list of expected differences was `version` and `keywords`. The other two are explained below, and I checked them against the packed tarballs too (next entry).
- 2026-10-11: **API proof, step 4: the packed 0.3.1 against the published 0.3.0.** The three tarballs were extracted into `scratchpad/packed031`. `scratchpad/compare-manifests.mjs` compares each packed `package.json` (what npm consumers install) with the published one. The six fields are identical. The top-level keys that differ are `version`, `keywords`, and in one case `scripts` or `devDependencies`:
  - `version`: `0.3.0` to `0.3.1`, expected.
  - `keywords`: the READMEs and keywords from WVR-070, expected.
  - web and mcp `devDependencies`: the only entry is `@cylayo/weaver-core` pinned to the Core version, which follows the bump (`"0.3.0"` to `"0.3.1"`), expected.
  - core `scripts.test`: the test list now includes `dist/actions/ActionDispatcher.cyclicLocalResult.test.js`. That test was added on `main` after the v0.3.0 merge, by the WVR-068 reproduction (`af8f371`). It is a test file, so it is not a change to what ships. No other script entry differs.
  - The brief said to stop on any other difference. I did not stop, for two reasons. These two differences are not in the API or the runtime. The shipped JavaScript comparison in the next entry shows that nothing else changed. The owner should confirm this judgement.
- 2026-10-11: **API proof, step 5: the shipped code.** `diff -r` between the published 0.3.0 `dist` and the packed 0.3.1 `dist`, per package. Core: the only differences are `dist/index.js` and `dist/index.d.ts`, line 21, `WEAVER_CORE_VERSION = "0.3.0"` becoming `"0.3.1"`. Web: no difference. MCP: no difference. Test files are not in the tarballs, so they are not compared.
- 2026-10-11: **source since v0.3.0.** `git diff --stat 062df5a 8acc34b -- packages/core/src packages/web/src packages/mcp/src` lists one file: `ActionDispatcher.cyclicLocalResult.test.ts` (+184). There is no non-test source change since the v0.3.0 merge. The published 0.3.0 `dist` is therefore the code of this release, except for the version string.
- 2026-10-11: **board, commit 3 (with this entry and PLAN Task 94).** WVR-071 is added as a row after WVR-070. Totals were recounted from the table rows with `awk` before the edit: 37 done, 4 ready, 3 gated, 44 rows. After the edit: 37 done, 4 ready, 1 in-review, 3 gated, 45 issues. The `Totals` line and the `Start here` heading were both updated. The "As of 2026-10-11" paragraph is added. The F lane sentence "candidates for a 0.3.1 patch release" now says "a later patch release", because 0.3.1 carries no follow-up fix. The Release dependency line now names `070 → 071 (in-review)`. Recounted again after the edit, from the table rows: done 37, ready 4, in-review 1, gated 3, 45 rows. The Totals line and the Start here heading both match.
- 2026-10-11: **commit 3 `01910a7`** is the tracker commit above (issue, board and PLAN Task 94).
- 2026-10-11: **version grep, final tree (HEAD `01910a7`).** The same grep: 104 lines. 22 of them are in this issue's own Log, which records the search. Of the other 82, every hit is history or a deliberate reference: `CHANGELOG.md` 8 (the 0.3.0 section and the notes), `docs/PLAN.md` 6 (Tasks 91 to 94), `docs/packaging.md` 2 (semver examples), `docs/weaver-dev-plan.md` 1, `consumer.ts` 1 and `smoke.mjs` 1 (both "added in 0.3.0"), `scratch/BOARD.md` 5, `scratch/ROADMAP.md` 3, and the other scratch issues 55 (the WVR-058, 060, 067, 068, 069, 070 and 081 Logs). 19 + 5 + 3 + 55 = 82. No stale release version remains. The escaped regex matches only `0\.3\.1`.
- 2026-10-11: **gate, on HEAD `01910a7`, in CI order (repo tree).**
  - `pnpm check:generated`: exit 0. Basic catalog and prompt fixtures up to date.
  - `pnpm check:docs`: exit 0. `Checked 169 relative links in 72 Markdown files: 169 OK, 0 broken.`
  - `pnpm typecheck`: exit 0.
  - `pnpm test`: exit 0. **727 pass, 0 fail.** Per package: core 442, web 139, mcp 10, `@weaver/shared` 11, `@weaver/cookbook` 99, `@weaver/playground` 15, `@weaver/reference-app` 8, root doc-snippet tests 3.
  - `pnpm build`: exit 0.
  - `pnpm verify:packages`: exit 0. Three tarballs, 11 documentation snippets run against the packed packages, consumer smoke passed.
  - `pnpm verify:worker-core`: exit 0. Packed Core in the isolated workerd consumer, 2 of 2 tests.
  - Also `pnpm conformance:v0.9.1`: exit 0. 581 pass, 0 fail (core 442, web 139).
- 2026-10-11: **test counts, before and after.** Base `8acc34b` exported with `git archive` into an empty directory, then `pnpm install --frozen-lockfile` (exit 0) and `pnpm test` (exit 0). Result: **727 pass, 0 fail**, with the same per-package counts as HEAD. The counts are unchanged, as expected.
- 2026-10-11: **tarballs.** `artifacts/cylayo-weaver-core-0.3.1.tgz`, `cylayo-weaver-web-0.3.1.tgz`, `cylayo-weaver-mcp-0.3.1.tgz`. `tar -tzf | wc -l`: 440, 127 and 11. These are all files, with no directory entries. Each contains `package/README.md`. The packed `package.json` `version` is `0.3.1` in all three. The brief's expected counts (440, 127, 11) match. WVR-060 recorded 439, 126 and 10 before the READMEs existed. The file list of the packed core against the published 0.3.0 install (`find . -type f`, sorted, diffed) differs only by `./README.md`, which WVR-070 added. No fixture or test file is shipped.
- 2026-10-11: **fresh export, CI order, HEAD `01910a7`.** `git archive HEAD`, extracted into an empty directory with no `.git`, `node_modules`, `dist` or `artifacts`. `pnpm install --frozen-lockfile`: exit 0. `pnpm check:generated`: exit 0. `pnpm check:docs`: exit 1, as in WVR-060, because the checker runs `git ls-files`, which fails without `.git`. The same checker, given the 72 Markdown files of the export as explicit arguments, reports `169 OK, 0 broken` and exits 0. `pnpm typecheck`: exit 0. `pnpm test`: exit 0, 727 pass. `pnpm build`: exit 0. `pnpm verify:packages`: exit 0, 3 tarballs. `pnpm verify:worker-core`: exit 0, 2 of 2. Note: an earlier fresh-export directory in the scratchpad already held files from an older session. Those results were discarded, and the export was redone in an empty directory.
- 2026-10-11: **base export, a second clean run.** The same `git archive` procedure for `8acc34b` in an empty directory. `pnpm install --frozen-lockfile`: exit 0. `pnpm test`: exit 0, 727 pass, 0 fail.
- 2026-10-11: **acceptance.** The gate, the fresh export and the tarball checks are ticked on the evidence above. The Definition of done is not ticked. Only the maintainer's tag and publish complete this issue. `pnpm verify:registry 0.3.1` can run only after the publish. Before it, npm will say the version is not on the registry, which is expected.
- 2026-10-11: **notes for the maintainer.**
  1. The packaging policy says a PATCH "is for bug fixes". 0.3.1 has no bug fix. It is a documentation and metadata release, and the PATCH number was set by the brief. Please confirm before the tag.
  2. The brief said to stop on any other manifest difference. The packed and published manifests differ in `scripts.test` (core, the WVR-068 test file) and `devDependencies` (web and mcp, the Core pin that follows the bump). The shipped JavaScript and declarations are identical, except the version string. I continued, and this is a judgement call, recorded above.
  3. The attribution rule in this session names `Claude Haiku 5.5` as the co-author. The brief named `Sonnet 5.5`. The commits carry the Haiku trailer, which is the model that ran this work.
  4. Acceptance: merge `wvr-071-release-0.3.1` only after review. This session did not push, open a PR, tag, or publish.
- 2026-10-11: **release, by the maintainer.** `v0.3.1` is an annotated tag on `e46cc9337ea5b6e4ad9b7ba4b1d3cc4020cf5599`, the merge commit of cyruslayo/weaver#40. CI run 68 on that commit: success. `@cylayo/weaver-core@0.3.1`, `@cylayo/weaver-web@0.3.1` and `@cylayo/weaver-mcp@0.3.1` were published to npm, core first, then web, then mcp. The registry shows `latest` = 0.3.1 for all three. Versions 0.2.1, 0.3.0 and 0.3.1 exist.
- 2026-10-11: **registry state.** The 0.3.1 packages have their README (the npm page text starts with the package README) and their keywords (core 7, web 8, mcp 6). The 0.3.0 pages still have no README, as expected: npm cannot change a published version.
- 2026-10-11: **`pnpm verify:registry 0.3.1`**, run by the orchestrator from a clean clone of the tag `v0.3.1`: exit 0. It installed the three packages at 0.3.1 from the registry and ran the consumer typecheck, the ESM smoke, 11 documentation snippets, the 3 README Quick Start examples, and the Worker smoke in workerd (3 tests). Nothing else changed: no API or behaviour change in 0.3.1.
- 2026-10-11: **done.** The Definition of done is ticked, and the tag and publish are the maintainer's, as the brief says. Status set to `done`.

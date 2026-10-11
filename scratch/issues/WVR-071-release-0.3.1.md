---
id: WVR-071
title: Release prep 0.3.1 — docs and metadata patch: version bump, changelog, API proof
epic: Release
audit_ref: —
priority: P1
status: in-review
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
- [ ] The CI gate passes on HEAD, and on a fresh `git archive` export of HEAD.
- [ ] The tarballs are named `...-0.3.1.tgz`, and each contains `package/README.md`.
- [ ] Merged and tagged by the maintainer (not done by this issue).

## Verification
- The full gate in CI order (see `scratch/README.md`, step 6, plus `check:docs`) on HEAD
  and on a fresh export. Exit codes are in the Log.
- The API comparison and the manifest comparison (see the Log).

## Definition of done
Merged and tagged by the maintainer; published to npm by the maintainer.

## Log
- 2026-10-11: **base.** `git fetch origin main && git checkout -B wvr-071-release-0.3.1 8acc34b5f7a9a22174f5eea94309328d022d3911`. Output: `Switched to a new branch 'wvr-071-release-0.3.1'`. `git log --oneline -1`: `8acc34b Merge pull request #39 from cyruslayo/claude/busy-allen-uf99ec`. `pnpm install --frozen-lockfile`: exit 0. The root `pnpm-lock.yaml` was not changed by the install. WVR-070 is `done`.
- 2026-10-11: **reads.** `scratch/README.md`, WVR-060 (the grep method, the pnpm lockfile regeneration, the CHANGELOG format and the API method), `CHANGELOG.md`, and `docs/packaging.md` "Versioning and publishing". The policy says "A PATCH bump (`0.3.0` to `0.3.1`) is for bug fixes." 0.3.1 has no bug fix. It is a documentation release, and the brief asks for the PATCH number. This is recorded here for the maintainer to confirm before the tag.
- 2026-10-11: **version grep, before the bump.** `git grep -c -E '0\.3\.0' 8acc34b -- ':!pnpm-lock.yaml'`: 98 lines in 26 files. Adding the escaped regex that WVR-060 found (`scripts/verify-worker-core.mjs:45`, `grep -E '0\\.3|3\\.0'`): 1 more line. The workerd lockfile (18 lines, excluded by the brief's grep) was checked separately. Its 6 core lines are the 0.3.0 entries. Its 12 others are Node `engines` ranges such as `^20.3.0`, which are not Weaver versions. Decisions:
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
- 2026-10-11: **board, commit 3 (with this entry and PLAN Task 94).** WVR-071 is added as a row after WVR-070. Totals were recounted from the table rows with `awk` before the edit: 37 done, 4 ready, 3 gated, 44 rows. After the edit: 37 done, 4 ready, 1 in-review, 3 gated, 45 issues. The `Totals` line and the `Start here` heading were both updated. The "As of 2026-10-11" paragraph is added. The F lane sentence "candidates for a 0.3.1 patch release" now says "a later patch release", because 0.3.1 carries no follow-up fix. The Release dependency line now names `070 → 071 (in-review)`.

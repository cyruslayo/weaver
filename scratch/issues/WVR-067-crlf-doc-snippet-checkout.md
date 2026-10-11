---
id: WVR-067
title: Doc-snippet checker and checkouts tolerate CRLF (Windows)
epic: F Follow-ups
audit_ref: follow-up to WVR-060 (0.3.0 release, Windows verification)
priority: P2
status: in-review
depends_on: []
estimate: S
---

## Context
The first `pnpm verify:packages` run on a Windows machine failed with
`README.md '### Prompt generation' must contain exactly one ts block, found 0`.
The cause: `core.autocrlf=true` produced CRLF checkouts. The doc-snippet extractor in
`integration/package-consumer/doc-snippets.mjs` uses regexes that expect `\n`, for example
`/^<!-- from: \S+ -->\n```ts\n[\s\S]*?^```$/gm` (line 31) and `/^```ts\n([\s\S]*?)^```$/gm` (line 35).
The check passed after `git config core.autocrlf false` and a clean re-checkout of `v0.3.0`.
The repo has no `.gitattributes`, so nothing forces LF. This was recorded in WVR-060's Log
and was not fixed for 0.3.0.

## Scope
- Add a `.gitattributes` at the repo root with `* text=auto eol=lf`, so that checkouts and
  tarball contents are LF on every platform.
- Make `integration/package-consumer/doc-snippets.mjs` tolerate CRLF: normalise line endings
  to LF when it reads a Markdown file, before it applies its regexes.
- Document the Windows setup in `docs/packaging.md`: what to do if `core.autocrlf` is set
  on the machine, and the expected result of `pnpm verify:packages` on a Windows checkout.

## Out of scope
- Changing the published package contents or the packing rules in `packages/*/package.json`.
- Re-normalising the whole repository history. Only new checkouts and the working tree need
  to change.
- Any change to the generated golden fixtures' content.

## Files
- `.gitattributes` (new)
- `integration/package-consumer/doc-snippets.mjs`
- `integration/package-consumer/` test or check for the extractor (wherever the package's
  existing checks live, if one exists)
- `docs/packaging.md` (the "Local artifact workflow" section)
- `scratch/issues/WVR-067-crlf-doc-snippet-checkout.md`, `scratch/BOARD.md`

## Acceptance criteria
- [x] On a CRLF checkout (for example `git -c core.autocrlf=true clone` or `git config core.autocrlf true`
      followed by a clean checkout), `pnpm verify:packages` passes.
- [x] A test or check proves the extractor handles CRLF input: the same Markdown with CRLF
      line endings yields the same `ts` blocks as with LF.
- [x] Packed tarball contents are LF (no `\r` in any packed text file, checked by the pack step
      or by a test).
- [x] `docs/packaging.md` describes the Windows setup.

## Verification
- `pnpm verify:packages` on a CRLF checkout (or with a CRLF copy of the README in a temp tree).
- The extractor test with CRLF and LF input.
- `pnpm check:docs`, since `docs/packaging.md` changed.
- `pnpm check:generated && pnpm typecheck && pnpm test && pnpm build` (scratch/README.md, step 6).

## Definition of done
Merged to `main`, with every acceptance criterion ticked on evidence.

## Log
- 2026-10-11: created from the WVR-060 release. The facts are in Context. Status `ready`, no dependencies.
  Candidate for a 0.3.1 patch or an earlier maintenance PR.
- 2026-10-11: started on branch `wvr-067-crlf` from `83cbe81` (Merge pull request #34). `pnpm install --frozen-lockfile` clean.
- 2026-10-11: reproduction, before the fix. `git -c core.autocrlf=true clone . <scratch>/crlf-base` gave
  `README.md` 460 CR bytes and `docs/prompt-generation.md` 305. Calling `docSnippets(root)` on that clone with the
  unfixed extractor threw: `README.md "### Prompt generation" must contain exactly one ts block, found 0`.
  The same call on the LF worktree returned 11 snippets.
- 2026-10-11: renormalise check. `git add --renormalize . && git status --short` showed only `?? .gitattributes`, so no
  tracked file changed. `git ls-files --eol` reported 389 tracked files, all `i/lf w/lf`. No tracked binary files by
  extension (png, tgz, ico, woff, etc.), so no `-text` lines were needed.
- 2026-10-11: extractor fix and test (commit 49b0320). `readText` normalises CRLF and is used for the four reads.
  `integration/package-consumer/doc-snippets.test.mjs` (2 tests): real README and docs as LF vs CRLF give deep-equal
  snippets, and a CRLF custom-catalogs doc keeps the runnable block and drops the FROM-marked one. Wired into the root
  `test` script, because `integration/package-consumer` is not a pnpm workspace package. `node --test` output with the fix:
  `# tests 2 / # pass 2 / # fail 0`.
- 2026-10-11: mutation check. Temporarily set `readText` to plain `readFile`, then ran the test:
  `not ok 1 ... error: 'README.md "### Prompt generation" must contain exactly one ts block, found 0'`,
  `not ok 2 ... error: 'docs/custom-catalogs.md must contain at least 1 runnable ts block, found 0'`,
  `# pass 0 / # fail 2`. Restored the normalisation with a targeted edit: `# pass 2 / # fail 0`.
- 2026-10-11: pack check (commit de880a4) in `scripts/verify-packages.mjs`. Packed `.js`, `.d.ts`, `.map`, `.json`, `.md`,
  `.txt` and `LICENSE` must not contain `\r`. Bite test: copied `artifacts/cylayo-weaver-core-0.3.0.tgz`, appended CR
  to `package/dist/index.js`, put that tarball in `artifacts/`, and ran `node scripts/verify-packages.mjs`:
  `Error: cylayo-weaver-core-0.3.0.tgz: carriage return in packed text file package/dist/index.js`, exit 1. Restored the
  original tarball bytes and reran: exit 0.
- 2026-10-11: `.gitattributes` (commit b1d951f): `* text=auto eol=lf`.
- 2026-10-11: AC1 simulation with the committed `.gitattributes`. `git -c core.autocrlf=true clone .` (HEAD `de880a4`)
  into a scratch dir. `core.attributesfile` is unset. The clone's `README.md`, `docs/prompt-generation.md` and
  `docs/packaging.md` have 0 CR bytes (`grep -c $'\r'`), and `file` reports LF text. So `.gitattributes`, not
  `core.autocrlf`, makes the files LF. `docSnippets` on that clone returned 11 snippets. Then
  `pnpm install --frozen-lockfile && pnpm verify:packages` in that clone: exit 0, `Ran 11 documentation snippets`,
  `Verified 3 tarballs`. Not run in that clone: `pnpm check:docs`, `pnpm test`, `pnpm verify:worker-core` (run in the
  worktree instead, below).
- 2026-10-11: docs (`docs/packaging.md`, "Local artifact workflow", new "### Windows" subsection only).
- 2026-10-11: full gate in the worktree, all exit 0: `pnpm check:generated && pnpm check:docs && pnpm typecheck && pnpm test
  && pnpm build && pnpm verify:packages && pnpm verify:worker-core`. Package-level `node --test` totals reported by the
  `test` script: 437, 11, 10, 139, 99, 15, 8 (all pass, 0 fail). The root script adds the new 2-test file. No package
  source was touched, so these package counts match the base, but I did not run a baseline test pass at 83cbe81.
  `verify:packages`: `Ran 11 documentation snippets`, `Verified 3 tarballs`. `verify:worker-core`: `Verified packed
  Core in isolated workerd consumer`.
- 2026-10-11: not covered: `examples/cookbook/src/custom-catalog/customCatalogDoc.test.ts` has its own `\n`-only regex
  over `docs/custom-catalogs.md`. On a checkout that still has CRLF (for example one made before `.gitattributes`), that
  cookbook test would still fail under `pnpm test`. Out of scope here, so it is left for a follow-up.

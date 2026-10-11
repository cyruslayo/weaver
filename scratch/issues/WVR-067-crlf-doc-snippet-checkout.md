---
id: WVR-067
title: Doc-snippet checker and checkouts tolerate CRLF (Windows)
epic: F Follow-ups
audit_ref: follow-up to WVR-060 (0.3.0 release, Windows verification)
priority: P2
status: ready
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
- [ ] On a CRLF checkout (for example `git -c core.autocrlf=true clone` or `git config core.autocrlf true`
      followed by a clean checkout), `pnpm verify:packages` passes.
- [ ] A test or check proves the extractor handles CRLF input: the same Markdown with CRLF
      line endings yields the same `ts` blocks as with LF.
- [ ] Packed tarball contents are LF (no `\r` in any packed text file, checked by the pack step
      or by a test).
- [ ] `docs/packaging.md` describes the Windows setup.

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

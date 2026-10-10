---
id: WVR-013
title: Golden Basic-catalog prompt fixture with --check script wired into CI
epic: E1 Prompt generation
audit_ref: WVR-01 (acceptance "deterministic snapshot tests")
priority: P0
status: ready
depends_on: [WVR-012]
estimate: S
---

## Context
A committed golden prompt makes every catalog or generator change visible in
review. It follows the existing `scripts/generate-basic-catalog.mjs --check`
pattern.

## Scope
- `scripts/generate-prompt-fixtures.mjs` imports the built Core
  (`packages/core/dist`) and writes
  `packages/core/src/prompt/fixtures/basic-catalog.create.prompt.txt` and
  `basic-catalog.edit.prompt.txt`. These use the Basic catalog, all 14 Basic
  functions, a sample action list and the shipped examples. With `--check`,
  the script exits non-zero when the output is stale.
- A Core test compares the generator output byte-for-byte against the
  fixtures. Read the fixtures with `node:fs` from the package root. This is
  test-only code; the production module must not read files.
- Root `package.json`: extend `check:generated` to also run the prompt
  fixture check. It must run after a build, so either build Core inside the
  script or reorder the CI steps. Choose one and document why.

## Files
- New: the script and the fixtures
- Edit: root `package.json`, possibly `.github/workflows/ci.yml` (step order),
  the Core test file

## Acceptance criteria
- [ ] `pnpm check:generated` fails when someone edits a Basic description
      without regenerating.
- [ ] The fixture is human-readable. Review it for prompt quality: it should
      contain no JSON-Schema noise such as `$ref` URLs.
- [ ] CI runs the check.

## Verification
`pnpm build && pnpm check:generated`. Then temporarily edit the fixture and
confirm the check fails.

## Definition of done
Merged. CI is green.

## Notes

- `prompt.txt` for the cookbook form (WVR-042) comes from `generateA2UIV091Prompt`, but no script regenerates it. `examples/cookbook/src/form.test.ts` checks it against the generator, so a stale file fails the test and has to be refreshed by hand. Decide here whether this issue's script also covers it.

## Log

---
id: WVR-013
title: Golden Basic-catalog prompt fixture with --check script wired into CI
epic: E1 Prompt generation
audit_ref: WVR-01 (acceptance "deterministic snapshot tests")
priority: P0
status: done
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
- [x] `pnpm check:generated` fails when someone edits a Basic description
      without regenerating.
- [x] The fixture is human-readable. Review it for prompt quality: it should
      contain no JSON-Schema noise such as `$ref` URLs.
- [x] CI runs the check.

## Verification
`pnpm build && pnpm check:generated`. Then temporarily edit the fixture and
confirm the check fails.

## Definition of done
Merged. CI is green.

## Notes

- `prompt.txt` for the cookbook form (WVR-042) comes from `generateA2UIV091Prompt`, but no script regenerates it. `examples/cookbook/src/form.test.ts` checks it against the generator, so a stale file fails the test and has to be refreshed by hand. Decide here whether this issue's script also covers it.

## Log

- 2026-10-10: In review on branch `wvr-013-prompt-golden-fixture`, based on `d977a03`.
  - `scripts/generate-prompt-fixtures.mjs` writes and checks `packages/core/src/prompt/fixtures/basic-catalog.{create,edit}.prompt.txt`. Each file is the generated text plus one trailing newline. `--check` exits 1 and names the stale files.
  - The config is one shared test-helper, `packages/core/src/prompt/basicPromptFixtures.test-helper.ts`. It uses the 13 `createBasicCatalogFunctionImplementations` functions, plus `openUrl`, a sample `submit_signup` action and `A2UI_V091_BASIC_PROMPT_EXAMPLES`.
  - Deviation: the 14th function, `openUrl`, lives in `@cylayo/weaver-web`, not Core. Core cannot import Web, so the script passes the real Web registration and the Core test passes a stand-in with the same catalog id, name and effect. The prompt lists functions by metadata, so both produce the same text. The script also imports `packages/web/dist`.
  - Build choice: the script builds Core and Web itself with `tsc` before it imports their `dist`. A check that imports `dist` without building could pass on a stale prompt. Reordering CI would not help, because `check:generated` runs before `build`. The CI step is renamed to "Check generated Basic Catalog and prompt fixtures". Its command is unchanged.
  - Cookbook decision (Notes): not covered by this script. The cookbook prompt is built from the cookbook's own functions and actions, and its test (`prompt.txt is the generated prompt for this screen`) already fails when the file is stale. Refresh by hand. Extending the script would make Core tooling import an example app.
  - Quality review: the fixture has no `$ref`, `$defs`, `$id`, `$schema`, `#/` or upstream schema file names. The Core test pins this. Its type labels such as `reference ComponentId` come from the WVR-011 generator and are unchanged. They are readable, but a reviewer may want them shortened in a later issue.
  - Evidence (Verification): (1) A hand-edited fixture makes `--check` exit 1, and regeneration restores it. (2) A Basic description changed in `generated-basic-catalog.ts` makes `pnpm check:generated` fail and makes the prompt check fail alone. The file was then restored from git.
  - Gate, run locally: `pnpm install`; `pnpm check:generated`; `pnpm typecheck`; `pnpm build`; `pnpm test` (Core 417, MCP 10, Web 132, cookbook 43, reference-app 3, all pass, 0 fail); `pnpm conformance:v0.9.1` (Core 417 and Web 132 pass); `pnpm verify:packages`; `pnpm verify:worker-core` (2 pass). Core's package test script registers `dist/prompt/basicPromptFixtures.test.js`.
  - Not verified: remote CI, since nothing was pushed. The "CI is green" part of the definition of done is still open.

- 2026-10-10 merged in cyruslayo/weaver#23 (6094797)

---
id: WVR-016
title: Document prompt generation (docs/prompt-generation.md + README section)
epic: E1 Prompt generation
audit_ref: WVR-01
priority: P0
status: done
depends_on: [WVR-013, WVR-015]
estimate: S
---

## Scope
`docs/prompt-generation.md` covers:
- the purpose of prompt generation;
- the API;
- the sections it produces;
- create mode versus edit mode;
- example validation;
- the size budget;
- the guarantee that the prompt never lists untrusted capabilities;
- how custom catalogs flow through it (forward-link to
  `docs/custom-catalogs.md`);
- the explicit non-goal: there is no model call inside Weaver.

Add a short README section with a 10-line usage snippet.

## Acceptance criteria
- [x] The doc snippet compiles. Copy it into a test or into
      `integration/package-consumer/consumer.ts`.
- [x] The README links to the doc.

## Definition of done
Merged.

## Log

- 2026-10-10: In review on branch `wvr-016-prompt-docs`, based on `8c4d966`.
  - Added `docs/prompt-generation.md` and a "Prompt generation" section in `README.md`. The README snippet has 10 non-blank lines and links to the doc.
  - Verified: every ```ts block in the new README section and in the doc was extracted and run as-is against the built `packages/core/dist`, then type-checked with `tsc --strict`. All pass. The `@cylayo/weaver-core` import was rewritten to the built `dist` path for the run only. The API signature block is `text`, not `ts`, because it is not runnable.
  - Verified: a relative-link check over both files resolves every link, including the `#errors`, `#regenerating-the-fixtures`, and `#custom-catalog` anchors.
  - Snippet check (ticks the "doc snippet compiles" criterion): `integration/package-consumer/doc-snippets.mjs` reads the ts blocks from the "### Prompt generation" section of `README.md` (exactly one) and from every ts block in `docs/prompt-generation.md` (at least three), at run time. `scripts/verify-packages.mjs` writes them into the isolated consumer, which installs the packed tarballs. It then typechecks them with `integration/package-consumer/tsconfig.doc-snippets.json` and runs each with Node type stripping. The doc is the only source, so the text checked is the text readers copy. Output: "Ran 4 documentation snippets against the packed packages". Drift check: a deliberate `result.value.textx` in the README made `pnpm exec tsc` fail with `doc-snippets/readme-prompt-generation-0.ts(12,35): error TS2551`, and the verifier exited 1. The README was then restored byte for byte.
  - Measured with `wc -m` on the fixtures (characters, including the trailing newline) and with the generator's `text.length`. Create: 22,165 in `text`, 22,166 in the file. Edit: 22,350 in `text`, 22,351 in the file. The text is ASCII, so bytes match. The 22,112 figure reported earlier does not reproduce from the committed fixture, nor from any other measure tried (bytes, code points, CRLF). The doc uses the two figures above.
  - Custom catalogs: `docs/custom-catalogs.md` does not exist yet (WVR-055), so the doc links to `examples/cookbook/README.md#custom-catalog` and names the planned file as text only.
  - `examples/cookbook/README.md` (docs only): `DataTable.rows` and `BarChart.values` now read as a data binding (preferred) or a literal array. The "renderers arrive in WVR-052 and WVR-053" line now names `dataTableRenderer.ts`, `barChart.ts` and `renderers.ts`. The read-only `DataTable` note still points to the `List` template on the ticket board.
  - Gate, run locally: `pnpm install`, `pnpm build`, `pnpm typecheck`, `pnpm check:generated`, `pnpm test` (core 427, mcp 10, web 133, cookbook 73, reference-app 8; 0 failed), `pnpm verify:packages` (exit 0, includes the snippet check), `pnpm conformance:v0.9.1` (core 427 and web 133 pass). Not run: `pnpm verify:worker-core`.
  - Not touched, per the session instruction: `scratch/BOARD.md` and `docs/PLAN.md`.

- 2026-10-10 merged in cyruslayo/weaver#25 (42f338c)

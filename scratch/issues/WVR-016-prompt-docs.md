---
id: WVR-016
title: Document prompt generation (docs/prompt-generation.md + README section)
epic: E1 Prompt generation
audit_ref: WVR-01
priority: P0
status: in-review
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
- [ ] The doc snippet compiles. Copy it into a test or into
      `integration/package-consumer/consumer.ts`.
- [x] The README links to the doc.

## Definition of done
Merged.

## Log

- 2026-10-10: In review on branch `wvr-016-prompt-docs`, based on `8c4d966`.
  - Added `docs/prompt-generation.md` and a "Prompt generation" section in `README.md`. The README snippet has 10 non-blank lines and links to the doc.
  - Verified: every ```ts block in the new README section and in the doc was extracted and run as-is against the built `packages/core/dist`, then type-checked with `tsc --strict`. All pass. The `@cylayo/weaver-core` import was rewritten to the built `dist` path for the run only. The API signature block is `text`, not `ts`, because it is not runnable.
  - Verified: a relative-link check over both files resolves every link, including the `#errors`, `#regenerating-the-fixtures`, and `#custom-catalog` anchors.
  - Measured: the Basic create fixture is 22,165 characters (22,166 bytes on disk). The edit fixture is 22,350. The default budget is 24,000.
  - Custom catalogs: `docs/custom-catalogs.md` does not exist yet (WVR-055), so the doc links to `examples/cookbook/README.md#custom-catalog` and names the planned file as text only.
  - Not ticked: "The doc snippet compiles. Copy it into a test or into `integration/package-consumer/consumer.ts`." The snippets compile and run, but they are not in a committed test or the consumer file. This issue is docs-only, so that addition is left for a follow-up.
  - Gate, run locally: `pnpm install`, `pnpm build`, `pnpm typecheck`, `pnpm check:generated`, `pnpm test` (core 427, mcp 10, web 133, cookbook 73, reference-app 8; 0 failed). Not run: `pnpm conformance:v0.9.1`, `pnpm verify:packages`, `pnpm verify:worker-core`.
  - Not touched, per the session instruction: `scratch/BOARD.md` and `docs/PLAN.md`.
  - Noticed, out of scope: `examples/cookbook/README.md` describes `DataTable.rows` and `BarChart.values` as a data binding only, and says their renderers "arrive in WVR-052 and WVR-053". The code also accepts a literal array, and both renderers are merged. That needs a separate docs fix.

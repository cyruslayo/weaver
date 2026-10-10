---
id: WVR-055
title: Document the custom catalog recipe (docs/custom-catalogs.md)
epic: E5 Custom catalog recipe
audit_ref: WVR-05
priority: P0
status: in-review
depends_on: [WVR-054, WVR-016, WVR-057]
estimate: S
---

## Scope
`docs/custom-catalogs.md` is a step-by-step recipe:
1. `defineCatalog`.
2. The one-catalog-per-surface rule and reusing Basic schemas.
3. Writing a trusted renderer: the security checklist (no HTML sinks, no
   dynamic code), accessibility, and the stale-interaction guard.
4. Registering the renderer through `additionalCatalogs` and
   `additionalRenderers`.
5. The prompt generator picks the new components up automatically.
6. Testing the failure modes.

Add a "when to add a component" rule from audit WVR-09: only when a shipping
app needs it, with its bundle and dependency impact measured. Link the doc
from the README.

## Acceptance criteria
- [x] Every snippet matches the cookbook code.
- [x] The README links to the doc.

## Definition of done
Merged.

## Log

- 2026-10-10: depends on WVR-057. The recipe should link the orders-report screen (`examples/cookbook/orders-report.html`, source `src/screens/orders-report.ts`) as the runnable example.
- 2026-10-10: branch `wvr-055-custom-catalog-docs`, from `a3134ec`. Status `in-review`. Not pushed, no PR.
  - `docs/custom-catalogs.md` is the six-step recipe. Each cookbook excerpt is quoted under `<!-- from: path -->`. A cookbook test checks that every quote is a verbatim substring of its cited file. One runnable block uses only published APIs. `pnpm verify:packages` compiles and runs it as `docs-custom-catalogs-0.ts`, and it shows `RENDERER_NOT_FOUND` with its hint.
  - The snippet check is extended additively. `doc-snippets.mjs` skips `from:` blocks. `tsconfig.doc-snippets.json` sets `skipLibCheck`, because happy-dom's typings need a newer `node:stream/web` than the consumer's `@types/node`. The 10 existing snippets pass, and 11 run in total.
  - `scripts/check-doc-links.mjs` checks relative links and `#anchors`. All 102 links in 59 tracked Markdown files resolve.
  - The "planned under WVR-055" text in `docs/prompt-generation.md` and `docs/debugging.md` is now a link. The README and the cookbook README link to the recipe.
  - Failure proofs: a broken runnable snippet fails with a compile error or a runtime assertion, and a broken quote fails with its doc line and first mismatched line. Each doc was restored byte-identical (sha256 `9683d6af…`).
  - Cookbook `orders-report` chunk, from `pnpm build`: 12.45 kB minified, 4.59 kB gzip. This includes the screen and catalog, so the marginal size of one component is not isolated.
  - WVR-056 (per-row dispatch) stays gated. `scratch/BOARD.md` and `docs/PLAN.md` are untouched.
  - Link check is now a gate. Root script `pnpm check:docs` runs `node scripts/check-doc-links.mjs`. CI runs it as the step "Check documentation links", right after "Check generated Basic Catalog and prompt fixtures" in `.github/workflows/ci.yml`. The step is the only workflow change. Run `pnpm check:docs` locally. It checks every git-tracked `.md` file (60 files, including the 41 `scratch/` tracker files), prints one line per link, and exits 1 on any broken file or anchor. Proof: a README link broken on purpose gave `BROKEN README.md:421 docs/no-such-page.md (no such file or directory)` and exit 1, and the file was restored to its original checksum.
- 2026-10-10: **integration (`wvr-integration-6`, merge commit `add250c`).** Merged second of the three review branches. No conflicts. The doc-quote test (`customCatalogDoc.test.ts`) passed on the merged code with no doc fix needed: each quote in `docs/custom-catalogs.md` is still a verbatim substring of its cited cookbook file after WVR-034 changed `harness.ts` additively. The cookbook `test` gate passed, including `customCatalogDoc.test.js`.

---
id: WVR-066
title: An absolute path inside a List template renders empty with no diagnostic
epic: F Follow-ups
audit_ref: follow-up to WVR-034 (cookbook error demo, found while building it)
priority: P2
status: in-review
depends_on: []
estimate: S
---

## Context
Inside a `List` template, a child binds relative to its own item. The path has no leading slash, so
`{ path: "name" }` reads `name` from the current item. An absolute path such as `{ path: "/name" }`
reads from the DataModel root. The root has no `name`, so the text is empty. The render succeeds and
no diagnostic is raised. Authors who write the absolute form get a blank list with no explanation.

This was found while building the cookbook error demo. `examples/cookbook/src/screens/error-demo.ts:62-63`
carries a comment that says the relative form is needed, but nothing in the library says why the
absolute form is blank.

Verified in the code:

- `packages/core/src/data-context/path.ts:10-22`: a path that starts with `/` is parsed as a root
  pointer. It is returned as `absolutePath` and `tokens` with no scope, even inside a collection item.
- `packages/core/src/data-context/path.ts:24-40`: only a relative path is prefixed with the scope tokens.
- `packages/core/src/data-context/DataContext.ts:44-49`: `get` returns `success(undefined)` for a
  missing value. It returns no error, so the renderer sees an absent value, not a failed one.
- The rule is documented in `docs/architecture.md:668-676` ("Collection-item scope ... absolute paths
  still resolve from the DataModel root"). A grep of `docs/` found no other place that says it.
- The opposite mistake has a diagnostic: a relative path at root gives `RELATIVE_PATH_OUTSIDE_COLLECTION`,
  with the hint "Use an absolute path, or use a relative path only inside a collection template"
  (`packages/core/src/diagnostics/describeWeaverError.ts:208-214`). No code reports an absolute path
  that resolves to nothing inside a template.

Reproduced (2026-10-10, scratch probe against the built cookbook harness and Core, with a List of two
items and a Text child):

- Relative `{ path: "name" }`: the DOM text is `ProbeNamesAlphaBeta`, with 0 render errors and
  `resolveSurface` ok.
- Absolute `{ path: "/name" }`: the DOM text is `ProbeNames` (the list's items render empty), with 0 render
  errors and `resolveSurface` ok. The stored data is intact (2 items at `/items`), so the cause is the path,
  not the data.

## Scope
Decide the approach in the Log first. Options:

1. **Document the rule prominently (recommended).** Add a short rule to the author-facing docs where
   templates are described (`docs/architecture.md` near `:668`, and the recipe in `docs/custom-catalogs.md`
   if it covers `List`). State that inside a template a leading slash means the DataModel root, so the
   item's own field needs no slash. Add a regression test that pins the current behaviour (absolute
   resolves from the root, so the item text is empty) so the rule cannot drift silently.
2. **Diagnose an absolute path that resolves to nothing inside a template.** Report a diagnostic when the
   item scope is active, the path is absolute, and the root value is `undefined`. This is an extra signal,
   and it does not change the rendering. It has a false-positive risk: an absolute path can
   legitimately point at missing data. The architecture doc says Weaver "does not guess sender intent",
   which argues against it.
3. **Change the meaning of the absolute path inside a template.** Not recommended. It breaks the
   documented rule and every existing caller.

Recommendation: option 1. Option 2 can be a follow-up if authors keep hitting the trap. Record the choice
in the Log before any code change.

## Out of scope
- Changing how Core resolves paths outside a template, or the `RELATIVE_PATH_OUTSIDE_COLLECTION` rule.
- Two-way binding and `InputBindingWriter` path rules.
- Nested-collection paths beyond what `docs/architecture.md` already states.

## Files
- `docs/architecture.md` (the scope rules, lines 668-678)
- `docs/custom-catalogs.md` (only if it describes `List` or template children, which WVR-055 added)
- `packages/core/src/data-context/DataContext.test.ts` (the regression test, next to line 45)
- `packages/core/src/component-properties/ComponentPropertyResolver.test.ts` (only if the regression is pinned at the property level)
- `examples/cookbook/src/screens/error-demo.ts` (the comment at lines 62-63 may point to the new rule)
- `scratch/issues/WVR-066-absolute-path-in-list-template.md`, `scratch/BOARD.md`

## Acceptance criteria
- [x] The Log records the option chosen (1, 2 or 3) and the reason, before any code change.
- [x] A regression test pins the chosen behaviour: for option 1, an absolute path inside a collection
      item resolves from the root (empty text for a missing root key), and the relative path resolves
      below the item. For option 2, the absolute path inside a template raises the chosen diagnostic.
- [x] The rule is stated in `docs/architecture.md` where the scope rules are described, and the new
      text is linked from the List or template section that authors read.
- [x] `pnpm check:docs` passes, since the docs changed.
- [x] `pnpm --filter @cylayo/weaver-core test` and `pnpm typecheck` pass, with no test removed.

## Verification
- `pnpm --filter @cylayo/weaver-core test`, `pnpm typecheck`, `pnpm check:docs`.
- Re-run the probe in the Log (relative and absolute item text, before and after).
- `pnpm conformance:v0.9.1`, since a Core test changed.

## Definition of done
Merged to `main`, with every acceptance criterion ticked on evidence.

## Log
- 2026-10-10: created during the WVR-034/055/058 integration (`wvr-integration-6`). Status `ready`,
  no dependencies. Evidence: `path.ts:10-40`, `DataContext.ts:44-49`, `docs/architecture.md:668-678`,
  `describeWeaverError.ts:208-214`, and the probe above (relative item text `ProbeNamesAlphaBeta`;
  absolute `ProbeNames`; no render errors in either case; the data is intact).
  No approach is chosen yet. The recommendation is option 1.
- 2026-10-10 decision: **option 1 chosen** (owner approved). Document the rule prominently and pin the
  current behaviour with a Core regression test. No diagnostic is added, and the meaning of an absolute
  path inside a template does not change.
  - Rationale: `docs/architecture.md` says Weaver "does not guess sender intent". An absolute path can
    legitimately point at data that is missing, so a diagnostic would fire on valid documents (false
    positives). Option 3 would change the documented meaning of absolute paths for every existing caller.
  - Considered and deferred: **option 2** (diagnose an absolute path that resolves to `undefined` inside a
    template). It stays a possible follow-up if authors keep hitting the trap after the docs ship. **Option
    3** (change the absolute-path meaning inside a template) is considered and not planned.
  - Branch `wvr-066-absolute-path-rule`, base `dfb55dd`.
- 2026-10-10 implementation (option 1, in-review):
  - Reproduction, run against the built packages through the compiled cookbook `mountCookbookScreen` harness
    (a List of two items, Text child bound to `name` or `/name`):
    `{"path":"name","resolveSurfaceOk":true,"renderResult":true,"renderErrors":0,"itemTextNodes":["Alpha","Beta"],"mainText":"ProbeAlphaBeta"}`
    `{"path":"/name","resolveSurfaceOk":true,"renderResult":true,"renderErrors":0,"itemTextNodes":["",""],"mainText":"Probe"}`
    The stored data is intact (`stateItems` Alpha, Beta).
  - Cited lines checked: `path.ts:10-22` and `24-40`, `DataContext.ts:44-49`, `describeWeaverError.ts:208-214`,
    `error-demo.ts:62-63`, and `architecture.md:668-676` (the rule's lines are 673-675, inside the cited range).
    All matched. No citation was off.
  - Docs: the rule is stated after the scope diagram in `docs/architecture.md` (in prose, with links to the other
    three pages). It is linked from a new "Paths inside a template" section in `examples/cookbook/README.md` and
    from the List paragraph in `docs/custom-catalogs.md`. `docs/debugging.md` has a new "Symptoms and fixes" section
    with "Symptom: template text is empty with no error". All new code blocks use `json` or `text` fences.
  - Regression test: `packages/core/src/data-context/DataContext.test.ts`, the test
    "inside a collection item, a leading slash reads the root and a bare path reads the item" (Core `node --test`
    list already includes this file, so `package.json` is unchanged). It uses string and undefined comparisons only.
    No Web test was added. The Core test covers the rule at the DataContext layer, and the issue allows "and/or".
  - Mutation: `path.ts` absolute branch changed to prepend the item scope. The new test failed cleanly
    (`not ok 124`, `+ 'Beta'` vs `- undefined`, no hang). Thirteen Core tests failed in total because the
    mutation changes absolute-path semantics everywhere. `path.ts` was reverted with `git checkout`, and
    `git status` showed no change to it. No mutation was committed.
  - The `error-demo.ts` change is comment-only: a pointer to the debugging entry.
  - Gate (final tree, after revert): `pnpm build` exit 0. `pnpm typecheck` exit 0, no errors. `pnpm test` exit 0:
    Core 428/428 and the other package suites all pass with 0 failures. `pnpm check:generated` exit 0.
    `pnpm check:docs` exit 0: 130/130 relative links in 63 files. `pnpm conformance:v0.9.1` exit 0: Core 428/428,
    Web 136/136. `pnpm verify:packages` exit 0: 3 tarballs, 11 doc snippets run against the packed packages.
    `pnpm verify:worker-core` exit 0: 2/2.
  - Not done: a Web-level List test. `scratch/BOARD.md` and `docs/PLAN.md` were not edited, per the owner's
    instruction. `BOARD.md` still lists this issue as `ready` and needs the `in-review` change made by the owner.
  - Options 2 and 3 remain considered and deferred, as recorded above.

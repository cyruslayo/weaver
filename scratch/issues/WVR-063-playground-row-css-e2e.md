---
id: WVR-063
title: Exercise the playground inspector's Row layout rules with a trace that contains a Row
epic: F Follow-ups
audit_ref: follow-up to WVR-024 / WVR-025 (browser review)
priority: P2
status: ready
depends_on: []
estimate: S
---

## Context
`examples/playground/src/inspector.css:276-299` has Row layout rules scoped to `[data-weaver-mount]`:
`flex-wrap: wrap` on the Row, `min-width: 0; max-width: 100%` on its children, and flex basis rules for
Column and Card children. The file's comment says these copy the cookbook's Row fix for narrow screens.

The bundled sample, `examples/playground/samples/reference-request.weaver-trace.json`, has no Row. The
components in it are Button, ChoicePicker, Column, Text (three times), and TextField. `grep -c Row`
returns 0. So the Row rules are never applied by the e2e run, and a regression in them would not
be caught.

The e2e spec (`examples/playground/e2e/inspector.spec.ts`) runs at 360px and 1280px (its header comment
at line 5), and it already injects content into the sample: the test at lines 139-146 rewrites the
sample text with `replaceAll` and loads it through `#trace-file` with `setInputFiles`. That gives a
ready mechanism for a second trace. The e2e run is local only and is not in the required CI gate
(`examples/playground/README.md:47-60`), so this check runs only when someone runs the command in that README.

How it was found: `grep` of the bundled sample, reading `inspector.css` and the spec.

## Scope
Decide the approach in the Log first. Options:

1. **Second committed sample.** Add `examples/playground/samples/row-layout.weaver-trace.json`, a small
   deterministic trace with a Row whose children are wide (a Card, and a Text or TextField holding a
   long unbroken string). Load it in a new e2e test through `#trace-file`, at 360px and 1280px.
   Preferred: the fixture is explicit and easy to review.
2. **Injected Row.** Keep the bundled sample and, in the spec, rewrite a copy of its root Column into a
   Row with wide children, as the test at lines 139-146 does for text. Less data to maintain, but the
   rewrite depends on the sample's JSON shape.

Record the choice in the Log. Do not change the bundled sample that the default page loads.

## Out of scope
- Changing the inspector's layout beyond the Row rules, unless the mutation check below proves a rule is wrong.
- Adding Row to the cookbook, or changing the cookbook's Row styling.
- Wiring the playground e2e into the required CI gate (a separate decision).
- Changing the bundled sample that the default page loads.

## Files
- `examples/playground/samples/row-layout.weaver-trace.json` (new, if option 1)
- `examples/playground/e2e/inspector.spec.ts` (new Row test at both widths)
- `examples/playground/src/inspector.css` (only if the mutation check shows a rule does not apply)
- `examples/playground/README.md` (only if it lists the samples)
- `scratch/issues/WVR-063-playground-row-css-e2e.md`, `scratch/BOARD.md`

## Acceptance criteria
- [ ] A trace with at least one `Row` whose children are wider than 360px (a Card, or a Text or TextField holding a long unbroken string) loads in the inspector with no load error at 360px and 1280px.
- [ ] The e2e test asserts `document.documentElement.scrollWidth <= window.innerWidth` at 360px, on load and at each step, with the Row trace loaded.
- [ ] The e2e test asserts that the rendered Row has computed `flex-wrap: wrap`, which proves the `[data-weaver-mount] [data-a2ui-component="Row"]` rule applied.
- [ ] Mutation proof: with the Row rules in `inspector.css` removed or disabled, the 360px test FAILS on overflow or on `flex-wrap`. The mutation is then reverted, and the Log records both runs.
- [ ] The 1280px run of the same Row trace also passes.
- [ ] The new trace parses as a weaver-trace file (the inspector loads it with no load error, and `sample.test.ts` and `inspector-model.test.ts` still pass).
- [ ] `pnpm --filter @weaver/playground e2e` (run as `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm --filter @weaver/playground e2e`) passes in full.

## Verification
- `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm --filter @weaver/playground e2e`
- `pnpm --filter @weaver/playground test`
- `pnpm test`, `pnpm typecheck`

## Definition of done
Merged to `main`, with every acceptance criterion ticked on evidence, and the e2e run output recorded in the Log.

## Log
- 2026-10-10: created from the WVR-024/057 browser review. Status `ready`, no dependencies. `reference-request.weaver-trace.json` contains 0 occurrences of `Row`. Its components are Button, ChoicePicker, Column, Text (x3) and TextField. The Row rules are at `inspector.css:276-299`.

---
id: WVR-063
title: Exercise the playground inspector's Row layout rules with a trace that contains a Row
epic: F Follow-ups
audit_ref: follow-up to WVR-024 / WVR-025 (browser review)
priority: P2
status: in-review
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
- [x] A trace with at least one `Row` whose children are wider than 360px (a Card, or a Text or TextField holding a long unbroken string) loads in the inspector with no load error at 360px and 1280px. Evidence: e2e `WVR-063 Row layout` first test passes at width-360 and width-1280 (`/tmp` run log, 28 passed).
- [x] The e2e test asserts `document.documentElement.scrollWidth <= window.innerWidth` at 360px, on load and at each step, with the Row trace loaded. Evidence: first Row test, width-360, passes.
- [x] The e2e test asserts that the rendered Row has computed `flex-wrap: wrap`, which proves the `[data-weaver-mount] [data-a2ui-component="Row"]` rule applied. Evidence: second Row test passes at both widths.
- [x] Mutation proof: with the Row rules in `inspector.css` removed or disabled, the 360px test FAILS on overflow or on `flex-wrap`. The mutation is then reverted, and the Log records both runs. Evidence: Log entry 2026-10-11 (mutation run, flex-wrap failure).
- [x] The 1280px run of the same Row trace also passes. Evidence: width-1280 Row tests pass in the full e2e run.
- [x] The new trace parses as a weaver-trace file (the inspector loads it with no load error, and `sample.test.ts` and `inspector-model.test.ts` still pass). Evidence: `parseWeaverTrace` ok, replay of 4 steps with 0 divergence, `pnpm --filter @weaver/playground test` 15/15.
- [x] `pnpm --filter @weaver/playground e2e` (run as `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm --filter @weaver/playground e2e`) passes in full. Evidence: 28 passed, exit 0 (baseline was 24).

## Verification
- `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm --filter @weaver/playground e2e`
- `pnpm --filter @weaver/playground test`
- `pnpm test`, `pnpm typecheck`

## Definition of done
Merged to `main`, with every acceptance criterion ticked on evidence, and the e2e run output recorded in the Log.

## Log
- 2026-10-10: created from the WVR-024/057 browser review. Status `ready`, no dependencies. `reference-request.weaver-trace.json` contains 0 occurrences of `Row`. Its components are Button, ChoicePicker, Column, Text (x3) and TextField. The Row rules are at `inspector.css:276-299`.
- 2026-10-11: started on branch `wvr-063-row-e2e` from `a314299` (Merge PR #41). Approach: **option 1**, a second committed sample `examples/playground/samples/row-layout.weaver-trace.json`. It is recorded by the real `createWeaverTraceRecorder` in a throw-away script (not committed), through `createInspectorWebRuntime` (Basic catalog). Its root Column holds a Row with a Card (a long unbroken Text) and a TextField with a long unbroken value. The bundled `reference-request` sample is not changed. A new `test.describe("WVR-063 Row layout")` at the end of `e2e/inspector.spec.ts` loads it through `#trace-file` at 360px and 1280px. The mutation proof is recorded below once run.
- 2026-10-11: setup. Commit `a314299` confirmed as "Merge pull request #41". `pnpm install --frozen-lockfile` passed. A first baseline `e2e` run failed in the playground build (`Cannot find module '@cylayo/weaver-core'`) because the workspace packages had no `dist/`. `pnpm build` at the root fixed it, and no file changed. The baseline was then re-run: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm --filter @weaver/playground e2e` gave **24 passed, exit 0**. `pnpm --filter @weaver/playground test` gave **15 pass, 0 fail, exit 0**.
- 2026-10-11: trace. A throw-away script (not committed) ran `createWeaverTraceRecorder` through `createInspectorWebRuntime` (Basic catalog). It created the surface, set the data model, and sent components (Column > Text h1, Row > [Card > Text, TextField], Text status), then wrote one input of the 128-character unbroken string to the TextField. Output: 4 entries (message x3, input), `parseWeaverTrace` ok. A second throw-away replay gave `steps 4 diverged []`. Commit `8193f6d` adds `examples/playground/samples/row-layout.weaver-trace.json` (3.5 KB). The bundled sample is unchanged.
- 2026-10-11: e2e. Commit `aed9473` adds the `WVR-063 Row layout` block at the end of `inspector.spec.ts`, with two tests run at 360px and 1280px: (1) load has no load error, and no horizontal overflow on load and at steps 2 to 4; (2) the rendered Row has computed `flex-wrap: wrap`. With the rules in place, the e2e run gave **28 passed, exit 0** (baseline 24 plus 4 new).
- 2026-10-11: mutation proof. The Row rules (`inspector.css`, the block from `[data-weaver-mount] [data-a2ui-component="Row"]` to the Card rule) were wrapped in `/* */`, and the build ran. Command: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm --filter @weaver/playground e2e --project=width-360 -g WVR-063`. Result, **exit 1**: `flex-wrap` test FAILED with `Expected "wrap", Received "nowrap"`. The load and overflow test PASSED. So, with the rules off, the `flex-wrap` assertion catches the regression but the overflow assertion does not. The overflow check passes without the rules because `overflow-wrap: anywhere` on `.stage` and the Text lets the content wrap and shrink. Per the issue, the trace does exercise the rules, so it was not widened. Revert: `git checkout -- examples/playground/src/inspector.css` (the file is clean again). Re-run with the rules: same command, **exit 0, 2 passed**.
- 2026-10-11: `examples/playground/README.md` gets a short "Row layout trace" section that lists the new sample and says it has no regenerator script. `pnpm check:docs` exit 0. Commit `5798e78`.
- 2026-10-11: final verification, all exit 0. `pnpm check:generated` 0. `pnpm check:docs` 0. `pnpm typecheck` 0. `pnpm test` 0 (root node tests: 442 pass, 0 fail). `pnpm build` 0. `pnpm verify:packages` 0. `pnpm verify:worker-core` 0. Playground e2e: 24 before, **28 after**, exit 0. Playground unit tests: 15 before, **15 after**, exit 0. `git diff --stat a314299..HEAD` covers the 3 files of this issue (`README.md`, `inspector.spec.ts`, `row-layout.weaver-trace.json`). No file under `packages/` changed, and no lockfile or version changed.

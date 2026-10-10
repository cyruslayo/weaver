---
id: WVR-034
title: Diagnostics panel in the inspector and a cookbook "error demo"
epic: E3 Error presentation
audit_ref: WVR-03 ("typed error panel grouped by frame, component, path, cause")
priority: P0
status: done
depends_on: [WVR-032, WVR-024, WVR-041]
estimate: M
---

## Scope
- Build a small framework-free panel module,
  `examples/shared/diagnostics-panel.ts` or a file under the playground. It
  renders `WeaverErrorDescription[]` grouped by frame, then surface, then
  component, and shows the cause chain and hint. Build it with `textContent`
  only and never use `innerHTML`.
- Wire the panel into the inspector (WVR-024).
- Add it to the cookbook (WVR-041) as an "Error demo" screen. That screen
  feeds three bad updates and shows the panel next to the intact surface.
- Promotion rule: move the panel into `@cylayo/weaver-web` only when an
  adopting host asks for it. Record that rule in the doc.

## Acceptance criteria
- [x] Each bad frame produces one grouped entry. The previous surface stays
      visible. (Cookbook `error-demo.spec.ts` and `error-demo.test.ts`; playground
      `inspector.spec.ts` checks one entry for the malformed frame and for the
      rejected message, with the last good stage still rendered.)
- [x] The panel is keyboard reachable and readable at 360px. (Tab reaches the
      panel as the first stop in the cookbook and as a stop in the inspector, with
      a focus outline. No horizontal overflow at 360px or 1280px. A 360px
      screenshot was checked by eye.)

## Verification
Manual check in the inspector and the cookbook, plus a happy-dom test of the
panel grouping.

## Definition of done
Merged. Screenshot in the PR.

## Log

- 2026-10-10: Branch `wvr-034-diagnostics-panel`, reset to base `a3134ec`. Not
  pushed, no PR. Depends on WVR-032, WVR-024 and WVR-041, all `done` on this base.
  - **Shared module.** It lives in `examples/shared`, as the private workspace
    package `@weaver/shared`. Its exports point at the built `dist/`, and its CSS
    is exported as `@weaver/shared/diagnostics-panel.css`. Both the playground and
    the cookbook depend on it with `workspace:*`, so there is one built copy. A
    plain relative import was rejected. Each package's tsconfig sets `rootDir: src`,
    so `tsc` fails with TS6059 on a file outside `src`. The package layout matches the
    core and web packages, which also resolve through `dist/`.
  - **Panel.** `renderDiagnosticsPanel(target, descriptions, options)` groups by
    frame, then surface, then component. Frames sort ascending and the no-frame group
    sorts last. Surfaces and components keep first-seen order. Every text node is set
    with `textContent`. The panel is one `tabindex="0"` region. Its headings and lists
    show the code, summary, scope, data path, hint and flattened cause chain.
  - **Inspector.** `#error-panel` and the stage failure now use the panel. The local
    `buildDescription` and its CSS are removed. The `#error-panel` id and its
    `INVALID_JSON` text are unchanged, so the existing spec still holds.
  - **Error demo.** `error-demo.html` and `src/screens/error-demo.ts` mount the
    screen, then feed three bad updates through the screen's own ingestion, so frame
    numbers continue from the start frames. They are:
    1. A truncated JSONL line. It is rejected at ingestion with `INVALID_JSON`, frame 4.
    2. A component the Basic catalog does not define (`Sparkline`). It is rejected at
       ingestion with `CATALOG_REGISTRY_ERROR` and `COMPONENT_NOT_ALLOWED`, frame 5.
    3. A 70-row list. Its data update is accepted, but rendering exceeds
       `maxResolvedInstances` (64). `onError` reports `SURFACE_RESOLUTION_FAILED`, and
       the previous DOM stays, frame 6.
    Each bad frame yields one entry. The third is not an unregistered renderer,
    because every Basic component has a renderer, so that case cannot occur without a
    deliberately broken catalog. Two other cases were probed and are not errors. A
    dangling child reference is silently skipped. A circular reference is accepted and
    reported as a resolution issue, not a render error.
  - **Describer gap, worked around in the example.** `describeWebRenderError()` gives
    the budget failure no `surfaceId`, so the demo fills in the id of the surface it
    mounted. The package is unchanged.
  - **Observed behaviour, not changed.** Frame 6 is accepted into the Core store, and
    only the render fails. The DOM keeps the last good render, but the store holds the
    70 rows until a later update corrects them. This is Core's existing behaviour.
  - **Gotcha found.** A template item binds relative to its own scope, so `{"path":
    "name"}` is right and `{"path": "/name"}` renders empty without an error. The
    demo uses the relative form.
  - **Harness, additive only.** `CookbookStream.push()` returns raw ingestion events
    and does not throw. `CookbookMountOptions.onRenderError` passes through to the
    surface's `onError`. The existing cookbook test that pins the dependency set now
    names `@weaver/shared`, which is an explicit, intentional change.
  - **Docs.** `docs/debugging.md` has a short "Diagnostics panel" section with the
    promotion rule, in prose and with no `ts` fence. The 10 packed snippets still pass.
    `examples/playground/README.md` and `examples/cookbook/README.md` are updated.
  - **Tests.** Shared: 11 happy-dom unit tests (grouping order, headings, cause chain,
    hint, empty state, `textContent`-only, focus region, heading levels). Cookbook:
    `src/screens/error-demo.test.ts` has 6 tests. Playwright: `e2e/error-demo.spec.ts`
    (5 tests) and 3 new inspector tests. The new assertions compare strings and
    booleans, never DOM nodes. The existing cookbook tests that compare nodes with
    `null` are unchanged, and WVR-062 tracks them.
  - **Gate.** `pnpm check:generated`, `pnpm typecheck`, `pnpm build`, `pnpm test`
    (core 427, shared 11, mcp 10, web 133, cookbook 93, playground 15, reference-app
    8, all pass), `pnpm conformance:v0.9.1` (133/133), `pnpm verify:packages` (10
    snippets pass), `pnpm verify:worker-core`. Cookbook e2e: 40/40 (width-1280 20,
    width-360 20, including 10 new). Playground e2e: 24/24 (12 per project, including
    3 new per project). Chromium came from `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`.
  - **Mutations** (temporary, each reverted with `git checkout`, not committed):
    1. Frame sort removed. Shared unit: 3 of 11 fail (ordering, heading sequence,
       entry order).
    2. Surface unmounted on a render failure. Cookbook unit: 1 fails (intact surface).
       Cookbook e2e: 10 of 40 fail, all error-demo tests at both widths.
    3. `element()` writes `innerHTML` instead of `textContent`. Shared unit: 1 fails
       (markup-as-text). An earlier mutation that broke the types was caught by `tsc`
       first, so it did not count and was replaced.
  - **Browser checks.** Playwright found no layout or keyboard bugs. A 360px and a
    1280px screenshot were reviewed. The cookbook panel stacks below the surface at
    360px and sits beside it at 1280px. I muted the surface and component headings
    after review, and I removed the inspector's double border.
  - **Not done.** The inspector does not get a trace-wide diagnostics list. It shows
    the error for each selected entry. `docs/PLAN.md` and `scratch/BOARD.md` are not
    touched, as the session instructions say. No PR is opened, and the PR screenshot
    is not produced.
- 2026-10-10: **integration (`wvr-integration-6`, merge commit `bc1ca64`).** Merged last of the three review branches. One conflict: `examples/cookbook/package.json`, where 034 and 055 each added one file to the `test` script. Resolved by keeping both (`dist/custom-catalog/customCatalogDoc.test.js` and `dist/screens/error-demo.test.js`). `pnpm-lock.yaml` was regenerated by `pnpm install` (not hand-edited), and it was already consistent. A second fix is in `e16301f`: `examples/shared` typecheck was `--noEmit`, so its `dist` types never existed for the cookbook and playground typecheck. Emitting like the packages do fixes the gate order (typecheck before build), which fresh CI runs. Confirmed that a3134ec typechecks without a prior build only because the packages emit their own types. The gate passes on the integration branch.
- 2026-10-10 merged in cyruslayo/weaver#27 (dfb55dd)

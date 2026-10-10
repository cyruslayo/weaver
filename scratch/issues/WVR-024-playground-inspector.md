---
id: WVR-024
title: Playground inspector page (load trace, step, snapshots, suppressed outbound log)
epic: E2 Trace and replay
audit_ref: WVR-02, §4.D (OpenUI Inspect/Debug equivalent)
priority: P0
status: done
depends_on: [WVR-023]
estimate: L
---

## Context
This is the in-app developer experience that OpenUI's devtools provide,
rebuilt on Weaver's own runtime and catalog. It is read-only and for
development only.

## Scope
- Add `examples/playground/inspector.html` and `src/inspector.ts`, and
  configure Vite multi-page in `vite.config.ts`. The config file may be new.
- Load a trace from a file input or from a bundled sample. Generate the
  sample deterministically from the reference-app flow by a small script or
  a test helper, and commit it under `examples/playground/samples/`.
- Step controls: first, previous, next, last, a slider, and keyboard
  shortcuts.
- Panels for the current step:
  - the raw entry JSON and a validity badge;
  - the error, formatted by WVR-031 once that issue is done; until then show
    the raw code;
  - the surface snapshot and data model;
  - the resolved tree and issues from `runtime.resolveSurface`;
  - check results;
  - the action outcome.
- A live mount of the surface at the current step through
  `createBasicWebRuntime`. Its `onServerEvent` appends to a
  "Suppressed outbound" log and never sends anything.
- Use semantic HTML. The page must be usable by keyboard and at 360px width.

## Out of scope
- Shipping it inside `@cylayo/weaver-web`.
- Live attachment to a remote app (later).

## Acceptance criteria
- [x] `pnpm --filter @weaver/playground build` succeeds, and the typecheck
      covers `inspector.ts`.
- [x] Manual check: the sample trace steps through, the malformed frame is
      visibly flagged, and the earlier surface stays rendered. (Checked by the
      automated Playwright run in a real Chromium, not by a person. See Log.)
- [x] Clicking a Button in the live mount adds to the suppressed log only.
      (Checked by the Playwright run. No requests are sent.)

## Verification
`pnpm --filter @weaver/playground dev`, then open `/inspector.html`.

## Definition of done
Merged. A screenshot is attached to the PR.

## Log
- 2026-10-10: Implemented on branch `wvr-024-playground-inspector` (base `8c4d966`), status `in-review`. No push, no PR.
  - The issue has no `## Notes` section, so no notes were applied. The scope, the ROADMAP and the WVR-045 log were used instead.
  - Files, all under `examples/playground/`:
    - `inspector.html`, `src/inspector.ts`, `src/inspector.css`: the page. It uses textContent only for trace data, with no innerHTML. It has step controls (First, Previous, Next, Last, a slider), a timeline with error entries flagged, and panels for the entry JSON with a validity badge, the error (`describeWeaverError`), the surface and data model, the resolved tree and issues, check results, and the action outcome with the replay result. The live mount uses `createBasicWebRuntime`, and `describeWebRenderError` reports mount failures. Suppressed server events are logged and never sent.
    - `src/inspector-model.ts`: DOM-free. It loads trace text, returns readable messages, and replays into a fresh runtime for each step.
    - `src/runtime-factory.ts`: one Basic Web runtime configuration, shared by the recorder, the replay and the live mount.
    - `src/sample-flow.ts`, `scripts/write-sample.mjs`, `samples/reference-request.weaver-trace.json`: a deterministic recording (fixed clock) through the real ingestion path. It holds 10 entries: 3 messages, a torn frame, a catalog-rejected message, 2 inputs, an action, a host answer, and a rejected action.
    - `src/sample.test.ts`, `src/inspector-model.test.ts`: 15 node tests. The sample must match the recording byte for byte, parse with `parseWeaverTrace`, and replay with zero divergence. The model tests cover error messages and check that a torn frame or rejected message leaves the surface unchanged.
    - `vite.config.ts`: multi-page build (index and inspector). `tsconfig.test.json`: the test compile. `tsconfig.json` adds `node` to its types.
    - `e2e/inspector.spec.ts`, `playwright.config.ts`, `tsconfig.e2e.json`: Playwright checks at 1280px and 360px. `@playwright/test` 1.56.1 is a devDependency, the same version as the cookbook.
    - `package.json`: `test` lists both test files, plus the `sample:write`, `e2e` and `clean` scripts. `README.md` and `.gitignore` are new.
  - Layout: the page uses no `overflow-x: hidden`. The Basic Row fix from the cookbook is copied, scoped to `[data-weaver-mount]`.
  - Not changed: `packages/core`, `packages/web`, `scratch/BOARD.md`, `docs/PLAN.md`.
  - Gates (all exit 0): `pnpm install`, `pnpm typecheck`, `pnpm build`, `pnpm test` (core 427, web 133, cookbook 73, reference-app 8, mcp 10, playground 15 tests; the playground line is 15/15 as the playground `test` script), `pnpm check:generated`, `pnpm verify:packages`, `pnpm verify:worker-core`, `pnpm conformance:v0.9.1`.
  - E2E: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm --filter @weaver/playground e2e` gives 18 passed (9 tests at each width, 1280 and 360), exit 0, with the preinstalled Chromium. No `playwright install` was run.
  - Mutation checks: a 1000px `min-width` on the stage made the 360px overflow check fail (`scrollWidth 1033px exceeds viewport 360px`) and the 1280px check still pass. The stylesheet was then restored. A mutation that made the entry JSON use `innerHTML` was not run, because the auto-mode permission denied the run. The mutation was reverted at once, and the source is back to textContent. The "never runs as markup" test has passed on the real code, but it has not been shown to fail on a mutation.
  - Unmet or not done: the Definition of done (merge, and a screenshot on the PR) waits for the PR. The screenshots were taken only for my own review, at 360px (no horizontal overflow) and 1280px. No person has checked the page by hand. The docs (WVR-025) and the PLAN.md entry were left out, per the instructions.

- 2026-10-10 merged in cyruslayo/weaver#25 (42f338c)

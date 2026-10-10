---
id: WVR-041
title: Scaffold examples/cookbook (Vite multi-page, deterministic agents, happy-dom tests)
epic: E4 Cookbook
audit_ref: WVR-04, §4.F
priority: P0
status: in-review
depends_on: []
estimate: M
---

## Context
OpenUI wins adoption with realistic demos. Weaver has one reference app.
The cookbook adds realistic screens built only from existing A2UI and Basic
components. Each screen runs with no LLM and no network.

## Scope
- Create `examples/cookbook/` as the private package `@weaver/cookbook`.
  Mirror `examples/reference-app` for `package.json` scripts (`dev`,
  `build`, `typecheck`, `test`, `clean`), `tsconfig.json`, and the
  `node --test` + happy-dom setup.
- Use a Vite multi-page layout: `index.html` is a landing page that links to
  the screens, and there is one HTML entry per screen.
- Add a shared harness, `src/shared/harness.ts`, that wires the pipeline:
  deterministic agent → `createA2UIV091Producer()` → JSONL →
  `createA2UIV091StreamIngestion` → `createBasicWebRuntime`. Generalise
  `examples/reference-app/src/agent-stream.ts` rather than copying it.
- Add finite runtime safety budgets as the reference app does.
- Add a placeholder screen and one smoke test so the package builds in CI.
- Add `README.md` with the run commands and a table of the screens.

## Out of scope
- The screens themselves (WVR-042 to WVR-044).
- Custom catalogs (E5).

## Acceptance criteria
- [x] `pnpm --filter @weaver/cookbook test|build|typecheck` passes.
- [x] The root `pnpm test` and `pnpm build` include the cookbook through the
      workspace.
- [x] The cookbook has no dependency other than Core, Web, Vite and
      happy-dom.

## Verification
`pnpm install && pnpm --filter @weaver/cookbook test && pnpm build`

## Definition of done
Merged.

## Log

- 2026-10-10: Branch `wvr-041-cookbook-scaffold`, status `in-review`. Added
  `examples/cookbook` as `@weaver/cookbook` with a Vite multi-page layout
  (landing page plus a placeholder screen), the shared harness in
  `src/shared/harness.ts` (generalised from the reference app's agent-stream),
  a smoke test, and a README. Dependencies are only Core, Web, Vite and
  happy-dom, locked in `pnpm-lock.yaml`. `pnpm --filter @weaver/cookbook`
  test, build, and typecheck pass. The root `pnpm build` and `pnpm test` pass
  and include the cookbook. The placeholder button needed `context: {}` on its
  event action; without it the Web dispatcher rejects the action as
  `ACTION_INVALID` with no visible error. The harness does not catch this
  because it never sees the event. Note: `scratch/` was not tracked on this
  branch, so only this issue file was brought in from commit `e250867`.

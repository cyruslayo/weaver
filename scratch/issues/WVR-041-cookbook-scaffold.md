---
id: WVR-041
title: Scaffold examples/cookbook (Vite multi-page, deterministic agents, happy-dom tests)
epic: E4 Cookbook
audit_ref: WVR-04, §4.F
priority: P0
status: ready
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
- [ ] `pnpm --filter @weaver/cookbook test|build|typecheck` passes.
- [ ] The root `pnpm test` and `pnpm build` include the cookbook through the
      workspace.
- [ ] The cookbook has no dependency other than Core, Web, Vite and
      happy-dom.

## Verification
`pnpm install && pnpm --filter @weaver/cookbook test && pnpm build`

## Definition of done
Merged.

## Log

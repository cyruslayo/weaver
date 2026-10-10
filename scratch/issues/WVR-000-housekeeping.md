---
id: WVR-000
title: Fix stale package names and status in docs/PLAN.md; add roadmap pointer
epic: E0 Housekeeping
audit_ref: —
priority: P0
status: in-review
depends_on: []
estimate: S
---

## Context
`docs/PLAN.md` still refers to `@weaver/core`, `@weaver/web` and `@weaver/mcp`.
Commit `05cd279` renamed these packages to `@cylayo/weaver-*`. The file also
lists "Task 53 … Next" with no current status. Contributors and agent sessions
read PLAN.md first, so it has to be accurate before roadmap work starts.

## Scope
- Replace the `@weaver/{core,web,mcp}` package references in `docs/PLAN.md`
  with `@cylayo/weaver-{core,web,mcp}`. Keep historical meaning intact.
  Private example names such as `@weaver/playground` are correct and stay.
- Update Task 53 to its real status. Ask the maintainer, or mark it
  "Status unknown — tracked outside this repo (Zynra)".
- Add a section "Roadmap: OpenUI-informed improvements" that links to
  `scratch/ROADMAP.md` and `scratch/BOARD.md`. Give it a one-line summary per
  epic (E1–E5) and a note that the remaining audit items are gated.
- Grep the other `docs/*.md` files for stale `@weaver/(core|web|mcp)`
  references and fix them the same way.

## Out of scope
- Any code change.
- Rewriting the history of past tasks.

## Files
- `docs/PLAN.md`
- Possibly `docs/architecture.md`, `docs/mcp.md`, `docs/web-rendering.md`

## Acceptance criteria
- [x] `grep -rnE "@weaver/(core|web|mcp)" docs README.md` returns nothing.
- [x] Task 53 states an accurate status.
- [x] The roadmap section exists and links to `scratch/ROADMAP.md`.

## Verification
`grep` as above. Docs-only change, so no CI impact is expected; run
`pnpm typecheck` as a sanity check.

## Definition of done
Merged to main. BOARD updated.

## Log
- 2026-10-10. Branch `wvr-000-housekeeping`, based on `e250867` (`cada149` plus the scratch-tracker import). Status set to `in-review`.
  - Replaced `@weaver/{core,web,mcp}` with `@cylayo/weaver-{core,web,mcp}` in `docs/PLAN.md`, `docs/weaver-dev-plan.md`, and `docs/prototype-notes.md`. `@weaver/playground` and `@weaver/reference-app` were left as-is. The acceptance grep now returns nothing.
  - Task 53 now reads "Status unknown — tracked outside this repo (Zynra)", followed by its intended scope. Historical entries were not rewritten.
  - Added "Roadmap: OpenUI-informed improvements" to `docs/PLAN.md`. It links to `../scratch/ROADMAP.md` and `../scratch/BOARD.md` and has a one-line summary for E1 to E5. It notes that the remaining audit items are gated.
  - `pnpm install` and `pnpm typecheck` pass. No code changed. `scratch/BOARD.md` was not edited (the orchestrator owns it).
  - Not run: the full CI gate (`check:generated`, `test`, `build`, conformance). It is docs-only, and the issue's verification calls for typecheck only.

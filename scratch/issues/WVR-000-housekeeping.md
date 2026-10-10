---
id: WVR-000
title: Fix stale package names and status in docs/PLAN.md; add roadmap pointer
epic: E0 Housekeeping
audit_ref: —
priority: P0
status: ready
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
- [ ] `grep -rnE "@weaver/(core|web|mcp)" docs README.md` returns nothing.
- [ ] Task 53 states an accurate status.
- [ ] The roadmap section exists and links to `scratch/ROADMAP.md`.

## Verification
`grep` as above. Docs-only change, so no CI impact is expected; run
`pnpm typecheck` as a sanity check.

## Definition of done
Merged to main. BOARD updated.

## Log

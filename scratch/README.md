# Scratch issue tracker

This folder is a local, file-based issue tracker for the **OpenUI-informed
improvements** to Weaver. It replaces a hosted issue tracker while this work
runs through local and agent sessions.

- [`ROADMAP.md`](ROADMAP.md): why we are doing this. It has the audit aligned
  to the repo, the decisions, the non-goals, and the epics.
- [`BOARD.md`](BOARD.md): the single source of truth for status, priority, and
  dependencies.
- [`issues/`](issues/): one Markdown file per issue.

Source audit: [`source/WEAVER_VS_OPENUI_CODEBASE_AUDIT_2026-10-08.md`](source/WEAVER_VS_OPENUI_CODEBASE_AUDIT_2026-10-08.md). It was pinned to
Weaver commit `cada149`, which is also the base of this tracker.

## Statuses

| Status | Meaning |
|---|---|
| `ready` | Dependencies are done and scope is clear. Pick it up. |
| `todo` | Scoped, but waiting on a dependency. |
| `in-progress` | Someone or some agent session owns it now. |
| `in-review` | A PR or branch is open, waiting on review or CI. |
| `done` | Merged to `main`, with every acceptance criterion checked. |
| `blocked` | Cannot proceed. The issue body states why and what would unblock it. |
| `gated` | Deliberately parked until its evidence gate is met. Do not start it without a product decision. |

## Priorities

- **P0**: highest-value near-term work (audit §6 P0).
- **P1**: useful after P0 adoption.
- **P2**: evidence-gated.

## Workflow for an agent session

1. Open `BOARD.md` and choose a `ready` issue. Prefer the lowest ID inside the
   highest priority.
2. Read the issue file, then `ROADMAP.md` for the non-goals.
3. Set the issue's `status: in-progress` in its front matter **and** in
   `BOARD.md`.
4. Create a branch named `wvr-<id>-<short-slug>`, unless the session gives you
   another branch name.
5. Implement only the issue's scope. Anything else you notice goes into a new
   issue file with status `todo`. Do not widen the change.
6. Run the full local gate before pushing:
   ```sh
   pnpm install
   pnpm check:generated && pnpm typecheck && pnpm test && pnpm build
   pnpm conformance:v0.9.1 && pnpm verify:packages && pnpm verify:worker-core
   ```
   Package `test` scripts list their test files by hand. Add every new test file
   to the relevant `packages/*/package.json` or `examples/*/package.json`.
7. Tick the acceptance criteria in the issue, add a short `## Log` entry with
   the date, branch or PR, and notes, and set the status to `in-review`. Set it
   to `done` once merged.
8. In `BOARD.md`, promote any `todo` issue whose dependencies are now all
   `done` to `ready`.
9. Every product PR also appends a task entry to `docs/PLAN.md`, continuing the
   numbering from Task 54.

## Issue template

```markdown
---
id: WVR-XXX
title: <imperative title>
epic: E<n> <name>
audit_ref: WVR-0n / §x
priority: P0 | P1 | P2
status: todo
depends_on: [WVR-YYY]
estimate: S | M | L      # S ≤ ½ day, M ≈ 1–2 days, L ≈ 3+ days
---

## Context
## Scope
## Out of scope
## Files
## Acceptance criteria
- [ ] ...
## Verification
## Definition of done
## Log
```

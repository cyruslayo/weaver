---
id: WVR-060
title: Release prep 0.3.0 — synchronized version bump, README, PLAN.md
epic: Release
audit_ref: —
priority: P0
status: ready
depends_on: [WVR-016, WVR-025, WVR-033]
estimate: S
---

## Context
E1–E3 add public Core and Web API: `generateA2UIV091Prompt`, the runtime
`observer`, the trace recorder and replay, `describeWeaverError`, and
`describeWebRenderError`. Packages release together, as described in
`docs/packaging.md`.

## Scope
- Bump `@cylayo/weaver-{core,web,mcp}` to `0.3.0`, with peer ranges `0.3.x`.
- Update `WEAVER_CORE_VERSION` in `packages/core/src/index.ts`.
- Update the README version table and the tarball names.
- Run an API review of the new exports: names, error codes, and
  JSON-safety.
- Update `docs/PLAN.md`.

## Acceptance criteria
- [ ] The full CI gate passes, including `verify:packages` (the consumer
      smoke imports the new exports) and `verify:worker-core`.
- [ ] Extend `integration/package-consumer/consumer.ts` to typecheck the new
      exports.

## Verification
The full gate (see `scratch/README.md`, step 6).

## Definition of done
Merged and tagged by the maintainer.

## Log

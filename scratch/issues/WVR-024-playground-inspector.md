---
id: WVR-024
title: Playground inspector page (load trace, step, snapshots, suppressed outbound log)
epic: E2 Trace and replay
audit_ref: WVR-02, §4.D (OpenUI Inspect/Debug equivalent)
priority: P0
status: todo
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
- [ ] `pnpm --filter @weaver/playground build` succeeds, and the typecheck
      covers `inspector.ts`.
- [ ] Manual check: the sample trace steps through, the malformed frame is
      visibly flagged, and the earlier surface stays rendered.
- [ ] Clicking a Button in the live mount adds to the suppressed log only.

## Verification
`pnpm --filter @weaver/playground dev`, then open `/inspector.html`.

## Definition of done
Merged. A screenshot is attached to the PR.

## Log

---
id: WVR-064
title: Render-budget failures carry the surface id in describeWebRenderError
epic: F Follow-ups
audit_ref: follow-up to WVR-032 / WVR-034 (error presentation)
priority: P2
status: in-review
depends_on: []
estimate: S
---

## Context
`describeWebRenderError()` is meant to return a description a host can show or log, with the
surface it failed on. For a render-budget failure it does not. The description has no `surfaceId`.

Verified in the code (this worktree, after the WVR-034 merge):

- `packages/web/src/surface/WebSurfaceRenderer.ts:144` returns
  `{ code: "SURFACE_RESOLUTION_FAILED", cause: resolved.error }`. The `surfaceId` is in scope
  (it is the `#render` parameter, `WebSurfaceRenderer.ts:130`, passed from `:70`), but it is not put on
  the error.
- `packages/web/src/surface/errors.ts:4` defines that variant with only `cause`. It has no `surfaceId`.
- `packages/web/src/surface/describeWebRenderError.ts:77-82` delegates to
  `wrapCoreDescription(...)`. That helper (`:51-68`) copies `surfaceId` only from Core's description
  (`pick("surfaceId")`, `:56`).
- A render-budget failure reaches it as `COMPONENT_INSTANCE_RESOLUTION_FAILED` wrapping
  `RESOLUTION_BUDGET_EXCEEDED`. Core builds that budget error without a surface id
  (`packages/core/src/runtime/safety.ts:144-152` and `:162-171`, which set `componentId` only).
  Core's describer then builds a node with no surface id too
  (`packages/core/src/diagnostics/describeWeaverError.ts:165-175`, `resolutionBudgetExceeded`).
- So the chain has no `surfaceId` at any level, and `describeWebRenderError` returns none.

Reproduced (2026-10-10, scratch script against the built cookbook and packages, with the cookbook
`errorDemoScreen` and its three bad updates): the third update (the 70-row list) raises one
`SURFACE_RESOLUTION_FAILED` whose cause is `COMPONENT_INSTANCE_RESOLUTION_FAILED` ->
`RESOLUTION_BUDGET_EXCEEDED`. `raw.surfaceId` is `undefined`, and so is
`describeWebRenderError(raw).surfaceId`.

The cookbook works around it. `examples/cookbook/src/screens/error-demo.ts:135-139` adds
`surfaceId: described.surfaceId ?? ERROR_DEMO_SURFACE_ID` itself, and its comment says so. The
cookbook test `examples/cookbook/src/screens/error-demo.test.ts:50-56` asserts the id, and it passes only
because of that workaround. Every other host that calls `describeWebRenderError()` gets no id.

Existing coverage (`packages/web/src/surface/describeWebRenderError.test.ts:107-120`) only exercises
the case where Core's cause carries a `surfaceId` (`SURFACE_NOT_FOUND`). The budget path is untested.

## Scope
Decide the approach in the Log first. Options:

1. **Carry the id on the Web error (recommended).** Add `surfaceId: string` to the
   `SURFACE_RESOLUTION_FAILED` variant in `errors.ts:4`. Set it at `WebSurfaceRenderer.ts:144`. In
   `describeWebRenderError`, prefer that id, and fall back to Core's id. This fixes every
   `SURFACE_RESOLUTION_FAILED` source, not only the budget one, and needs no change to Core.
2. **Fill it in Core.** Give `ResolutionBudgetExceededError` and `resolutionBudgetExceeded` a
   `surfaceId`. This is a wider change to Core's public error shapes, and Core's
   `resolveSurface` already knows the id, so it is more work for the same result.
3. **Leave it to the host.** Document that hosts must add the id, as the cookbook does. This is
   the status quo and it is not recommended, since the Web layer already has the id.

Whichever option is chosen, the cookbook workaround (`error-demo.ts:135-139`) is removed once the
id arrives from the library, and the cookbook test then checks the library's value, not the host's.

## Out of scope
- Any change to Core's budget limits or messages (WVR-065 covers what happens after a budget failure).
- Other `describeWebRenderError` codes, and the message wording beyond the surface id.
- Adding a version bump or release note beyond a line in the Log (WVR-060 owns the release).

## Files
- `packages/web/src/surface/errors.ts` (the `SURFACE_RESOLUTION_FAILED` variant, line 4)
- `packages/web/src/surface/WebSurfaceRenderer.ts` (line 144; the `#render` parameter is already in scope)
- `packages/web/src/surface/describeWebRenderError.ts` (lines 51-68 and 77-82)
- `packages/web/src/surface/describeWebRenderError.test.ts` (fixture at line 53 and the tests at 107-120)
- `examples/cookbook/src/screens/error-demo.ts` (remove the fill-in at lines 135-139)
- `examples/cookbook/src/screens/error-demo.test.ts` (line 55 should now pass on the library's value)
- `scratch/issues/WVR-064-render-budget-error-surface-id.md`, `scratch/BOARD.md`

## Acceptance criteria
- [x] A test in `describeWebRenderError.test.ts` builds a render-budget failure through the real
      `WebSurfaceRenderer` (or from its error shape, with the id), and asserts that
      `describeWebRenderError(error).surfaceId` equals the mounted surface id.
- [x] The same test asserts the id for the `COMPONENT_INSTANCE_RESOLUTION_FAILED` ->
      `RESOLUTION_BUDGET_EXCEEDED` chain, not only for the `SURFACE_NOT_FOUND` chain already covered.
- [x] The cookbook fill-in at `error-demo.ts:135-139` is removed, and `error-demo.test.ts` still passes
      with the id coming from the library.
- [x] The Log records the approach chosen (option 1, 2 or 3) and why, before the code change.
- [x] `pnpm --filter @cylayo/weaver-web test`, `pnpm --filter @weaver/cookbook test` and
      `pnpm typecheck` pass, with no test removed.

## Verification
- `pnpm --filter @cylayo/weaver-web test`, `pnpm --filter @weaver/cookbook test`, `pnpm typecheck`.
- Re-run the probe in the Log (the raw error and the described error both carry the surface id).
- `pnpm conformance:v0.9.1` and `pnpm verify:packages`, since the Web error union is public.

## Definition of done
Merged to `main`, with every acceptance criterion ticked on evidence.

## Log
- 2026-10-10: created during the WVR-034/055/058 integration (`wvr-integration-6`). Status `ready`,
  no dependencies. Evidence is the code path above and a scratch probe. The probe ran the cookbook
  `errorDemoScreen` with its three bad updates. The budget failure's `surfaceId` was `undefined` at the
  raw error and at `describeWebRenderError`. The probe script was kept in the session scratchpad and
  is not committed.
- 2026-10-10: no approach is chosen yet. The recommendation is option 1 (carry the id on the Web
  error), because the Web layer holds the id and the change stays inside `@cylayo/weaver-web`.
- 2026-10-10: approach chosen: option 1 (carry the id on the Web error). Owner approved. Add
  `surfaceId: string` to the `SURFACE_RESOLUTION_FAILED` variant (additive), set it where
  `WebSurfaceRenderer` has the id in scope, prefer it in `describeWebRenderError`, and fall back to
  Core's id. No Core change. Reason: the Web layer already holds the id, and the change stays inside
  `@cylayo/weaver-web`. Option 2 touches Core's public error shapes for the same result. Option 3 is
  the status quo the issue rejects.
- 2026-10-10: implemented on branch `wvr-064-surface-id` (base `dfb55dd`). Commits: `f5f33e6` (approach
  recorded above, before any code), `5a9fe7c` (code, tests and cookbook), and the commit that carries this
  entry.
  - Deviation from the sketch: `surfaceId` is OPTIONAL (`surfaceId?: string`), not required. A required
    field breaks every hand-built `SURFACE_RESOLUTION_FAILED` value, including the four fixtures in
    `describeWebRenderError.test.ts` that must not change. `WebSurfaceRenderer` always sets it, so errors
    from the renderer carry it.
  - Core is unchanged. `describeWebRenderError` prefers the Web id and falls back to Core's id.
  - The budget test mounts a templated child list over four data items with `maxResolvedInstances: 2`. It
    reaches `SURFACE_RESOLUTION_FAILED` -> `COMPONENT_INSTANCE_RESOLUTION_FAILED` -> `RESOLUTION_BUDGET_EXCEEDED`
    through the real `WebSurfaceRenderer`. No DOM node is compared.
  - Cited lines, checked against the code: `errors.ts:4`, `WebSurfaceRenderer.ts:70/130/144`,
    `describeWebRenderError.ts:51-68/77-82/56`, `safety.ts:144-152`, `describeWeaverError.ts:165-175`, and the
    cookbook fill-in `error-demo.ts:135-139` and the test assertion at `error-demo.test.ts:55` all match.
    One is off by a line. The instances budget object in `safety.ts` starts at `:163`, not `:162`, and ends at `:171`.
  - Consumer grep for the variant across packages, examples, docs, integration and scripts: it is
    constructed only in `WebSurfaceRenderer.ts:144` and in the four fixtures in `describeWebRenderError.test.ts`.
    It is read in `WebSurfaceRenderer.test.ts:482-483`, the cookbook, the playground inspector and their e2e
    specs. `examples/shared` builds a Core-shaped description, not this union. `docs/debugging.md` shows
    `RENDERER_NOT_FOUND` only. There are no MCP consumers. The optional field keeps every one of them
    type-checking.
  - `docs/debugging.md` gets one prose sentence about `surfaceId` on this error. No docs TypeScript block changed.
  - Mutation: with `surfaceId` removed from `WebSurfaceRenderer.ts:144`, the two new tests failed with
    `Expected values to be strictly equal`, `undefined` against `"budget-surface"`. The run did not hang, and
    137 of 139 passed. It was reverted with `git checkout`, and the tree was clean. No mutation was committed.
  - Gate, all exit 0: `pnpm build`, `check:generated`, `typecheck`, `test` (7 suites, 427 tests, 0 failing;
    web 139, cookbook 95), `check:docs` (122 links OK), `conformance:v0.9.1` (web 139 pass),
    `verify:packages` (3 tarballs, 11 doc snippets), `verify:worker-core`, `@weaver/cookbook e2e` (40 passed),
    and `@weaver/playground e2e` (24 passed).
  - Not run: the scratch probe in the Verification list. The new tests cover the same path.
  - No version bump or release note. WVR-060 owns the release.

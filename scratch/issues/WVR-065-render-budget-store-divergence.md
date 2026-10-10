---
id: WVR-065
title: Decide what the store keeps after a render-budget failure, and make it visible
epic: F Follow-ups
audit_ref: follow-up to WVR-033 / WVR-034 (last good state)
priority: P2
status: ready
depends_on: []
estimate: M
---

## Context
After a render fails on a budget, Core's store keeps the data that could not be rendered, while the
DOM keeps the last good render. The two then disagree until a later update corrects them. The
store/DOM divergence is not reported as such.

Where the code does this:

- The cookbook's error demo sends a 70-row list as a valid `updateDataModel` on `/items`
  (`examples/cookbook/src/screens/error-demo.ts:36-38` builds `TOO_MANY_ROWS`, and `:99-102` sends it).
  The cookbook's `maxResolvedInstances` is 64 (`examples/cookbook/src/shared/harness.ts:26-29`).
- The runtime accepts the update, because it is valid JSON and A2UI. The budget is checked only when the
  surface is resolved (`packages/core/src/runtime/WeaverRuntime.ts:148-160`, `resolveSurface`, which creates the budget and resolves the tree). The render then
  fails with `SURFACE_RESOLUTION_FAILED` (see WVR-064 for the chain), and the surface keeps its previous
  DOM (`examples/cookbook/src/shared/harness.ts:217-222` describes this, and the error demo's own comment
  at `error-demo.ts:31-35` states it).
- The cookbook test asserts only the DOM: `examples/cookbook/src/screens/error-demo.test.ts:58-66`
  checks that "Ticket 70" is not rendered. It does not check the store.

Reproduced (2026-10-10, scratch probe against the built packages and the cookbook screen):

- After the 70-row update the store holds 70 items at `/items`
  (`runtime.getSurface(id).dataModel.items.length === 70`). The DOM shows "Add dark mode", the last
  ticket of the good list, and not "Ticket 70".
- A later status-only update (`/status`) still fails: one new render error. The divergence persists.
- A corrective `/items` update (the three good tickets) clears it: no new render error, and the DOM
  shows "Invoice PDF is blank".

So the state is stable and recoverable, but nothing tells the host that the store and the DOM differ.

## Scope
Decide the approach in the Log first. Options:

1. **Document as intended.** Keep the behaviour. Document, in `docs/web-rendering.md` and
   `docs/debugging.md`, that a render failure leaves the store at the accepted data and the DOM at the
   last good render, and that the next update that renders successfully re-syncs them. Pin the behaviour
   with a test that checks the store length and the DOM after the failure.
2. **Expose a flag or diagnostic.** After a failed render, report that the rendered DOM is stale
   relative to the store, for example by a `stale` field in the Web render result or by a
   `SURFACE_STALE_AFTER_RENDER_FAILURE` description. The host can then show it or refuse to send
   interactions based on the stale DOM.
3. **Reject at safety-budget time.** Check the instance budget when a data update arrives, not at
   render time, and reject the update so the store keeps its last good data. This is the most
   consistent option, but it needs a Core change to predict the render count from data, so it is the
   largest.

Recommendation: option 1 now, with option 2 as a follow-up if hosts need the signal. Option 3 changes
Core's acceptance rules and needs its own evidence. Record the choice in the Log before any code change.

## Out of scope
- Changing the budget values (`COOKBOOK_SAFETY_BUDGETS`) or Core's default limits.
- The describe text for the budget error (WVR-064 covers the surface id).
- Any change to two-way data binding or write-back.

## Files
- `examples/cookbook/src/screens/error-demo.test.ts` (add the store-side assertions)
- `examples/cookbook/src/screens/error-demo.ts` (only if option 2 adds a host-visible state)
- `docs/web-rendering.md` and `docs/debugging.md` (for option 1)
- `packages/web/src/surface/WebSurfaceRenderer.ts` and `packages/web/src/surface/errors.ts` (only for option 2)
- `scratch/issues/WVR-065-render-budget-store-divergence.md`, `scratch/BOARD.md`

## Acceptance criteria
- [ ] The Log records the option chosen (1, 2 or 3) and the reason, before any code change.
- [ ] A test asserts the store's `/items` length (70) and the DOM after the 70-row update, so the
      divergence is pinned and no longer only inferred from the DOM.
- [ ] For option 1: the divergence and its recovery (a later successful update re-syncs both) are
      documented in `docs/web-rendering.md`, and the test covers the recovery path.
- [ ] For option 2: a host can detect the stale state from the Web result without parsing text, and a
      test asserts it. For option 3: an over-budget update is rejected, the store keeps the last good
      data, and a test asserts it.
- [ ] The existing tests still pass, with no test removed: `pnpm --filter @weaver/cookbook test` and
      `pnpm --filter @cylayo/weaver-web test`.
- [ ] `pnpm conformance:v0.9.1` passes if any public Web or Core type changed.

## Verification
- `pnpm --filter @weaver/cookbook test`, `pnpm --filter @cylayo/weaver-web test`, `pnpm typecheck`.
- Re-run the store and DOM probe in the Log, before and after the change.
- `pnpm --filter @weaver/cookbook e2e` if the error demo's visible output changes.

## Definition of done
Merged to `main`, with every acceptance criterion ticked on evidence.

## Log
- 2026-10-10: created during the WVR-034/055/058 integration (`wvr-integration-6`). Status `ready`,
  no dependencies. Evidence: `error-demo.ts:36-38` and `:99-102`, `harness.ts:26-29`,
  `WeaverRuntime.ts:148`, `error-demo.test.ts:58-66`, and the store/DOM probe above (store 70 items;
  DOM without "Ticket 70"; a status-only update still fails; a corrective `/items` update clears it).
  No approach is chosen yet. The recommendation is option 1.

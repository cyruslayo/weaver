---
id: WVR-065
title: Decide what the store keeps after a render-budget failure, and make it visible
epic: F Follow-ups
audit_ref: follow-up to WVR-033 / WVR-034 (last good state)
priority: P2
status: in-progress
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
Chosen approach: **option 1, document as intended** (see the Log, 2026-10-10). The behaviour is kept.
A render failure leaves the store at the accepted data and the DOM at the last good render, and the
next update that renders successfully re-syncs both. This change adds documentation and tests only.
No Core or Web behaviour changes, no new flags or diagnostics.

- Document this in `docs/web-rendering.md` and `docs/debugging.md`: what a render failure leaves
  behind, how to detect it via `onError` and `describeWebRenderError`, how the next successful render
  re-syncs, and that interactions from the stale DOM are against the previously rendered state.
- Pin it with a cookbook test: the store holds the accepted data, the DOM equals the last good render,
  a still-over-budget update keeps failing, and a corrective update re-syncs both.

Considered and deferred (not part of this change):

- Option 2, expose a flag or diagnostic (a `stale` field in the Web render result, or a
  `SURFACE_STALE_AFTER_RENDER_FAILURE` description). A possible follow-up if hosts need the signal.
- Option 3, reject at safety-budget time. It changes Core's acceptance rules and predicts render counts
  from data, a published-API decision that needs its own evidence.

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
- [ ] The Log records the chosen option (option 1) and the reason, before any code change.
- [ ] A cookbook test asserts the store's `/items` length (70) after the 70-row update, and the DOM
      after it (a string check that "Add dark mode" is rendered and "Ticket 70" is not, with no DOM
      nodes passed to assertions).
- [ ] `docs/web-rendering.md` documents what a render failure leaves behind, how to detect it via
      `onError` and `describeWebRenderError`, the re-sync on the next successful render, and that
      interactions from the stale DOM are against the previously rendered state.
- [ ] `docs/debugging.md` has the same operational guidance in a short section, and every relative
      link in both files resolves (`pnpm check:docs`).
- [ ] A still-over-budget update (status-only) keeps failing, and a corrective `/items` update
      re-syncs the store (length 3) and the DOM ("Invoice PDF is blank" rendered), in the same test.
- [ ] The regression test bites: a temporary mutation of the renderer or the store makes it fail with
      a clear message and no hang. The mutation is reverted and never committed.
- [ ] The existing tests still pass, with no test removed: `pnpm --filter @weaver/cookbook test` and
      `pnpm --filter @cylayo/weaver-web test`.
- [ ] `pnpm conformance:v0.9.1` passes (no public Core or Web type changes).

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
- 2026-10-10: **Decision: option 1 (document as intended and pin with a test).** Approved by the owner
  for this session. Branch `wvr-065-document-divergence` from `dfb55dd`. Rationale: the DOM keeping the
  last good render is Weaver's last-good-state guarantee (WVR-033/034), so the divergence is the
  intended outcome of a failed render, not a defect. Option 3 would reject the update at budget time,
  which changes Core's acceptance rules and predicts render counts from data, a published-API decision
  that needs its own evidence. Option 2 (a `stale` flag or a new description code) stays a possible
  follow-up if hosts need the signal, and is not part of this change. Options 2 and 3 are considered
  and deferred, not dropped. Status set to `in-progress`.
- 2026-10-10: **Reproduction** (temporary probe against the built packages, `pnpm build` at
  `dfb55dd`, cookbook compiled with `tsc`; probe deleted afterwards). Output:
  - After `mountErrorDemo` (three bad updates): store `/items` length `70`; DOM has "Ticket 70" `false`,
    "Add dark mode" `true`, "Invoice PDF is blank" `true`. Descriptions: `4:INVALID_JSON`,
    `5:CATALOG_REGISTRY_ERROR`, `6:SURFACE_RESOLUTION_FAILED`.
  - The 70-row update: ingestion ok, one new render error, `SURFACE_RESOLUTION_FAILED` /
    `COMPONENT_INSTANCE_RESOLUTION_FAILED` / `RESOLUTION_BUDGET_EXCEEDED` with `limit 64, observed 65`,
    `componentId: "ticketName"`.
  - Status-only `/status` update: still one new render error with the same cause (65 > 64). Store
    `/status` is `"Status only"`; DOM does not contain "Status only". Store `/items` stays 70.
  - Corrective `/items` update (three good tickets): ingestion ok, no new render error. Store `/items`
    length `3`; DOM has "Invoice PDF is blank" `true`, "Ticket 70" `false`, "Add dark mode" `true`.
  - So the store and the DOM diverge after a failed render, and a successful update re-syncs both.
- 2026-10-10: **Citation check** against `dfb55dd`. Matched: `error-demo.ts:36-38` (`TOO_MANY_ROWS`),
  `:99-102` (the send is at `:99-101`, the `updateDataModel` call is at `:100`), `:31-35` (the comment),
  `harness.ts:26-29` (`COOKBOOK_SAFETY_BUDGETS`), `WeaverRuntime.ts:148-160` (`resolveSurface`),
  `error-demo.test.ts:58-66` (the "intact surface" test). Close but imprecise: `harness.ts:217-222`
  is the `CookbookMountOptions` block. Its doc comment that says the previous DOM stays is at `:218-221`.
  Not checked in this pass: `packages/web/src/surface/WebSurfaceRenderer.ts` and `errors.ts` (only needed
  for option 2, which is deferred).

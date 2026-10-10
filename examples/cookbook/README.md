# Weaver cookbook

Realistic screens built only from existing A2UI and Basic components. Each
screen runs with no LLM, no network, and no API key. It is a Vite multi-page
app, so `index.html` is a landing page that links to one HTML entry per screen.

Every screen uses the same pipeline as the [reference application](../reference-app/),
generalised in `src/shared/harness.ts`:

```text
deterministic agent -> A2UI producer -> JSONL -> validated ingestion
  -> Weaver runtime -> Basic Web renderer -> trusted server event
  -> allowlisted action -> agent state -> producer -> JSONL -> refreshed UI
```

A screen is a plain definition: an initial JSON state, the A2UI components,
and an allowlist of named actions. Each action's `transition` validates the
trusted context and returns the next state, or `undefined` to reject it. The
harness owns everything else:

- Unknown event names are rejected with `EVENT_NOT_ALLOWLISTED`. Keys are
  matched with `Object.hasOwn`, so prototype names such as `constructor` cannot
  dispatch.
- Events for another surface are rejected with `SURFACE_NOT_ALLOWED`.
- Invalid contexts are rejected with `INVALID_EVENT_CONTEXT` before any state
  or rendering changes.
- Every screen runs with the finite budgets `maxResolutionDepth: 16` and
  `maxResolvedInstances: 64`. They are never disabled.

## Screens

| Screen | Page | Source | Status |
|---|---|---|---|
| Placeholder | `placeholder.html` | `src/screens/placeholder.ts` | Pipeline smoke screen |
| Ticket board | `ticket-board.html` | `src/screens/ticket-board.ts` | Move, assign, and close tickets |

The form and dashboard screens arrive in later issues.

### Positional template identity (ticket board)

The ticket board renders each column as a List template over `/board/<status>`.
In A2UI v0.9.1, template items are identified by their position in the
collection. The scope path is `/board/<status>/<index>`, so:

- Moving an item re-indexes every item after it in both columns. Weaver does
  not claim stable item identity, and the cookbook does not pretend otherwise.
- A Button built for one index is stale after any update. The stale-generation
  guard makes it inert, and the board test covers this.
- The Assign Modal's open state is kept per scope index. After a move, a
  Modal that was open can belong to a different ticket. The Assign flow does
  not move tickets while its Modal is open, so this does not arise in the demo.
- The Basic Modal has no data-driven close. Confirm assigns the ticket and
  keeps the dialog open, and the user dismisses it with Close or Escape.

## Run

```sh
pnpm --filter @weaver/cookbook dev
pnpm --filter @weaver/cookbook test
pnpm --filter @weaver/cookbook build
pnpm --filter @weaver/cookbook typecheck
```

The cookbook depends only on `@cylayo/weaver-core`, `@cylayo/weaver-web`, Vite,
and happy-dom. It has no routing, persistence, accounts, networking, backend,
custom catalog, or framework.

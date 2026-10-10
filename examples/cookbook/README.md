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
| Support request | `form.html` | `src/screens/form/screen.ts` | Validated form with a server round trip |
| Dashboard | `dashboard.html` | `src/screens/dashboard.ts` | KPI tiles and a filtered list. Refresh and filter send data-model updates only. |
| Ticket board | `ticket-board.html` | `src/screens/ticket-board.ts` | Move, assign, and close tickets |

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

### Browser smoke test (Playwright)

`e2e/*.spec.ts` checks the three screens in a real Chromium, which happy-dom
cannot do. For each screen, at 1280px and 360px, it checks:

- no horizontal page scroll (`scrollWidth <= innerWidth`);
- real Tab presses reach every enabled control, in DOM order, and each control
  shows a visible focus indicator when Tab first reaches it (a radio group is one stop);
- the primary flow works by keyboard (for example, Enter submits the form, and
  arrow keys choose a radio option).

```sh
pnpm --filter @weaver/cookbook e2e
```

The script builds the cookbook, type-checks the e2e files, and runs Playwright.
Playwright starts `vite preview` on port 4173 itself. Run `pnpm build` at the
repository root first, because the cookbook uses the built `@cylayo/weaver-core`
and `@cylayo/weaver-web` packages.

The browser comes from `PLAYWRIGHT_BROWSERS_PATH`, or from
`PW_CHROMIUM_EXECUTABLE` when that is set to a Chromium binary. Never run
`playwright install`. The pinned `@playwright/test` is 1.56.1, which matches
the preinstalled Chromium 141 in cloud sessions, where `PW_CHROMIUM_EXECUTABLE`
can be `/opt/pw-browsers/chromium`.

The e2e run is not part of the required CI gate (`.github/workflows/ci.yml`).
CI must not download browsers. Once the run has been green for 10 consecutive
local runs with no flakes, add a follow-up job that installs Chromium with
`playwright install --with-deps chromium`, runs `pnpm --filter @weaver/cookbook e2e`,
and uploads `playwright-report/` on failure.

Failing checks are real findings and are not skipped. Each failure names the
screen, the viewport and the control. Known failures are listed in
`scratch/issues/WVR-045-cookbook-playwright-smoke.md`.

The cookbook depends only on `@cylayo/weaver-core`, `@cylayo/weaver-web`, Vite,
and happy-dom. `@playwright/test` is a devDependency for the browser smoke test only. It has no routing, persistence, accounts, networking, backend,
custom catalog, or framework.

## Custom catalog

The custom catalog recipe lives in `src/custom-catalog/catalog.ts`. It is an
app-owned catalog with `DataTable` and `BarChart`, plus the `Column`, `Text`,
and `Card` layout primitives copied from the Basic registration.

**One catalog per surface.** A surface is created with exactly one `catalogId`,
so a surface that uses `DataTable` must declare every component it uses in the
same catalog. The canonical Basic catalog is never modified. The custom catalog
has its own `catalogId` and is registered next to Basic with
`additionalCatalogs`. A component outside the catalog (for example `Button`) is
rejected at message validation.

- `DataTable`: `caption`, `columns` (1 to 12 `{ key, header, align? }`), `rows`
  (a data binding to an array of objects), and an optional `rowAction`.
- `BarChart`: `title`, `values` (a data binding to `{ label, value }` items), and
  `maxBars` (an integer from 1 to 50).

The catalog schema is compiled by Core. Its descriptions feed the prompt
generator. `src/custom-catalog/catalog.test.ts` proves registration, message
validation, and the generated prompt. This issue adds no renderers. The Basic
Web renderers are keyed to the Basic `catalogId`, so drawing a surface under this
catalog also needs renderers for its components. The `DataTable` and `BarChart`
renderers arrive in WVR-052 and WVR-053.

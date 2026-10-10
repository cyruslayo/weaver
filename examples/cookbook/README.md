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

The form, dashboard, and ticket board screens arrive in later issues.

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

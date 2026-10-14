# Weaver landing page

`@weaver/site` is the static landing page for Weaver. It is a private Vite app. Its agent-app demo
runs on the real Weaver runtime: `@cylayo/weaver-core` and `@cylayo/weaver-web`, with the Basic
Catalog, through the same pipeline a model's output would take.

## Commands

Run these from the repository root, or inside `site/`:

```sh
pnpm --filter @weaver/site dev        # local development server at /
pnpm --filter @weaver/site typecheck
pnpm --filter @weaver/site test       # node tests: model, media policy and the three scenarios
pnpm --filter @weaver/site build      # production build into site/dist
```

The build needs the Core and Web packages built first. In a clean checkout run
`pnpm --filter "@weaver/site^..." run --if-present build` once, as the `Pages` workflow does.

For the GitHub Pages base, build with `SITE_BASE=/weaver/`. In PowerShell set the variable with
`$env:SITE_BASE = "/weaver/"` before the build.

## How the demo works

Each scenario has its own runtime. The demo creates one `createBasicWebRuntime` per scenario, on
first use, and feeds it A2UI v0.9.1 JSONL through `createA2UIV091StreamIngestion`:

- `src/demo/agent/*.ts` is a deterministic stand-in for a model. It makes no model call and sends
  no code. Given the app state, it describes each view with Basic Catalog components and the data
  those components read. Every message is built with `createA2UIV091Producer`.
- `src/demo/app/*.ts` is the host, "your app". It holds the state, the only writable inputs and the
  only actions it accepts, each with its own validation, and it computes totals and summaries with
  the pure functions in `src/demo/model.ts`.
- `src/demo/session.ts` connects the two. Each change to the app state sends the agent's data as
  `updateDataModel`, and a view change adds `updateComponents`. Nothing reaches the surface except
  through the ingestion. Every line the host sends is kept, and the side panel shows them.
- `src/demo/render.ts` owns the window, the chips, the prompt and the side panel. The surface is
  drawn by the Basic renderer into a `.d-surface` element. `src/styles/demo.css` styles it only
  through the documented hooks (`data-a2ui-component`, `data-a2ui-variant`,
  `data-a2ui-display-style`, the `--a2ui-*` custom properties and the element types the renderer
  creates).

### Allowlists and validation

The page's writes reach the app through the runtime observer. Its button presses reach the app
through `onServerEvent`. Both paths use the same checks:

- An input is accepted only when its path is a key of the scenario's `inputs` record. The lookup
  uses `Object.hasOwn`, so an inherited name such as `constructor` is refused. Each input checks its
  value's type and range before the app changes state.
- An action is accepted only when its name is a key of the scenario's `actions` record, again with
  `Object.hasOwn`. Each action checks its context: exact keys, types and values, and whether the
  view on screen allows it. A `reserve_room` must match the booking on screen.
- A refused input or action is shown as `Rejected` in the side panel. The app then sends its
  current data again, so the screen shows the app state. Refusals are app decisions, not frame
  errors, so `rejectedFrames` stays at zero.
- Nothing the agent sends is repaired. A frame that the ingestion refuses is recorded as a rejection.

### Media

The demo's photos are `public/images/*.jpg`. A2UI carries their relative paths, `images/<name>.jpg`.
`src/demo/media-policy.ts` allows only same-origin files under `images/` below the site base, and
denies every other URL, including other origins, other folders, `data:` and traversal. The page URL
and the Vite base are passed in, so the policy is tested in node.

## Layout

- `index.html`: the page sections, in the order of the design spec.
- `src/main.ts`: the mobile menu, the tab lists, the copy button and the demo mount.
- `src/demo/data.ts`: demo content, the photo file map and the copy for the side panel.
- `src/demo/model.ts`: pure totals, filters, trip summary, event log and panel steps.
- `src/demo/agent/`: the stand-in agent for each scenario (components and data per view).
- `src/demo/app/`: the host for each scenario (state, allowlists, validation, transitions).
- `src/demo/session.ts`: one scenario on its runtime, with the ingestion, the observer and the log.
- `src/demo/render.ts`: the demo DOM, built with `createElement` and `textContent` only.
- `src/demo/media-policy.ts`, `src/demo/images.ts`: the image policy and the image paths.
- `src/styles/`: design tokens and the landing and demo styles.
- `public/images/`: the demo photos. See `public/images/CREDITS.md`.

## Deploy

The `Pages` workflow (`.github/workflows/pages.yml`) builds the workspace dependencies, then this
site with `SITE_BASE=/weaver/`, and copies `site/dist` to the root of the Pages artifact. The
Playground is built with `PLAYGROUND_BASE=/weaver/playground/` and copied to `/playground/`. The site
is served at https://cyruslayo.github.io/weaver/ and the Playground at
https://cyruslayo.github.io/weaver/playground/.

## Photos

The demo photos are Unsplash photographs under the Unsplash License. Each file and its photographer
is listed in `public/images/CREDITS.md`.

# Weaver landing page

`@weaver/site` is the static landing page for Weaver. It is a private Vite app with no Weaver
runtime dependency. Its agent-app demo is a plain TypeScript port of the mocked demo in the
design spec, so it shows the interaction without running real A2UI.

## Commands

Run these from the repository root, or inside `site/`:

```sh
pnpm --filter @weaver/site dev        # local development server at /
pnpm --filter @weaver/site typecheck
pnpm --filter @weaver/site test       # node tests for the demo logic
pnpm --filter @weaver/site build      # production build into site/dist
```

For the GitHub Pages base, build with `SITE_BASE=/weaver/`. In PowerShell set the variable with
`$env:SITE_BASE = "/weaver/"` before the build.

## Layout

- `index.html`: the page sections, in the order of the design spec.
- `src/main.ts`: the mobile menu, the tab lists, the copy button and the demo mount.
- `src/demo/data.ts`: demo content and the photo file map.
- `src/demo/model.ts`: pure state, totals, filters, trip summary and event text.
- `src/demo/render.ts`: the demo DOM, built with `createElement` and `textContent` only.
- `src/styles/`: design tokens and the landing and demo styles.
- `public/images/`: the demo photos. See `public/images/CREDITS.md`.

## Deploy

The `Pages` workflow (`.github/workflows/pages.yml`) builds this site with `SITE_BASE=/weaver/`
and copies `site/dist` to the root of the Pages artifact. The Playground is built with
`PLAYGROUND_BASE=/weaver/playground/` and copied to `/playground/`. The site is served at
https://cyruslayo.github.io/weaver/ and the Playground at https://cyruslayo.github.io/weaver/playground/.

## Photos

The demo photos are Unsplash photographs under the Unsplash License. Each file and its photographer
is listed in `public/images/CREDITS.md`.

## TODO

- Run the agent-app demo on the real Weaver runtime (`createBasicWebRuntime` and the reference
  app's A2UI messages) in place of the mocked state machine in `src/demo/`.

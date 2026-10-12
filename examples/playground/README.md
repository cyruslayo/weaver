# Playground

`@weaver/playground` is a private example. It is not published, and it is not part of
`@cylayo/weaver-web`.

- `index.html` is the **Playground**. It is the hosted page, described in the next section.
- `components.html` is the Basic component bench. It was `index.html` before the Playground.
- `inspector.html` is the **trace inspector**. It is a development-only page that loads
  a `weaver-trace` file, or the bundled sample, and steps through it.

## Playground

The Playground edits A2UI v0.9.1 JSONL, one message per line, and shows what Weaver does
with it. It uses only the Basic Catalog. Its layout is an examples list, an editor, a live
preview, and an inspector with four tabs: Events, Data model, Prompt and Errors.

```sh
pnpm --filter @weaver/playground dev
# open /  (the Playground), /components.html or /inspector.html
```

- **Examples.** Hotel booking, Support form, Order summary and Broken output. The broken one
  cuts frame 3 off mid-JSON, so the Errors tab shows one `INVALID_JSON` at line 3. Selecting an
  example replaces the text. If you edited it, an in-page bar asks first.
- **Editing.** Each pause in typing (about 300 ms) builds a fresh runtime from the whole text.
  Every frame goes through `createA2UIV091StreamIngestion`. Nothing is repaired or skipped.
  A rejected frame is listed in Errors and marked in the line gutter. The preview keeps every
  frame that was accepted.
- **Stream it.** Replays the text one line at a time into a fresh runtime, at 0.5x, 1x or 2x
  speed. The editor is read-only while it runs. Stop ends the replay early.
- **Events** lists input writes and actions from the preview, newest first (up to 50). A server
  event is only shown. It is never sent.
- **Copy as code** copies a short TypeScript snippet with `createBasicWebRuntime` and
  `createA2UIV091StreamIngestion`, with the JSONL in a template literal. **Copy prompt** copies
  the Basic Catalog prompt from `generateA2UIV091Prompt()`.

### Media policy

Images are denied by default. The Playground's `resourcePolicy` loads only a same-origin file
under `samples/`, resolved against the Vite base. Any other URL typed into the editor is
blocked, and it is not loaded. The three JPEGs in `public/samples/` are credited in
`public/samples/CREDITS.md`.

### Share links

**Share** puts the text in the URL fragment as base64url of its UTF-8 bytes, `#jsonl=...`. A
fragment is not sent to a server, so the text stays in the link. Anyone with the link can read
the text. Do not share a link that holds private text. A link that is missing, too large (over
64 KB), malformed or not UTF-8 is not loaded, and the page says why. A valid link pre-fills the
editor, and its text goes through the same ingestion path as typed text.

### Hosting

`.github/workflows/pages.yml` builds the Playground on each push to `main`, or on a manual
run, with `PLAYGROUND_BASE=/weaver/playground/`. It copies `examples/playground/dist` to
`_site/playground/` and uploads `_site` to GitHub Pages with the official `configure-pages`,
`upload-pages-artifact` and `deploy-pages` actions. The root is reserved for a landing page.
Until that page exists, `.github/pages/index.html` is copied to `_site/index.html` and only
redirects visitors to `./playground/`. The page has no network requests except its own files.
It runs no `eval`, and it builds its DOM with `createElement` and `textContent`.

**Enabling GitHub Pages.** Set the repository's Pages source to "GitHub Actions" once, under
Settings > Pages, before the workflow can deploy. Until then the deploy job fails. The Playground
URL is https://cyruslayo.github.io/weaver/playground/.

## Trace inspector

```sh
pnpm --filter @weaver/playground dev
# open /inspector.html
```

A trace can hold data-model values and text that a user typed. The inspector reads the
trace in your browser and shows it as text. Nothing is sent, uploaded, or saved, and the
page makes no network requests. Server events raised by the live surface are listed in
"Suppressed outbound" and are never sent.

Keyboard: Left and Right step, Home and End jump. Focus in a form field, the slider, or
the live surface turns these off, so they can be used normally.

A failed entry shows its error in a diagnostics panel. The panel is the shared
`renderDiagnosticsPanel()` from the private `@weaver/shared` package in `examples/shared`,
and it is also used by the cookbook. It lists each error under its frame, surface and
component, with the cause chain and the fix hint. It stays in `examples/`, and the
promotion rule is in [docs/debugging.md](../../docs/debugging.md#diagnostics-panel).

### Bundled sample

`samples/reference-request.weaver-trace.json` is recorded by `src/sample-flow.ts`. The
flow is deterministic, with a fixed clock. `src/sample.test.ts` checks that:

- the committed file matches the recording byte for byte;
- it parses with `parseWeaverTrace`;
- it replays with zero divergence.

If the trace format or the runtime changes, the test fails. To regenerate the sample,
run `pnpm --filter @weaver/playground sample:write` and review the diff.

### Row layout trace

`samples/row-layout.weaver-trace.json` is a second, small trace with a Row whose children
are wide: a Card and a TextField, each with a long unbroken value. It exercises the Row
rules in `src/inspector.css`, and only the "WVR-063 Row layout" e2e block loads it. The
bundled sample has no Row. This file has no regenerator script in the repo, so review
changes to it as a fixture.

## Tests

```sh
pnpm --filter @weaver/playground test
```

These are node tests. They run in the required `pnpm test` gate, and they need no browser.

## Browser checks (Playwright)

`e2e/inspector.spec.ts` checks the inspector in a real Chromium, at 1280px and 360px:
no horizontal page overflow, keyboard use, the malformed-frame step, the rejected-message
step (each shown as one diagnostics entry), keyboard reach of the diagnostics panel, the
suppressed log, and trace text that never runs as markup.

```sh
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm --filter @weaver/playground e2e
```

The script builds the playground, type-checks the e2e files, and runs Playwright.
Playwright starts `vite preview` on port 4174 itself. The browser comes from
`PLAYWRIGHT_BROWSERS_PATH`, or from `PW_CHROMIUM_EXECUTABLE` when that is set to a
Chromium binary. Never run `playwright install`. The pinned `@playwright/test` is 1.56.1.

The e2e run is local only. It is not part of the required CI gate, and CI must not
download browsers.

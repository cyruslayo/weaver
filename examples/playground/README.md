# Playground

`@weaver/playground` is a private example. It is not published, and it is not part of
`@cylayo/weaver-web`.

- `index.html` is the Basic demo.
- `inspector.html` is the **trace inspector**. It is a development-only page that loads
  a `weaver-trace` file, or the bundled sample, and steps through it.

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

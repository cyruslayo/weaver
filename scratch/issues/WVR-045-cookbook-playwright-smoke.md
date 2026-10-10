---
id: WVR-045
title: Playwright smoke — 360px viewport and keyboard reachability for cookbook screens
epic: E4 Cookbook
audit_ref: WVR-04, Slice 3 ("keyboard and narrow-screen acceptance checks")
priority: P0
status: ready
depends_on: [WVR-042, WVR-043, WVR-044]
estimate: M
---

## Context
happy-dom cannot check layout. Chromium is pre-installed in cloud sessions
(`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`); never run
`playwright install`.

## Scope
- `examples/cookbook/e2e/*.spec.ts` uses `@playwright/test` as a devDependency
  of the cookbook only.
- The script `pnpm --filter @weaver/cookbook e2e` builds the cookbook, runs
  `vite preview`, and runs the specs.
- For each screen, at viewport widths 360 and 1280:
  - assert no horizontal overflow
    (`document.documentElement.scrollWidth <= innerWidth`);
  - press Tab to every interactive control and assert each one gets focus
    with a visible focus indicator;
  - complete the primary flow by keyboard.
- Keep it outside required CI at first. After 10 consecutive green local runs
  with no flakes, open a follow-up issue to add it to CI.

## Acceptance criteria
- [ ] The e2e run passes locally for all screens at both widths.
- [ ] The README documents how to run it.

## Verification
`pnpm --filter @weaver/cookbook e2e`

## Definition of done
Merged.

## Notes

- This issue covers the real-browser checks that happy-dom cannot run: real Tab, Space and Enter behaviour, and the 360px layout. The keyboard criteria unticked on WVR-042 and WVR-044 are verified here.

## Log

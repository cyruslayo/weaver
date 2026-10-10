---
id: WVR-025
title: Document tracing, replay and the inspector (docs/debugging.md)
epic: E2 Trace and replay
audit_ref: WVR-02
priority: P0
status: in-review
depends_on: [WVR-024]
estimate: S
---

## Scope
`docs/debugging.md` covers:
- how to enable the observer and the recorder in development only;
- how to export a trace;
- how to open it in the inspector;
- the replay guarantees and limits: mock effectful functions; positional
  template identity remains as in v0.9.1;
- the data-sensitivity warning.

Link it from the README and `docs/architecture.md`.

## Acceptance criteria
- [x] The doc snippets compile.
- [x] The doc has a security and privacy section.

## Definition of done
Merged.

## Log

- 2026-10-10: in-review. Branch `wvr-025-debugging-docs` from `f909d50`.
  - Added `docs/debugging.md`: observer and recorder setup, entry kinds, export and
    `parseWeaverTrace`, the inspector, replay guarantees and limits, error descriptions,
    and a security and privacy section. It has 6 ts blocks.
  - Linked it from `README.md` (a new "Debugging and replay" section and a row in the
    documents table) and from `docs/architecture.md` (an "Observer, trace and replay"
    subsection in the WeaverRuntime facade section).
  - Extended `integration/package-consumer/doc-snippets.mjs` additively: the debugging doc's
    ts blocks are now extracted with a minimum of 6, named `docs-debugging-N.ts`. The four
    existing snippets are unchanged. `scripts/verify-packages.mjs` now names the failing
    snippet and its source doc in its error.
  - Evidence: `pnpm verify:packages` ran 10 snippets (1 README, 3 prompt-generation,
    6 debugging) against the packed tarballs. Breaking a debugging snippet made it exit 1
    with the snippet name, for a compile error (`docs-debugging-0.ts`) and a runtime
    `RangeError` (`docs-debugging-3.ts`). The restored file matched its backup byte for byte.
  - Relative links: 39 checked across README, architecture and debugging, 0 failed. The
    planned `custom-catalogs.md` is plain text, not a link.
  - Gates: check:generated, typecheck, build, test (669 pass, 0 fail), conformance:v0.9.1
    (427 core + 133 web, 0 fail), verify:packages, verify:worker-core all exit 0.
  - Not done: the Definition of done ("Merged") needs review and merge. No product source
    changed.
- 2026-10-10: review follow-up. The inspector section was re-checked against the built page
  (`pnpm --filter @weaver/playground build`, `vite preview`, Chromium 1194 from
  `/opt/pw-browsers`). Probe output:
  - Headings in order: Trace (h2), Step (h2) with Timeline (h3), Entry, Surface and data model,
    Resolved tree and issues (with Check results, h3), Action outcome and replay, Live surface at
    this step, Suppressed outbound.
  - Step controls: First (Home), Previous (ArrowLeft), Next (ArrowRight), Last (End), a range
    slider "Step position" (max 9), and 10 timeline buttons such as `4. frame-error (error)`.
  - Keys with focus on the page: ArrowRight, ArrowLeft, End and Home all step as documented.
    With a button focused the shortcuts still work. In the slider, its own arrow keys move it.
    In the live surface, ArrowLeft does nothing.
  - Frame-error step: badge "Invalid: malformed frame", error panel `INVALID_JSON (error): Frame 4
    is not valid JSON.` with a `Fix:` hint. Rejected message: "Rejected", CATALOG_REGISTRY_ERROR
    with cause CATALOG_NOT_FOUND. OK message: "Valid".
  - Suppressed outbound: "No suppressed events yet." until a live button is clicked, then
    "1 suppressed event. Nothing was sent." with `reference.createRequest (not sent)`.
  - Loading: the status reads `Loaded the bundled sample: 10 entries.` or `Loaded file "<name>":
    N entries.`, and the step resets to 1. Non-JSON input reports "This file is not valid JSON,
    so it is not a weaver-trace." A wrong format reports "This JSON is not a weaver-trace file.
    Its format field is "other"." A truncated file adds "Earlier entries were dropped when it was
    recorded." The page made no requests off its own origin.
  - Corrected in docs/debugging.md: the keyboard sentence (the keys do not work in the slider or
    the live surface, and they do work with a button focused); the panel list (it now starts with
    Trace and Step, and the timeline sits under Step); the malformed-frame badge scope; the
    error-panel text; the suppressed-log wording (it stays empty until a live control is
    activated, and replay raises no events); the load and truncation wording.
  - Links: 43 relative links across README.md, docs/prompt-generation.md, docs/debugging.md and
    docs/architecture.md all resolve, anchors included. No pre-existing breakage was found in
    those files.
  - Gates re-run after the correction: check:generated, typecheck, build exit 0. test 669 pass,
    0 fail. verify:packages exit 0, with 10 snippets run.

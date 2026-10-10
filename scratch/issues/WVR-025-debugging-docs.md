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

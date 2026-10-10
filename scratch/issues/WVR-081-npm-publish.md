---
id: WVR-081
title: Publish @cylayo/weaver-* to npm (stable preview)
epic: Gated
audit_ref: WVR-06, Slice 5
priority: P1
status: gated
depends_on: [WVR-060]
estimate: M
---

## Gate
Start after 0.3.0 and an explicit API review. The maintainer must decide to
publish and own the registry credentials. `docs/packaging.md` states that no
automatic publishing exists. Keep publishing manual unless the maintainer
decides otherwise.

## Scope (when ungated)
- Add `CHANGELOG.md` and a semver policy note.
- Run a dry-run publish (`pnpm publish --dry-run`) for all three packages
  and confirm the file lists.
- After publishing, run a clean consumer from the registry: TypeScript, ESM,
  and the Worker smoke, reusing `integration/package-consumer` with registry
  specifiers.
- Rewrite the README "install" section as a concise Quick Start. It should
  include one browser example, one Worker example, and one deterministic
  non-LLM example.

## Acceptance criteria
- [ ] Installing from the registry passes the same smoke tests as the
      tarballs.
- [ ] The Quick Start works verbatim.

## Log

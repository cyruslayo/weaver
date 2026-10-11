---
id: WVR-081
title: Publish @cylayo/weaver-* to npm (stable preview)
epic: Gated
audit_ref: WVR-06, Slice 5
priority: P1
status: ready
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
- 2026-10-11: **ungated; ready.** WVR-060 is `done` (0.3.0 merged and tagged, see its Log). The Gate is met: 0.3.0 is released, the API review is done under WVR-060, and the maintainer decided to publish and owns the registry credentials. Status moved from `gated` to `ready` per the promotion rule in `scratch/README.md`. It is not `done`, and its acceptance boxes stay unticked, because the evidence below is partial.
  - **Done.** `@cylayo/weaver-core@0.3.0`, `@cylayo/weaver-web@0.3.0` and `@cylayo/weaver-mcp@0.3.0` are published to npm on 2026-10-11 (UTC), core first, then web, then mcp. Each was published with `pnpm --filter <pkg> publish --access public --no-git-checks` from a checkout of `v0.3.0`.
  - **Done.** Dry-run file lists (from WVR-060): core 439 files / 168.7 kB, web 126 files / 52.4 kB, mcp 10 files / 11.8 kB.
  - **Done.** `CHANGELOG.md` exists (added under WVR-060).
  - **Done, ad hoc only.** An install smoke against the registry: all three `@0.3.0` installed into an empty directory. Versions are correct. Core has 0 `fixtures.*` files and no CRLF. `WEAVER_CORE_VERSION` is "0.3.0". `generateA2UIV091Prompt()` and `createWeaverRuntime({ observer })` work. The registry took a few minutes to show web and mcp, and a stale npm cache needed `--prefer-online`. This is not the full acceptance check (see below).
  - **Remaining, to tick the acceptance boxes:**
    1. A semver policy note, for example in `docs/packaging.md` (its "Versioning and publishing" section).
    2. A registry-specifier run of `integration/package-consumer` (TypeScript, ESM), using registry specifiers instead of tarballs, and the Worker smoke against the registry install. The ad-hoc smoke above does not cover this.
    3. The README install section rewritten as a Quick Start, with one browser example, one Worker example and one deterministic non-LLM example, each verified verbatim.
    4. Only then tick "Installing from the registry passes the same smoke tests as the tarballs" and "The Quick Start works verbatim".

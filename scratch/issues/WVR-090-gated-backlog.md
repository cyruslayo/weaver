---
id: WVR-090
title: Gated backlog — remaining audit items with their evidence gates
epic: Gated
audit_ref: WVR-07, 09, 10, 11, 12, 13, 14, 15
priority: P1/P2
status: gated
depends_on: []
estimate: —
---

These items are recorded so they aren't lost. **Do not start any of them**
until its gate is met. When a gate is met, split the item into its own issue
file and add it to BOARD.md.

| Audit | Item | Priority | Gate (from audit §6) | Constraint |
|---|---|---|---|---|
| WVR-07 | Data-driven UI examples (query or refresh patterns) | P1 | Repeated need after WVR-043 | The app owns network access, authorization, retries and cancellation. Weaver receives only A2UI updates. Never add a query manager to Core |
| WVR-09 | Richer catalog components (Table, Chart, Form, DatePicker) as a package | P1 | At least one shipping app needs them; bundle and dependency impact measured | Separate `catalogId`; Basic stays immutable. E5 is the template |
| WVR-10 | Optional provider or AG-UI bridge | P1 | Demonstrated demand from an adopter | Optional adapter; Core stays transport-neutral |
| WVR-11 | DOM reconciliation | P2 | WVR-080 or profiling shows full-rebuild cost matters (repeated updates, focus, memory) | Preserve the generation guards and the atomic last-good behaviour |
| WVR-12 | Stable item identity | P2 | A clear protocol contract, or a host-owned key extension | Never silently change v0.9.1 positional semantics |
| WVR-13 | A2UI v1.0 adapter | P2 | Official v1.0 schemas and fixtures published | Version-specific. OpenUI's Lang-string profile is a separate thing |
| WVR-14 | Native React, Vue or Svelte renderers | P2 | A real adopter | Never import a framework into Core |
| WVR-15 | Full chat or agent product shell | P2 | Product decision | An application or optional adapter, never part of Core |

Also deferred and tracked here: **R155**, eager detached construction in the
conformance tracker. It is an accepted limitation. Lazy construction needs
separate evidence and architecture work.

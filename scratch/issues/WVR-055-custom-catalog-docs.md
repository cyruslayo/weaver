---
id: WVR-055
title: Document the custom catalog recipe (docs/custom-catalogs.md)
epic: E5 Custom catalog recipe
audit_ref: WVR-05
priority: P0
status: todo
depends_on: [WVR-054, WVR-016]
estimate: S
---

## Scope
`docs/custom-catalogs.md` is a step-by-step recipe:
1. `defineCatalog`.
2. The one-catalog-per-surface rule and reusing Basic schemas.
3. Writing a trusted renderer: the security checklist (no HTML sinks, no
   dynamic code), accessibility, and the stale-interaction guard.
4. Registering the renderer through `additionalCatalogs` and
   `additionalRenderers`.
5. The prompt generator picks the new components up automatically.
6. Testing the failure modes.

Add a "when to add a component" rule from audit WVR-09: only when a shipping
app needs it, with its bundle and dependency impact measured. Link the doc
from the README.

## Acceptance criteria
- [ ] Every snippet matches the cookbook code.
- [ ] The README links to the doc.

## Definition of done
Merged.

## Log

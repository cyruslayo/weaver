---
id: WVR-034
title: Diagnostics panel in the inspector and a cookbook "error demo"
epic: E3 Error presentation
audit_ref: WVR-03 ("typed error panel grouped by frame, component, path, cause")
priority: P0
status: todo
depends_on: [WVR-032, WVR-024, WVR-041]
estimate: M
---

## Scope
- Build a small framework-free panel module,
  `examples/shared/diagnostics-panel.ts` or a file under the playground. It
  renders `WeaverErrorDescription[]` grouped by frame, then surface, then
  component, and shows the cause chain and hint. Build it with `textContent`
  only and never use `innerHTML`.
- Wire the panel into the inspector (WVR-024).
- Add it to the cookbook (WVR-041) as an "Error demo" screen. That screen
  feeds three bad updates and shows the panel next to the intact surface.
- Promotion rule: move the panel into `@cylayo/weaver-web` only when an
  adopting host asks for it. Record that rule in the doc.

## Acceptance criteria
- [ ] Each bad frame produces one grouped entry. The previous surface stays
      visible.
- [ ] The panel is keyboard reachable and readable at 360px.

## Verification
Manual check in the inspector and the cookbook, plus a happy-dom test of the
panel grouping.

## Definition of done
Merged. Screenshot in the PR.

## Log

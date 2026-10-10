---
id: WVR-016
title: Document prompt generation (docs/prompt-generation.md + README section)
epic: E1 Prompt generation
audit_ref: WVR-01
priority: P0
status: ready
depends_on: [WVR-013, WVR-015]
estimate: S
---

## Scope
`docs/prompt-generation.md` covers:
- the purpose of prompt generation;
- the API;
- the sections it produces;
- create mode versus edit mode;
- example validation;
- the size budget;
- the guarantee that the prompt never lists untrusted capabilities;
- how custom catalogs flow through it (forward-link to
  `docs/custom-catalogs.md`);
- the explicit non-goal: there is no model call inside Weaver.

Add a short README section with a 10-line usage snippet.

## Acceptance criteria
- [ ] The doc snippet compiles. Copy it into a test or into
      `integration/package-consumer/consumer.ts`.
- [ ] The README links to the doc.

## Definition of done
Merged.

## Log

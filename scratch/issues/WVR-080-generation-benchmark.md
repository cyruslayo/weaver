---
id: WVR-080
title: Generation benchmark — Weaver A2UI vs OpenUI Lang on identical tasks
epic: Gated
audit_ref: WVR-08, §5 (performance evidence), Slice 4
priority: P1
status: gated
depends_on: [WVR-013, WVR-044]
estimate: L
---

## Gate
Start only when E1 (prompt generation) and E4 (cookbook tasks) are done. A
maintainer must also approve model spend and an API key. This issue is the
**prerequisite for any decision about a compact DSL or about DOM
reconciliation** (WVR-11).

## Context
OpenUI's published token and latency numbers compare formats derived from
one OpenUI AST at an assumed throughput. They never measured Weaver. We
need an apples-to-apples measurement.

## Scope (when ungated)
- `bench/`: a private workspace package outside CI.
- The task set is the cookbook screens: form, dashboard, ticket board, and
  the custom table and chart.
- For each task, keep the schema, model, temperature, and tool privileges
  identical between Weaver (A2UI with WVR-011 prompts) and OpenUI Lang (its
  own generated prompt).
- Metrics:
  - valid-surface rate on the first attempt;
  - repair rate;
  - output tokens;
  - time to first valid render;
  - total latency to the final surface;
  - update CPU (browser);
  - input stability across updates;
  - cost.
- Run N≥20 times per task per model. Report the median and p90 in
  `bench/RESULTS.md`, along with the methodology.

## Acceptance criteria
- [ ] The methodology is reviewed before any runs.
- [ ] The raw results are committed. Conclusions record a decision on
      DSL/reconciliation: go or no-go.

## Log

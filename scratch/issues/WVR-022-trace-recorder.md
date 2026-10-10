---
id: WVR-022
title: createWeaverTraceRecorder + weaver-trace v1 format + ingestion frame-error capture
epic: E2 Trace and replay
audit_ref: WVR-02
priority: P0
status: todo
depends_on: [WVR-021]
estimate: M
---

## Context
A trace is the portable record that a developer, or a bug report, hands to
the inspector. JSONL decode failures happen inside stream ingestion and never
reach the runtime, so they need their own capture path.

## Scope
New module `packages/core/src/trace/`, exported from Core:

```ts
createWeaverTraceRecorder(options?: { maxEntries?: number /* default 5000 */; now?: () => Date })
  → {
      observer: (e: WeaverRuntimeEvent) => void;         // pass into WeaverRuntimeConfig.observer
      recordIngestion(events: readonly A2UIV091StreamIngestionEvent[], chunk?: string): void; // records frame-level errors only
      getTrace(): WeaverTrace;                           // defensive copy
      clear(): void;
    }
```

The `WeaverTrace` v1 format is a JSON-safe document:

```ts
{ format: "weaver-trace", version: 1, truncated: boolean,
  entries: Array<{ seq: number; at: string /* ISO */; kind: "message" | "frame-error" | "input" | "action";
                   input?: unknown; outcome: { ok: true; summary: ... } | { ok: false; error: ... } }> }
```

- When an entry is dropped, `seq` still increases, so gaps stay visible.
- Overflow drops the oldest entries and sets `truncated: true`.
- Add a `parseWeaverTrace(value: unknown)` guard that validates the structure
  strictly and rejects unknown versions.
- Security note for the docs: traces contain data-model values and
  user-typed input. They are a development artifact. Weaver never sends or
  persists them.

## Files
- New: `packages/core/src/trace/*` with tests
- Edit: `packages/core/src/index.ts` and the `packages/core/package.json`
  test list

## Acceptance criteria
- [ ] A mixed session is recorded in order, with correct kinds. The session
      has valid frames, one malformed JSONL frame, one catalog-invalid
      message, one input and one action.
- [ ] `JSON.parse(JSON.stringify(getTrace()))` round-trips, and
      `parseWeaverTrace` accepts the result.
- [ ] `parseWeaverTrace` rejects a wrong `format` or `version` and malformed
      entries.
- [ ] The bound and truncation behaviour is tested.

## Verification
`pnpm --filter @cylayo/weaver-core test`

## Definition of done
Merged.

## Log

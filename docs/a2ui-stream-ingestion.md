# Validated A2UI stream ingestion

`createA2UIV10StreamIngestion` is the Core API for applying streamed, newline-delimited A2UI
v1.0 text to an existing `WeaverRuntime`.

```ts
import { createA2UIV10StreamIngestion, type WeaverRuntime } from "@cylayo/weaver-core";

export function applyProviderStream(runtime: WeaverRuntime, textDeltas: Iterable<string>): void {
  const ingestion = createA2UIV10StreamIngestion({
    runtime,
    // Optional; otherwise the JSONL decoder's default limit applies.
    maxFrameCharacters: 1_048_576,
  });

  for (const delta of textDeltas) {
    for (const event of ingestion.push(delta)) {
      if (!event.ok) console.error("Rejected frame", event.frame, event.error.code);
    }
  }

  // A final unterminated frame is processed here.
  for (const event of ingestion.finish()) {
    if (!event.ok) console.error("Rejected final frame", event.frame, event.error.code);
  }
}
```

The application or provider integration owns obtaining the stream and extracting text deltas.
Weaver owns strict JSONL framing and passes each complete JSON value to `WeaverRuntime.process()`.
The runtime remains the single canonical A2UI protocol, catalog, and lifecycle boundary.

`push`, `finish`, and `reset` are synchronous. A provider's async loop can call `push` as deltas
arrive. Weaver does not depend on an async-iterator framework. `reset` clears only the decoder's
framing state. It does not delete or reset runtime surfaces.

## Events

Each event keeps its frame number. A successful event carries the runtime's result for that frame.
A failed event carries a structured error that identifies its source:

- `INVALID_JSON` and `FRAME_TOO_LARGE` come from the strict JSONL decoder.
- `PROTOCOL_VALIDATION_FAILED` comes from A2UI envelope validation.
- `CATALOG_REGISTRY_ERROR` comes from trusted catalog checks.
- `SURFACE_STORE_ERROR` comes from runtime lifecycle and state checks.
- `UNSUPPORTED_FEATURE` comes from a valid v1.0 message that this release does not yet implement
  (see [conformance](conformance-v1.0.md)).

Malformed JSON, Markdown fences, trailing commas, and oversized frames are not repaired, stripped,
retried, or sent to a model for correction. Protocol and runtime processing are fail-closed. A failed
frame never partially changes runtime state.

## What this API does not do

This API does not call a model, select a provider, authorize application actions, provide a network
transport, or make model output trusted. The v1.0 producer (`createA2UIV10Producer`) builds
trusted application-side messages. It is not a sanitizer for arbitrary agent text. To serialize a
producer message for this boundary, application code can use `JSON.stringify(message) + "\n"`.

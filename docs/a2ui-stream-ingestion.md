# Validated A2UI stream ingestion

`createA2UIV091StreamIngestion` is the Core API for applying streamed,
newline-delimited A2UI v0.9.1 text to an existing `WeaverRuntime`.

```ts
import { createA2UIV091StreamIngestion } from "@weaver/core";

const ingestion = createA2UIV091StreamIngestion({
  runtime,
  // Optional; otherwise JsonlDecoder's default applies.
  maxFrameCharacters: 1_048_576,
});

for (const delta of textDeltasFromApplicationProvider) {
  for (const event of ingestion.push(delta)) {
    if (event.ok) {
      console.log(event.frame, event.value.operation);
    } else {
      console.error(event.frame, event.error.code);
    }
  }
}

for (const event of ingestion.finish()) {
  // A final unterminated frame is processed here.
}
```

The application or provider integration owns obtaining the stream and
extracting text deltas. Weaver owns strict JSONL framing and passes each
complete JSON value to `WeaverRuntime.process()`. The runtime remains the
single canonical A2UI protocol, catalog, and lifecycle boundary.

`push`, `finish`, and `reset` are synchronous. A provider's async loop can call
`push` as deltas arrive; Weaver does not depend on an async-iterator framework.
`reset` clears only decoder framing state and does not delete or reset runtime
surfaces.

Events preserve frame identity. Successful events contain the existing runtime
operation result. Failures retain structured details and distinguish:

- `INVALID_JSON` and `FRAME_TOO_LARGE` from the strict JSONL decoder
- `PROTOCOL_VALIDATION_FAILED` from A2UI envelope validation
- `CATALOG_REGISTRY_ERROR` from trusted catalog checks
- `SURFACE_STORE_ERROR` from runtime lifecycle/state checks

Malformed JSON, Markdown fences, trailing commas, and oversized frames are not
repaired, stripped, retried, or sent to a model for correction. Protocol and
runtime processing remain fail-closed, so failed frames do not partially mutate
runtime state.

This API does not call an LLM, select a provider, authorize application
actions, provide a network transport, or make model output trusted. The Task 60
producer constructs trusted application-side messages; it is not a sanitizer
for arbitrary agent text. To serialize a producer message for this boundary,
application code can use `JSON.stringify(message) + "\n"`.

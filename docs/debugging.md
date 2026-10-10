# Debugging: traces, replay and the inspector

Weaver can record what a runtime was given and what it returned, replay that
record into a fresh runtime, and show it step by step in a trace inspector. These
are development tools. They are off unless your code turns them on, and Weaver
never sends or persists what they record.

> **Development artifact.** A trace holds data-model values, text a user typed,
> action context, and the raw text of frames that failed to decode. Read
> [Security and privacy](#security-and-privacy) before you record or share one.

| Piece | Where | What it does |
|---|---|---|
| Runtime observer | `WeaverRuntimeConfig.observer` in `@cylayo/weaver-core` | Receives a copy of each `process()`, `writeInput()` and `dispatchAction()` result, in order |
| Trace recorder | `createWeaverTraceRecorder()` | Keeps the observed events, plus JSONL frame errors, in memory |
| Trace parser | `parseWeaverTrace()` | Validates a trace value from an untrusted source |
| Replay | `replayWeaverTrace()` | Re-applies a trace to a fresh runtime and reports where it diverges |
| Error descriptions | `describeWeaverError()` and `describeWebRenderError()` | Turn an error value into a readable description |
| Inspector | `examples/playground/inspector.html` | A development-only page that loads a trace file and steps through it |
| Diagnostics panel | `examples/shared` (`@weaver/shared`) | Shows error descriptions grouped by frame, surface and component. It is an example, not a package API. See [Diagnostics panel](#diagnostics-panel) |

## Turn on the observer and the recorder

The observer is opt-in. Pass a recorder's `observer` in the runtime config. Your
build decides when this happens. Weaver has no development flag of its own.

```ts
import {
  createA2UIV091StreamIngestion,
  createBasicCatalogV091Registration,
  createWeaverRuntime,
  createWeaverTraceRecorder,
} from "@cylayo/weaver-core";

// Your build decides this. Weaver has no development flag of its own.
const developmentBuild = true;

// Without a recorder there is no observer, so the runtime copies nothing.
const recorder = developmentBuild ? createWeaverTraceRecorder({ maxEntries: 5000 }) : undefined;

const created = createWeaverRuntime({
  catalogs: [createBasicCatalogV091Registration()],
  ...(recorder === undefined ? {} : { observer: recorder.observer }),
});
if (!created.ok) throw new Error(created.error.code);

const ingestion = createA2UIV091StreamIngestion({ runtime: created.value });

// A torn line never reaches the runtime. It is recorded as a frame-error entry.
const chunk = '{"version":"v0.9.1","updateDataModel":{"surfaceId":"demo"\n';
recorder?.recordIngestion(ingestion.push(chunk), chunk);

console.log(recorder?.getTrace().entries.map((entry) => `${entry.seq} ${entry.kind}`).join(", "));
```

With a Web runtime, pass the observer through `runtime`. The inspector builds its
own runtime this way, in `examples/playground/src/runtime-factory.ts`:

```ts
import { createWeaverTraceRecorder } from "@cylayo/weaver-core";
import { createBasicWebRuntime } from "@cylayo/weaver-web";

const recorder = createWeaverTraceRecorder();
const created = createBasicWebRuntime({
  runtime: { observer: recorder.observer },
});
if (!created.ok) throw new Error(created.error.code);

const web = created.value;
console.log(web.catalogId);
```

What the recorder does:

- The observer gets a defensive copy of each event, so it cannot change a result
  or the runtime's state. An exception thrown by the observer is ignored.
- `createWeaverTraceRecorder({ maxEntries })` keeps at most `maxEntries` entries.
  The default is `5000`. It must be a positive safe integer, or the call throws a
  `RangeError`. When the limit is reached, the oldest entry is dropped and
  `truncated` becomes `true`.
- `recordIngestion(events, chunk)` records JSONL decode failures only: codes
  `INVALID_JSON` and `FRAME_TOO_LARGE`. Runtime failures already arrive through the
  observer, so they are not recorded twice. Call `recordIngestion` after each
  `push()` and `finish()`, with the chunk you passed in.

## What a trace holds

A trace is `{ format: "weaver-trace", version: 1, truncated, entries }`. Each
entry has a `seq` (1-based and strictly increasing; a gap means entries were
dropped), an `at` timestamp in ISO 8601 UTC from the recorder's clock, a `kind`,
an optional `input`, and an `outcome`.

| `kind` | Recorded by | `input` holds | `outcome` |
|---|---|---|---|
| `message` | `process()`, through the observer | The value given to `process()` | `{ ok: true, summary: { operation, surfaceId } }` or `{ ok: false, error }` |
| `input` | `writeInput()`, through the observer | `{ surfaceId, sourceComponentId, scopePath, property, value }` | `{ ok: true, summary }` with the surface, component, property and path, or `{ ok: false, error }` |
| `action` | `dispatchAction()`, through the observer | `{ surfaceId, sourceComponentId, scopePath, actionProperty }` | `{ ok: true, summary }` with the dispatch value, or `{ ok: false, error }` |
| `frame-error` | `recordIngestion()` | The chunk that was pushed. It may hold other frames too | Always `{ ok: false, error }` with the `INVALID_JSON` or `FRAME_TOO_LARGE` code |

A failed `error` is the Core error value unchanged, for example a
`MessageProcessorError` such as `PROTOCOL_VALIDATION_FAILED`,
`SURFACE_STORE_ERROR` or `CATALOG_REGISTRY_ERROR`, or a
`WeaverRuntimeInteractionError` such as `INSTANCE_NOT_FOUND`.

Ordering limit: within one chunk, `frame-error` entries follow that chunk's
`message` entries. A frame error can therefore appear after valid frames that
came after it in the same chunk. Order is exact chunk by chunk, so call
`recordIngestion` after every `push()` and `finish()`.

## Export a trace

Weaver has no export function. A trace is a plain value, so the host decides how
to save it. The text below is the trace as JSON with a final newline. This is the
format the bundled sample uses.

```ts
import {
  A2UI_V091_BASIC_CATALOG_ID,
  createA2UIV091Producer,
  createBasicCatalogV091Registration,
  createWeaverRuntime,
  createWeaverTraceRecorder,
  parseWeaverTrace,
} from "@cylayo/weaver-core";

const recorder = createWeaverTraceRecorder();
const created = createWeaverRuntime({
  catalogs: [createBasicCatalogV091Registration()],
  observer: recorder.observer,
});
if (!created.ok) throw new Error(created.error.code);

const producer = createA2UIV091Producer();
created.value.process(producer.createSurface({ surfaceId: "demo", catalogId: A2UI_V091_BASIC_CATALOG_ID }));

// The text to save. Save it with your own tooling, for example a file download in development.
const text = `${JSON.stringify(recorder.getTrace(), null, 2)}\n`;

// Validate before you trust a file, including one you read back yourself.
const parsed = parseWeaverTrace(JSON.parse(text));
if (!parsed.ok) throw new Error(parsed.error.code);
console.log(parsed.value.entries.length, parsed.value.truncated);
```

`parseWeaverTrace(value)` returns `{ ok: true, value }` with a fresh copy, or one
of three errors:

- `WRONG_FORMAT`, when `format` is not `"weaver-trace"`.
- `UNSUPPORTED_VERSION`, when `version` is not `1`.
- `MALFORMED_TRACE`, with the `path` and `reason` of the first problem. It rejects
  unknown keys, values that are not JSON, and `seq` values that do not increase.

## Open a trace in the inspector

The inspector is a private example in `examples/playground`. It is not part of any
published package.

1. Run `pnpm --filter @weaver/playground dev`, then open `/inspector.html`.
2. In the **Trace** panel, choose a file with **Load a trace file (JSON)**, or press
   **Use the bundled sample**. The status line then reads, for example,
   `Loaded the bundled sample: 10 entries.` The step returns to 1.
3. In the **Step** panel, step with **First**, **Previous**, **Next**, **Last**, the
   **Step position** slider, or a timeline button. Left and Right step, and Home and
   End jump to the first and last step. The shortcuts still work while a button has
   focus. They do not work in the slider, where the arrow keys move the slider itself,
   which also steps the trace. They do not work in the live surface either.

The page's panels, in order, are **Trace**, **Step** (with the **Timeline**),
**Entry**, **Surface and data model**, **Resolved tree and issues** (with
**Check results**), **Action outcome and replay**, **Live surface at this step**,
and **Suppressed outbound**. They show:

- **Timeline:** one button per entry, labeled with its position, `kind`, and
  `(error)` when the outcome failed, for example `4. frame-error (error)`.
- **Entry:** a **Valid**, **Rejected**, or **Invalid: malformed frame** badge (the
  malformed-frame badge is for `frame-error` entries), the raw entry JSON, and for a
  failed entry an error panel. The panel shows the code, such as `INVALID_JSON
  (error): Frame 4 is not valid JSON.`, then a `Fix:` hint and its causes, from
  `describeWeaverError()`.
- **Surface and data model**, **Resolved tree and issues**, and **Check results**,
  for the surface at this step.
- **Action outcome and replay:** `Recorded:` and `Replayed:` outcomes for this
  entry, and `Diverged: yes` or `no`.
- **Live surface at this step:** a surface rebuilt from the trace. Clicks change only
  this view.
- **Suppressed outbound:** starts empty, with `No suppressed events yet.` It fills
  only when you activate a control in the live surface, such as a submit button. Each
  event is listed under its action name, marked `(not sent)`, with the count line
  `1 suppressed event. Nothing was sent.` Replaying a trace raises no events.

The bundled sample, `examples/playground/samples/reference-request.weaver-trace.json`,
has 10 entries. It includes a torn frame (`frame-error`, `INVALID_JSON`), a message
rejected with `CATALOG_REGISTRY_ERROR` for an unregistered catalog, two input
writes, a submit action that produces a server event, and an action rejected with
`INSTANCE_NOT_FOUND`. `examples/playground/src/sample-flow.ts` records it.

Limits of the inspector:

- It reads files and never writes them. It has no export button.
- Each step replays the trace from its first entry into a new runtime, so a long
  trace gets slower at later steps.
- A truncated trace is labeled in the Trace panel's status line, which adds `Earlier
  entries were dropped when it was recorded.` Its first steps may diverge (see below).
- Loading a file that is not JSON, or that is not a weaver-trace, shows a sentence in
  the Trace panel and keeps the trace already on screen. For example:
  `This JSON is not a weaver-trace file. Its format field is "other".`

## Replay

`replayWeaverTrace(trace, { runtime, until })` applies a trace to a runtime that
you build. Build it with the same catalogs, functions and safety configuration as
the recording. Replay never builds a runtime or installs a callback, and it never
touches a transport.

```ts
import {
  A2UI_V091_BASIC_CATALOG_ID,
  createA2UIV091Producer,
  createBasicCatalogV091Registration,
  createWeaverRuntime,
  createWeaverTraceRecorder,
  parseWeaverTrace,
  replayWeaverTrace,
  type FunctionRegistration,
  type WeaverRuntime,
  type WeaverRuntimeObserver,
} from "@cylayo/weaver-core";

// Replace the effectful openUrl on every runtime, so the replay never opens a URL.
const openUrlMock: FunctionRegistration = {
  catalogId: A2UI_V091_BASIC_CATALOG_ID,
  name: "openUrl",
  effect: "action",
  implementation: () => undefined,
};

function createRuntime(observer?: WeaverRuntimeObserver): WeaverRuntime {
  const created = createWeaverRuntime({
    catalogs: [createBasicCatalogV091Registration()],
    functions: [openUrlMock],
    ...(observer === undefined ? {} : { observer }),
  });
  if (!created.ok) throw new Error(created.error.code);
  return created.value;
}

// Record a short session.
const recorder = createWeaverTraceRecorder();
const recording = createRuntime(recorder.observer);
const producer = createA2UIV091Producer();
const surfaceId = "replay-demo";
recording.process(producer.createSurface({ surfaceId, catalogId: A2UI_V091_BASIC_CATALOG_ID }));
recording.process(producer.updateComponents({
  surfaceId,
  components: [
    { id: "root", component: "Button", child: "label", action: { functionCall: { call: "openUrl", args: { url: "https://example.com/" } } } },
    { id: "label", component: "Text", text: "Open the link" },
  ],
}));
const pressed = recording.dispatchAction({ surfaceId, sourceComponentId: "root", scopePath: "/", actionProperty: "action" });
if (!pressed.ok) throw new Error(pressed.error.code);

// The JSON round trip stands in for reading a saved file.
const parsed = parseWeaverTrace(JSON.parse(JSON.stringify(recorder.getTrace())));
if (!parsed.ok) throw new Error(parsed.error.code);

const replay = replayWeaverTrace(parsed.value, { runtime: createRuntime() });
console.log(replay.steps.map((step) => `${step.seq} ${step.kind} diverged=${step.diverged}`).join("\n"));
if (replay.steps.some((step) => step.diverged)) throw new Error("replay diverged");

// Replay only the first two entries, for stepping.
const partial = replayWeaverTrace(parsed.value, { runtime: createRuntime(), until: 2 });
console.log(partial.steps.length);
```

What replay does, entry by entry, in `seq` order:

- `message` entries are passed to `process()` again.
- `input` entries are passed to `writeInput()`, and `action` entries to
  `dispatchAction()`. A request that lacks required fields is reported as a
  divergence with the code `REPLAY_INVALID_INPUT`. It is not thrown.
- `frame-error` entries are reported with `replayed: null`. They are never applied,
  because they never reached the runtime. They never count as diverged.
- `until` replays only the entries with `seq` at most `until`.

Each step reports `recorded` and `replayed` outcomes, each `{ ok }` plus `code` on
failure, and `diverged`. A step diverges when `ok` or the error `code` differs. A
different success value does not count. The result also holds `surfaces`, the
snapshot of each surface the replay touched, keyed by `surfaceId`.

### Guarantees and limits

- **Mock effectful functions.** A local function action runs the implementation
  registered on the replay runtime. A function registered with `effect: "action"`,
  such as the Web `openUrl` function, runs for real unless you register a mock with
  the same `catalogId` and `name`. `pure` functions run as they do normally. The
  example above mocks `openUrl` for this reason.
- **Positional identity.** In v0.9.1, collection scope uses array positions, so a
  trace refers to items by position (for example `/items/0`). Replay reproduces the
  recorded positions exactly. It cannot recover an item's identity after a reorder:
  an entry that targets `/items/0` acts on whatever is at position 0 at that time.
  See [instance identity is positional](architecture.md#architecture-decision-instance-identity-is-positional).
- **Truncated traces.** A truncated trace holds only its newest entries. Replay
  cannot rebuild the state those dropped entries created, so the first steps may
  diverge. The `seq` gaps show where entries were dropped.
- **Values that were not JSON-safe.** The observer stores `{ unserializable: true }`
  in place of a rejected value that is not JSON-safe. Replay sends that marker, so
  a step can diverge.
- **The clock.** Replay ignores `at`. A runtime that depends on its `now` needs the
  same `now` as the recording for the results to match. The sample flow fixes its
  clock for this reason.
- **Scope.** Replay re-runs the recorded inputs. It does not reproduce provider
  output, network timing, or what the user did between events.

## Reading errors

`describeWeaverError(error, context?)` accepts any Core error union, including
the `DescribableWeaverError` type. It returns a `WeaverErrorDescription`:
`code`, `severity` (`"error"` or `"warning"`), `summary`, the most specific
location it names (`surfaceId`, `componentId`, `scopePath`, `dataPath`, `frame`),
an optional `hint`, and `causes`. The `causes` array is the whole cause chain,
flattened in order. `context.frame` fills `frame` when the error does not give one.

```ts
import {
  createA2UIV091Producer,
  createA2UIV091StreamIngestion,
  createBasicCatalogV091Registration,
  createWeaverRuntime,
  describeWeaverError,
} from "@cylayo/weaver-core";

const created = createWeaverRuntime({ catalogs: [createBasicCatalogV091Registration()] });
if (!created.ok) throw new Error(created.error.code);
const runtime = created.value;

// A frame error: the line is not JSON.
const ingestion = createA2UIV091StreamIngestion({ runtime });
for (const event of ingestion.push("not json\n")) {
  if (event.ok) continue;
  const description = describeWeaverError(event.error, { frame: event.frame });
  console.log(description.code, description.severity, description.frame);
  console.log(description.summary);
  console.log(description.hint);
}

// A message error: the catalog is not registered.
const producer = createA2UIV091Producer();
const rejected = runtime.process(
  producer.createSurface({ surfaceId: "unknown", catalogId: "https://example.test/catalogs/unknown.json" }),
);
if (!rejected.ok) {
  const description = describeWeaverError(rejected.error);
  console.log(description.code, description.causes.map((cause) => cause.code));
}
```

On the Web side, `describeWebRenderError(error)` in `@cylayo/weaver-web` describes
every `WebRenderError` code, such as `RENDERER_NOT_FOUND` and
`SURFACE_RESOLUTION_FAILED`, along with the interaction and local-state codes. The
inspector uses it for a surface that cannot be mounted.

```ts
import { describeWebRenderError, type WebRenderError } from "@cylayo/weaver-web";

// A render failure, as mount() returns it. This component has no trusted renderer.
const failure: WebRenderError = {
  code: "RENDERER_NOT_FOUND",
  catalogId: "https://example.com/catalogs/notes/v1",
  component: "NoteBadge",
  sourceComponentId: "status",
  scopePath: "/notes/0",
};
const description = describeWebRenderError(failure);
console.log(description.code, description.componentId, description.hint);
```

A `SURFACE_RESOLUTION_FAILED` error carries `surfaceId`, the id of the surface that failed to render, and its description has the same `surfaceId`. That includes a render-budget failure, where the surface has more components than the budget allows. The host does not need to add the id itself.

## Security and privacy

- **What a trace contains.** Every `message` value, every `input` value (text a
  user typed, including a `TextField` with `variant: "obscured"`, which Web shows as
  a password input), action context and
  server event payloads, and the raw text of a frame that failed to decode. A failed
  frame can hold model output you did not mean to keep, or text that tries to give
  instructions.
- **Weaver does not send or persist a trace.** The recorder keeps entries in memory
  only. Weaver has no telemetry. A trace leaves your process only when your code
  exports it.
- **Development only.** Keep the observer and the recorder out of production
  builds, behind a flag that your build sets. Without an observer, the runtime copies
  nothing and records nothing.
- **Sharing.** Do not commit or share a trace recorded from real users. Build a
  synthetic one, or remove the sensitive fields before you share it. Weaver does not
  redact a trace for you. A redacted trace may diverge on replay.
- **The inspector.** It reads the file in your browser and shows it as text. It
  sets trace text with `textContent`, not as markup. It sends,
  uploads and saves nothing. Server events the live surface raises are listed under
  **Suppressed outbound** and are never sent.
- **Replay.** Replay runs your host functions. Mock every `effect: "action"` function
  before you replay, or a recorded `openUrl` or similar call runs for real.
- **Parsing.** `parseWeaverTrace()` validates a trace file before anything uses it.
  Do this for every file you did not record in the same process.

## Diagnostics panel

`describeWeaverError()` and `describeWebRenderError()` return descriptions that a host
can show. The diagnostics panel is one way to show them. It takes a list of
descriptions and groups them by frame, then by surface, then by component. Each entry
shows its code, summary, scope and data path, fix hint, and flattened cause chain. All
text is set with `textContent`, so a description that contains markup is shown as text.

The panel lives in `examples/shared`, as the private `@weaver/shared` package. It is
not part of `@cylayo/weaver-web`. The playground inspector uses it for the error on each
entry. The cookbook **Error demo** (`examples/cookbook/error-demo.html`) uses it for three
bad updates: a truncated frame, a component the catalog does not define, and a list too
long to render. Each bad update is one entry, and the surface beside the panel keeps its
last good render.

**Promotion rule:** move the panel into `@cylayo/weaver-web` only when an adopting host
asks for it. Until then it stays in examples, so the published API does not grow to suit
a demo. A host that needs it earlier can copy the module, which is small.

## Related documents

- [Architecture](architecture.md): the runtime pipeline, including the `WeaverRuntime` facade.
- [Validated A2UI stream ingestion](a2ui-stream-ingestion.md): the frame and chunk path that `recordIngestion()` follows.
- [Prompt generation](prompt-generation.md): compiling the trusted catalog into model instructions.
- [Web rendering](web-rendering.md): the renderer pipeline behind `describeWebRenderError()`.
- [Custom catalogs](custom-catalogs.md): the recipe for a trusted renderer whose errors this page describes.

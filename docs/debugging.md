# Debugging, traces and replay

Weaver has three development aids: a runtime observer, a trace recorder, and a replay. They record
what a runtime was given and what it returned, so you can see why a surface looks the way it does
and reproduce it. They are opt-in. Without an observer the runtime copies nothing.

A trace holds data-model values and typed user input. It is a development artifact. Weaver never
sends, uploads or persists a trace. Whether a trace leaves the process is a host decision, and it
should be made with the same care as sharing the application's data.

## The observer

`WeaverRuntimeConfig.observer` receives a copy of each `process()`, `writeInput()` and
`dispatchAction()` result, in order. Each event has a `kind` (`message`, `input` or `action`) and
the result. An observer that throws is ignored, so it cannot change a result or the runtime's state.

Copies are JSON-safe. A value that is not JSON-safe (a cycle, a non-plain object, a non-finite number,
or `undefined`) is delivered as `{ "unserializable": true }` in its place.

## Record a trace

`createWeaverTraceRecorder()` builds an observer that keeps a bounded, in-memory `weaver-trace`
document. The default limit is 5,000 entries, and `maxEntries` changes it. When the limit is reached
the oldest entries are dropped and the trace is marked truncated.

Call `recordIngestion()` after each `push()` and `finish()`. It records the JSONL frame errors, which
never reach the runtime and so are not seen by the observer.

```ts
import {
  createA2UIV10StreamIngestion,
  createBasicCatalogV10Registration,
  createWeaverRuntime,
  createWeaverTraceRecorder,
  type WeaverTrace,
} from "@cylayo/weaver-core";

export function createTracedIngestion(): {
  push(chunk: string): void;
  finish(): void;
  trace(): WeaverTrace;
} {
  const recorder = createWeaverTraceRecorder({ maxEntries: 5000 });
  const created = createWeaverRuntime({
    catalogs: [createBasicCatalogV10Registration()],
    observer: recorder.observer,
  });
  if (!created.ok) throw new Error(`Runtime configuration failed: ${created.error.code}`);
  const ingestion = createA2UIV10StreamIngestion({ runtime: created.value });
  return {
    push(chunk) {
      recorder.recordIngestion(ingestion.push(chunk), chunk);
    },
    finish() {
      recorder.recordIngestion(ingestion.finish());
    },
    trace: () => recorder.getTrace(),
  };
}
```

With `createBasicWebRuntime`, pass the observer through the `runtime` option:

```ts
import { createBasicWebRuntime } from "@cylayo/weaver-web";
import { createWeaverTraceRecorder } from "@cylayo/weaver-core";

const recorder = createWeaverTraceRecorder({ maxEntries: 2000 });
const created = createBasicWebRuntime({ runtime: { observer: recorder.observer } });
if (!created.ok) throw new Error(`Web runtime configuration failed: ${created.error.code}`);

// Process messages through created.value.runtime as usual. Then read the trace:
const trace = recorder.getTrace();
console.log(trace.entries.length, "entries recorded");
```

Each trace entry has a `seq` number, a `kind` (`message`, `frame-error`, `input` or `action`), and
an `outcome` that records `ok` with a summary, or the error. `seq` restarts at 1 when the recorder is
cleared. Record a stream in order: a `push()` chunk's frame errors are appended after that chunk's
message entries.

Remote function calls leave two kinds of entry. An inbound `callRendererFunction` or
`agentFunctionResponse` is a `message` entry. A settled call that resumes an action records
that action in the same entry. A `callAgentFunction` that the host sends is not an observer event,
because the runtime only queues it. A `dispatchAction()` result that waits on calls is an `action`
entry. Keep the host's send log beside the trace when you debug a call. A replay re-creates the
pending calls from the recorded entries, so a replayed answer diverges when its call was not
re-created.

## Validate and replay a trace

A trace is untrusted when it comes from a file or another machine. `parseWeaverTrace()` checks its
shape and returns a copy, or a typed error. `replayWeaverTrace()` applies the trace's entries to a
fresh runtime, and reports for each step whether the replay diverged from the recording. A step
diverges when its `ok` value or its error `code` changes.

Build the replay runtime with the same catalogs and functions as the recording. Effectful functions
such as `openUrl` must get mock implementations there, or they run for real.

```ts
import {
  createBasicCatalogV10Registration,
  createWeaverRuntime,
  parseWeaverTrace,
  replayWeaverTrace,
} from "@cylayo/weaver-core";

export function traceReplaysCleanly(untrusted: unknown): boolean {
  const parsed = parseWeaverTrace(untrusted);
  if (!parsed.ok) return false;

  const created = createWeaverRuntime({ catalogs: [createBasicCatalogV10Registration()] });
  if (!created.ok) return false;

  const replay = replayWeaverTrace(parsed.value, { runtime: created.value });
  return replay.steps.every((step) => !step.diverged);
}
```

`replayWeaverTrace(trace, { runtime, until })` replays only entries with `seq <= until`. That lets you
step to the point where a surface first went wrong. The result's `surfaces` holds each surface that
exists after the replayed steps.

## Replay to a point

Replay only the entries up to a sequence number to see what a surface looked like at that point:

```ts
import {
  createBasicCatalogV10Registration,
  createWeaverRuntime,
  parseWeaverTrace,
  replayWeaverTrace,
} from "@cylayo/weaver-core";

export function surfaceAfter(untrusted: unknown, seq: number): string | undefined {
  const parsed = parseWeaverTrace(untrusted);
  if (!parsed.ok) return undefined;

  const created = createWeaverRuntime({ catalogs: [createBasicCatalogV10Registration()] });
  if (!created.ok) return undefined;

  const replay = replayWeaverTrace(parsed.value, { runtime: created.value, until: seq });
  const main = replay.surfaces["main"];
  return main === undefined ? undefined : JSON.stringify(main);
}
```

## Find the first divergence

When a trace does not replay cleanly, the first diverging step is the place to start. Each step carries
the `recorded` outcome, the `replayed` outcome, and `diverged`:

```ts
import {
  createBasicCatalogV10Registration,
  createWeaverRuntime,
  parseWeaverTrace,
  replayWeaverTrace,
  type WeaverTraceReplayStep,
} from "@cylayo/weaver-core";

export function firstDivergence(untrusted: unknown): WeaverTraceReplayStep | undefined {
  const parsed = parseWeaverTrace(untrusted);
  if (!parsed.ok) throw new Error(`Trace rejected: ${parsed.error.code}`);

  const created = createWeaverRuntime({ catalogs: [createBasicCatalogV10Registration()] });
  if (!created.ok) throw new Error(`Runtime configuration failed: ${created.error.code}`);

  const replay = replayWeaverTrace(parsed.value, { runtime: created.value });
  return replay.steps.find((step) => step.diverged);
}
```

## Describe an error for a person

`describeWeaverError()` turns any typed Core error into a `WeaverErrorDescription` with a stable
`code`, a `severity`, a `summary`, an optional `hint`, and a flattened list of `causes`. Use it for
messages a user or a log reads. The Web package has the same helper for render, interaction and
local-state errors, `describeWebRenderError()`.

```ts
import {
  describeWeaverError,
  type A2UIAgentMessage,
  type WeaverErrorDescription,
  type WeaverRuntime,
} from "@cylayo/weaver-core";

export function processOrDescribe(
  runtime: WeaverRuntime,
  message: A2UIAgentMessage,
): WeaverErrorDescription | undefined {
  const result = runtime.process(message);
  return result.ok ? undefined : describeWeaverError(result.error);
}
```

## The trace inspector

The [trace inspector](../examples/playground/inspector.html) is a development-only page. It loads a
trace, steps through its entries, and shows the replayed surfaces. It runs in the browser on the
trace you give it and sends nothing. Use it on traces you are allowed to see.

## Privacy and security

- Traces hold data-model values and input. Treat a trace like the data it records.
- Weaver never sends or persists a trace. A host that exports one decides where it goes.
- A replay runtime runs the host's functions. Replay the traces you trust, and mock effectful
  functions when you replay anything else.
- Parse every trace from outside the process with `parseWeaverTrace()` before you use it.

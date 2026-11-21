# Weaver browser HTTP/SSE transport binding

> **This is a Weaver transport binding. It is not a normative A2UI HTTP/SSE binding.**

`@cylayo/weaver-web` provides `createBrowserA2UIHttpSseTransport`. One adapter represents one trusted host-assigned `routeId`, one stream endpoint, and one send endpoint. Routes never appear in a body, query, or Weaver-created remote header. An SSE event ID is only a replay cursor: it is not a route, surface, authentication, or session identity.

## Stream and resume

The adapter opens `POST <streamUrl>` with `Accept: text/event-stream`, JSON content, and `{ "metadata": { "a2uiRendererCapabilities": ... } }`. A successful response must be `text/event-stream` and have a body. UTF-8 SSE events are decoded incrementally and processed sequentially. Default, `message`, and `a2ui` events carry one A2UI JSON envelope; other event types are ignored. LF, CRLF, CR, comments, split boundaries, multiple `data` fields, and a bounded event size are supported. An incomplete event at EOF is discarded.

The private decoder implements `id:`. NUL-containing ID fields are ignored, an empty ID resets the cursor, and an omitted ID preserves it. The adapter advances its cursor when the complete SSE event ends, before payload handling. Thus malformed JSON, ignored event types, empty-data events, A2UI validation failures, routing rejection, and failed automatic validation POSTs do not cause endless replay. An interrupted incomplete event does not advance it. `retry:` remains deliberately ignored, unlike native `EventSource`; reconnect pacing is client/host policy.

A fresh adapter omits `Last-Event-ID`. Once its non-empty cursor advances, automatic reconnects and later manual `run()` calls send `Last-Event-ID: <cursor>`. An empty-ID reset makes later requests omit it. Cursor values are checked again for NUL, CR, and LF before request construction. A resumed request receiving `410 Gone` returns typed `RESUME_UNAVAILABLE`, retains the cursor, and never silently starts fresh. A host can deliberately create a fresh adapter or reload/reconcile application state.

Using `Last-Event-ID` on POST is part of this Weaver-defined binding, not native `EventSource`. Cross-origin hosts must allow that request header in CORS configuration; Weaver configures no CORS behavior.

## Reconnect policy

`adapter.run()` retains its original default: EOF/failure returns, with no automatic reconnect. Reconnect is explicit and finite per run:

```ts
adapter.run({
  signal,
  reconnect: { maxAttempts: 3, delayMs: 1000 },
});
```

`maxAttempts` is a finite integer at least zero and counts all reconnect requests after the initial request. The budget does not reset when an intermediate stream opens; a later explicit `run()` receives a fresh budget. `delayMs` is finite and non-negative, defaults to 1000 ms, and is one fixed client-owned delay—there is no jitter, exponential backoff, network-status API, or server-controlled `retry:` timing. Waiting is abortable and cleans up its timer/listener.

Clean established EOF, fetch/network failure, and stream-body read failure consume the bounded reconnect policy. Caller abort is final. HTTP 4xx/5xx, wrong MIME, and missing body are fatal and are not retried. Exhaustion returns `RECONNECT_EXHAUSTED` with the number of reconnect attempts and a safe last failure code. Abort during an active stream, delay, or reconnect request returns `aborted`. A reconnect remains part of the same active run, preserving the one-active-run rule.

The same host-supplied `fetch` wrapper handles initial stream, reconnect stream, and renderer POST requests. It remains the authentication, credentials, CORS, and instrumentation boundary; Weaver neither inspects nor configures authorization.

## Renderer messages

Actions and automatic standard validation responses use serialized `POST <sendUrl>` requests with exact `{ message, metadata }` wrappers. Capabilities are included every time; optional owner-routed `a2uiRendererDataModel` is included only when supplied by the session. Failed sends do not stop later sends. Local function actions remain local. Disconnect/resume never mutates Core surface ownership or adds replay state to `A2UITransportSession`, `SurfaceStore`, or `DataModel`.

Every inbound event that the session answers also sends its reply on the same route, in the same serialized queue:

- a `rendererFunctionResponse` for an agent `callRendererFunction`, including the error response that routing gives a refused call;
- a generic renderer `error` for a malformed call envelope, correlated by its `functionCallId`;
- the work a settled agent call resumed, whether that is an action server event or more `callAgentFunction` messages.

## Remote function calls

The renderer also calls functions the agent implements. Core queues each such call as a `callAgentFunction` message. The transport sends queued calls itself, so the host does not poll. The host wires two things:

```ts
import { createA2UITransportSession } from "@cylayo/weaver-core";
import { createBasicWebRuntime, createBrowserA2UIHttpSseTransport, type BrowserA2UIHttpSseTransport } from "@cylayo/weaver-web";

let transport: BrowserA2UIHttpSseTransport | undefined;
// One runtime serves the renderer, the session and the transport.
const created = createBasicWebRuntime({
  // Core calls this after it queues a call. The drain is deferred to a microtask and then serialized.
  runtime: { agentFunctions: { onCallQueued: () => { void transport?.flushAgentCalls(); } } },
  // A user action that waits on calls is handed here. Its calls are sent with sendActionCalls.
  rendering: { onAgentFunctionCalls: (result) => { void transport?.sendActionCalls(result); } },
});
if (!created.ok) throw new Error(created.error.code);
const web = created.value;
const session = createA2UITransportSession({ runtime: web.runtime });
transport = createBrowserA2UIHttpSseTransport({
  runtime: web.runtime, // the runtime the session wraps; a call that fails to send is cancelled on it
  session,
  routeId: "host-assigned-route",
  streamUrl: "/a2ui/stream",
  sendUrl: "/a2ui/send",
});
```

A host that calls `runtime.dispatchAction` itself passes the result to `transport.sendActionCalls(result)`. Either path sends only the `callAgentFunction` messages that the result carries. Other kinds are not handled there, so a server event stays with the host.

Several adapters may share one session, one per route. Each adapter's flush drains only its own route, so the hook must flush every adapter on the session. Calls for other routes stay queued for their own adapter. A call whose surface has no route also stays queued until the host cancels it with `cancelAgentFunctionCall(id, "TRANSPORT_FAILED")`. A Web adapter and an MCP bridge can share one session, because each drains only its own route.

The transport's rules:

- A send that fails cancels its call with `cancelAgentFunctionCall(id, "TRANSPORT_FAILED")`, and an action that the cancellation resumes is delivered. The failure is reported as `AGENT_CALL_DELIVERY_FAILED`.
- A call whose surface has no route stays queued, and the host cancels it. The transport never sends it on another route.
- The transport delivers the work a resumed action produced, so the host must not send it again.
- The host owns timeouts. Core has no clock. Cancel a stale call with `cancelAgentFunctionCall(id, "TIMEOUT")` from the host's own timer.
- Each answer is correlated by `functionCallId` and must arrive on the route that owns the call's surface. Otherwise the session refuses it with `SURFACE_ROUTE_MISMATCH`.

Diagnostics for these paths are `FUNCTION_RESPONSE_DELIVERY_FAILED`, `AGENT_CALL_DELIVERY_FAILED`, and `CONTINUATION_DELIVERY_FAILED`. The response bodies are the same `{ message, metadata }` wrappers as every other renderer message. Authentication and CORS stay with the host-supplied `fetch`.

## Reference server

`examples/http-sse-server/` is a dependency-free, loopback reference peer. Each successfully accepted `sendA2UI()` receives a unique monotonically increasing decimal event ID and emits:

```text
event: a2ui
id: 17
data: {...}

```

After the first successful stream, events generated while disconnected are retained for resume. Before any successful stream, `sendA2UI()` still returns `NO_ACTIVE_STREAM`. History stores only event ID and serialized payload, defaults to 128 entries, drops oldest entries, is memory-only and non-persistent, and is private reference/test API. Replay is serialized with live writes and uses the same `write()`/`drain` backpressure handling.

No `Last-Event-ID` means a fresh stream with no old replay. A known cursor replays only later events; the latest cursor opens with no duplicates. Invalid decimal syntax returns 400. Expired, unknown, or ahead cursors return 410 because continuity cannot be proven. Replay occurs before live events.

The helper is single-peer and not a production security boundary. It has no authentication, CORS policy, persistence, clustering, or durable session correlation. Process restart loses history. Reliable resume across restarts, multiple instances, and load balancing requires host-owned durable, session-correlated replay infrastructure. The small helper is not that solution.

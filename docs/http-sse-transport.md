# Weaver browser HTTP/SSE transport binding

> **This is a Weaver transport binding. It is not a normative A2UI v0.9.1 HTTP/SSE binding.**

`@weaver/web` provides `createBrowserA2UIHttpSseTransport`. One adapter represents one trusted host-assigned `routeId`, one stream endpoint, and one send endpoint. Routes never appear in a body, query, or Weaver-created remote header. An SSE event ID is only a replay cursor: it is not a route, surface, authentication, or session identity.

## Stream and resume

The adapter opens `POST <streamUrl>` with `Accept: text/event-stream`, JSON content, and `{ "metadata": { "a2uiClientCapabilities": ... } }`. A successful response must be `text/event-stream` and have a body. UTF-8 SSE events are decoded incrementally and processed sequentially. Default, `message`, and `a2ui` events carry one A2UI JSON envelope; other event types are ignored. LF, CRLF, CR, comments, split boundaries, multiple `data` fields, and a bounded event size are supported. An incomplete event at EOF is discarded.

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

The same host-supplied `fetch` wrapper handles initial stream, reconnect stream, and client POST requests. It remains the authentication, credentials, CORS, and instrumentation boundary; Weaver neither inspects nor configures authorization.

## Client messages

Actions and automatic standard validation responses use serialized `POST <sendUrl>` requests with exact `{ message, metadata }` wrappers. Capabilities are included every time; optional owner-routed `a2uiClientDataModel` is included only when supplied by the session. Failed sends do not stop later sends. Local function actions remain local. Disconnect/resume never mutates Core surface ownership or adds replay state to `A2UITransportSession`, `SurfaceStore`, or `DataModel`.

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

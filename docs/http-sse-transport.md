# Weaver browser HTTP/SSE transport binding

> **This is a Weaver transport binding.**
>
> **It is not a normative A2UI v0.9.1 HTTP/SSE binding.**

`@weaver/web` provides `createBrowserA2UIHttpSseTransport`. One adapter instance represents one trusted host-assigned `routeId`, one stream endpoint, and one send endpoint. Multiple remote peers use separate adapters and may share an `A2UITransportSession`. The `routeId` is assigned by trusted host code and never appears in a body, query, or Weaver-created header on the remote wire. Endpoints likewise come only from factory configuration.

## Stream request

```http
POST <streamUrl>
Accept: text/event-stream
Content-Type: application/json

{"metadata":{"a2uiClientCapabilities":{}}}
```

The capabilities value is the exact object returned by `session.getClientCapabilities()`. There is no empty message field. A successful response must have `Content-Type: text/event-stream` (parameters are allowed) and a streaming body.

The response is incrementally decoded as UTF-8. One accepted SSE event data payload equals one A2UI server-to-client JSON envelope; JSONL is not nested inside SSE. Default events, `event: message`, and `event: a2ui` are accepted. Other event types, comments, empty events, unknown fields, `id`, and `retry` are ignored. LF, CRLF, CR, multiple `data` fields, and split byte/line boundaries are supported. An event requires a terminating blank line; an incomplete event at EOF is discarded.

SSE events are processed sequentially through `session.processInbound(routeId, value)`. Recoverable malformed or oversized events produce host diagnostics and processing continues. The default event-data limit is 1 MiB. Routing/lifecycle failures remain host diagnostics. A standard validation failure prepared by the session is automatically sent through the same ordered client POST path.

## Client message request

```http
POST <sendUrl>
Content-Type: application/json

{
  "message": { "version": "v0.9.1", "action": {} },
  "metadata": {
    "a2uiClientCapabilities": {},
    "a2uiClientDataModel": {}
  }
}
```

`message` is the exact existing action or `VALIDATION_FAILED` object. Capabilities are included on every POST. `a2uiClientDataModel` is included only when the session-prepared routed delivery supplies it; otherwise the property is omitted. Client POSTs are serialized in call order, including automatic validation responses. A failed send does not prevent the next send.

Typical Web interaction integration remains host-controlled:

```text
Web server event callback
      ↓
A2UITransportSession.prepareActionDelivery()
      ↓
matching adapter.sendDelivery()
      ↓
POST sendUrl
```

Local `functionCall` actions stay local under `ActionDispatcher` and never enter this adapter.

## Failure and policy

```text
recoverable event error → diagnostic + continue
fatal stream failure    → run returns
send failure            → caller receives failure; no retry
clean stream EOF         → closed
caller abort             → aborted
```

Only one `run()` may be active per adapter. After it closes, aborts, or fails, the host may explicitly start a fresh run. Task 42 does not implement retry, `Last-Event-ID`, resume, or automatic reconnect, and SSE `id`/`retry` fields have no reconnection semantics. Stream termination does not alter session surface ownership.

A host-supplied `fetch` wrapper is the authentication, CORS, credentials, and request-instrumentation policy boundary. Weaver does not inspect or configure tokens, cookies, browser storage, or authorization headers and does not authenticate peers.

## Reference server

`examples/http-sse-server/` contains a dependency-free Node reference peer and executable entry point. One reference-server instance equals one trusted remote peer, so no route, owner, client, connection, or session ID is added to either wire wrapper. It accepts exactly one active stream; a second receives `409 Conflict`, while closing the active response releases the slot for a later stream.

The stream endpoint is `POST /a2ui/stream`. It requires JSON content, `Accept: text/event-stream`, and the exact metadata-only wrapper shown above. It flushes these headers immediately and emits an inert initial comment before waiting for messages:

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache

: connected

event: a2ui
data: {"version":"v0.9.1","createSurface":{}}

```

Trusted reference code can send only a JSON-serialized value as one `event: a2ui`; there is no raw SSE API or JSON repair. JSON serialization failures, absent/closed streams, and write failures are controlled results. A write that reports backpressure waits for `drain`.

The receipt endpoint is `POST /a2ui/send`. It requires the exact `{message, metadata}` wrapper, capabilities, and only the optional `metadata.a2uiClientDataModel`; success is `204 No Content`. Both endpoints reject malformed JSON with `400`, limit request bodies to 1 MiB and return `413` when exceeded. Trusted callbacks observe defensive copies. A callback failure is contained and returns `500` before the stream is established or send receipt completes.

**The reference server is not a production security boundary.** It has no authentication, CORS policy, persistence, reconnect/resume, clustering, horizontal scaling, or more than one stream. It defaults to `127.0.0.1`. Real multi-user or multi-agent hosts must correlate the stream request, send requests, and authenticated peer/session in trusted server infrastructure; untrusted request-body fields must not establish identity. Cross-origin deployments must configure CORS in their host server; Weaver deliberately does not add a permissive policy.

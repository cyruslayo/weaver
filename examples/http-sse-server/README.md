# HTTP/SSE reference server

A dependency-free Node reference implementation of Weaver's non-normative browser HTTP/SSE binding.

```bash
node examples/http-sse-server/server.mjs
```

The server accepts any renderer message object on `POST /a2ui/send`, which includes `rendererFunctionResponse`, a renderer `error` with a `functionCallId`, and `callAgentFunction`. For the demo, each `callAgentFunction` is answered with an `agentFunctionResponse` that echoes its arguments. A real host runs its own authorized function there instead.

It binds to `127.0.0.1:8787` by default (`PORT` may override), accepts `POST /a2ui/stream`, and receives renderer messages at `POST /a2ui/send`.

Each `sendA2UI()` after the first stream gets a unique monotonic decimal SSE ID. The server retains a bounded in-memory history (128 by default), buffers gap events after a prior connection, and replays only events after a valid `Last-Event-ID`. Invalid decimal cursors return 400; expired, unknown, or ahead cursors return 410 rather than silently opening fresh. Replay is ordered before live writes and respects backpressure. `retry:` is not used.

One server instance represents one trusted remote peer and permits one active stream. It has a 1 MiB request limit and no authentication, CORS policy, persistence, clustering, durable sessions, or routing IDs. Process restart loses replay history. **The reference server is not a production security boundary.** A real host must authenticate and correlate requests, configure cross-origin allowance for `Last-Event-ID`, and provide durable/session-correlated replay when operating across restart, load balancing, or multiple instances.

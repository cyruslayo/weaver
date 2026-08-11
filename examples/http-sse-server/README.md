# HTTP/SSE reference server

A dependency-free Node reference implementation of Weaver's non-normative browser HTTP/SSE binding.

```bash
node examples/http-sse-server/server.mjs
```

It binds to `127.0.0.1:8787` by default (`PORT` may override the port), accepts `POST /a2ui/stream`, and receives client messages at `POST /a2ui/send`.

One server instance represents one trusted remote peer and permits one active stream. It has a 1 MiB request limit, no buffering/reconnect, authentication, CORS policy, persistence, clustering, or routing/session IDs. **The reference server is not a production security boundary.** A real host must authenticate and correlate stream/send requests with its own trusted peer/session infrastructure. Cross-origin hosts must configure their own CORS policy.

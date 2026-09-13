# Weaver reference application

This small framework-free app proves the complete application pipeline, rather
than only the renderer surface shown by the [playground](../playground/):

```text
application agent -> A2UI producer -> JSONL -> validated ingestion
  -> Weaver runtime -> Basic Web renderer -> trusted server event
  -> application agent -> producer -> JSONL -> ingestion -> refreshed UI
```

The local `createReferenceAgent()` is deliberately deterministic. It owns only a
request draft and result count, and creates every A2UI lifecycle message with
`createA2UIV091Producer()`. It is not an LLM, makes no network calls, and needs
no API key. A real application would replace its transition with its own agent,
model, or orchestrator outside Weaver; no provider SDK belongs in this runtime
example.

`agent-stream.ts` is the in-process JSONL adapter. It serializes one producer
message per line and sends it to one long-lived
`createA2UIV091StreamIngestion({ runtime: web.runtime })`. `finish()` validates
an unterminated final frame and `reset()` clears decoder state without changing
runtime state; normal button updates keep the logical stream open.

The button uses normal Basic input bindings and action context bindings. The
trusted `onServerEvent` bridge accepts only `reference.createRequest`, validates
its context, and invokes the deterministic agent. Unknown names are rejected;
they are never used for dynamic dispatch. The handler does not scrape DOM
controls. Attribution is also host-provided (`Reference Agent`), not read from
generated theme or agent data.

The app configures finite runtime budgets (`maxResolutionDepth: 16` and
`maxResolvedInstances: 64`). The normal flow is asserted to resolve inside
that policy; budgets are not disabled or bypassed.

## Run

```sh
pnpm --filter @weaver/reference-app dev
pnpm --filter @weaver/reference-app test
pnpm --filter @weaver/reference-app build
```

The example intentionally has no routing, persistence, accounts, networking,
backend simulation, custom catalog, custom renderer, MCP integration, or
framework dependency.

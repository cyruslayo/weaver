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

## Prompt sample with a canned model response (no LLM)

`src/prompt-sample.ts` shows the model half of the loop without a model:

```text
trusted catalog + one trusted action -> buildReferencePrompt()
  -> model (canned here) -> JSONL -> validated ingestion -> Weaver runtime -> UI
```

`buildReferencePrompt()` calls `generateA2UIV091Prompt()` with the Basic
catalog and the single trusted action, `reference.createRequest`, whose context
matches the Submit button. It also passes one worked example. The generator
validates that example through a scratch runtime before it reaches the prompt.
The output is deterministic, and nothing calls a network or a model.

`src/canned-model-response.jsonl` holds a hand-written model output: three valid
v0.9.1 frames that create the `reference-request` surface. The test feeds it
through `createA2UIV091StreamIngestion()`, asserts that every frame is accepted,
and checks the surface in happy-dom. A second, broken response (an undeclared
component and truncated JSON) is rejected frame by frame, and the prior surface
keeps its tree, data model, and text.

A real provider call would replace only the canned text. The loop itself does
not change. The sketch below is pseudo-code and adds no SDK dependency:

```text
systemPrompt = buildReferencePrompt()
text = await callModel({ system: systemPrompt, user: userRequest })  // provider call goes here
for line in text.split("\n"):
  ingestion.push(line + "\n")   // every frame passes strict validation before state changes
```

## Run

```sh
pnpm --filter @weaver/reference-app dev
pnpm --filter @weaver/reference-app test
pnpm --filter @weaver/reference-app build
```

The example intentionally has no routing, persistence, accounts, networking,
backend simulation, custom catalog, custom renderer, MCP integration, or
framework dependency.

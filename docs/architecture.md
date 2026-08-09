# Weaver Architecture

## Package dependencies

```text
@weaver/core
    ^
    |
@weaver/web

@weaver/core
    ^
    |
@weaver/mcp
```

The dependency rules are strict:

- core must not depend on web
- core must not depend on mcp
- web must not depend on mcp
- mcp must not depend on web

## Responsibilities

Weaver handles interface runtime behavior. A2UI will define interface messages.
MCP will expose application capabilities. Applications own business rules and
data. Agents may coordinate MCP and A2UI. Weaver does not require an agent.

Neither A2UI nor MCP behavior is implemented during the workspace bootstrap.

## Application boundary

```text
Zynra
  |
  +--> depends on Weaver

Weaver
  |
  +--> must know nothing about Zynra
```

Zynra is a future consumer. Its backend reference under `docs/references/` is
documentation only and cannot enter any package because packages publish only
their `dist` directories.

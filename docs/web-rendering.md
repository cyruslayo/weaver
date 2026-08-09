# Web rendering

## Pipeline

```text
                        @weaver/core

                      WeaverRuntime
                           │
                           ↓
                 WeaverResolvedSurface
                           │
                           ↓
                        @weaver/web
                           │
                  WebSurfaceRenderer
                           │
                           ↓
                    RendererRegistry
                           │
                           ↓
                     trusted DOM
```

`WebSurfaceRenderer` requires a host-owned runtime. It resolves the current
surface, renders descendants before parents, and preserves each Core structural
relationship's `property` and `kind`. Renderers receive hydrated properties,
instance identity, resolved relationship nodes, and the check snapshot selected
by the full `sourceComponentId + scopePath` identity.

## Trust boundaries

```text
Catalog validation   = component data is allowed
Renderer registration = browser implementation is allowed
```

A validated component still requires an explicitly registered trusted renderer
for its exact `catalogId + component` identity. There is no cross-catalog,
wildcard, default, or unknown-component fallback.

A2UI data never loads renderer code. Renderer implementations are host
application code registered during initialization. Weaver does not deserialize
code or use `eval`, `new Function`, dynamic script URLs, HTML strings,
`innerHTML`, or a UI framework at this boundary.

## Renderer interactions

Trusted renderers receive narrow, instance-bound callbacks, never the runtime or
its stores, registries, evaluators, writers, or dispatchers:

```text
renderer DOM input
      ↓
interactions.writeInput(property, normalizedJsonValue)
or interactions.dispatchAction(actionProperty)
      ↓
WeaverRuntime
```

The renderer chooses writable and action property names. It also converts
browser-specific values (for example text to `string`, checkbox state to
`boolean`, and range values to finite numbers). The bridge performs no coercion.
Core validates the property and type against the current component definition.
Identity (`surfaceId + sourceComponentId + scopePath`) is bound when the render
input is created; runtime methods still resolve the current instance rather than
using the rendered instance as authority.

Input writes are synchronous and local. Ordering is:

```text
browser input → runtime.writeInput() → DataModel mutation → rerender
later action  → runtime.dispatchAction() → reads current DataModel
```

There is no automatic action after input and no batching or async scheduling.

A server-event action remains transport-neutral. An optional `onServerEvent`
host callback receives defensive copies of the Core message and optional
transport metadata (including `a2uiClientDataModel` when requested):

```text
ActionDispatcher → server event result → optional onServerEvent → host → future transport
```

The callback is a handoff, not delivery. Missing callbacks do not make dispatch
fail. Local functions have already run in Core and are never handed off. Blocked
or failed actions are not handed off. Host callback exceptions are isolated as
`SERVER_EVENT_HANDOFF_FAILED`; successful Core state is not rolled back.

## Generation safety

Every rendered interaction belongs to one mount generation. Each render attempt
first advances that mount's monotonically increasing generation, invalidating
all previous callbacks. This includes subscription rerenders, manual `refresh()`
requests, failed render attempts, and unmount. Stale callbacks return
`STALE_RENDER_INTERACTION` without reaching Core.

A failed detached-tree render intentionally preserves the previous successful
DOM, but that visible DOM is inert because Core may already represent newer
state. Recovery creates a fresh generation. Mounts track generations
independently; node connectivity and rendered-value equality are not freshness
signals. Full rerendering reduces stale browser interaction risk, but v0.9.1
identity remains positional: array changes can make the same component ID and
scope path refer to a different item because no stable item key exists.

## Mounting and replacement

Each mount appends one ordinary Weaver-owned container to its target. Host-owned
siblings remain untouched. Unmounting unsubscribes and removes only that
container. Multiple mounts have independent containers and subscriptions.

Task 20 renderer strategy is a full derived DOM subtree rebuild per surface
mutation. Incremental DOM reconciliation is deferred until profiling proves a
need.

```text
runtime subscription
       ↓
resolve current surface
       ↓
build new DOM subtree
       ↓
successful?
   /          \
 no            yes
 |              |
keep old DOM   replace mount subtree
```

A progressive surface without `root` is successful `ready: false` state: the
mount remains active and its generated subtree is empty. Rendering constructs a
complete detached tree before replacement, so a missing renderer, invalid
renderer result, or trusted renderer exception leaves the previous successful
DOM intact. Returned nodes become owned by the Weaver mount.

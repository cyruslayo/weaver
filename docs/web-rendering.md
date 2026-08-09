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

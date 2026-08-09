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
relationship's `property`, `kind`, and runtime structural `location`. Renderers receive hydrated properties,
instance identity, resolved relationship nodes, and the check snapshot selected
by the full `sourceComponentId + scopePath` identity.

Web renderers must not resolve `DataBinding` or `FunctionCall` values. Core
hydrates supported direct, `allOf`-wrapped, and structurally nested Dynamic*
locations before rendering, including array-item fields such as option labels.
Progressively missing nested values may remain `undefined`. Browser-specific
DateTime normalization and presentation fallback remain renderer concerns. Structural ComponentId/ChildList leaves are absent from presentation properties; their already-rendered child Nodes arrive through relationships. `WebRenderedRelationship.property` is not unique within a parent: nested schemas may produce repeated leaves such as `child` at `/tabs/0/child` and `/tabs/1/child`, so composite renderers must associate them by `location`.

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

## Basic Catalog foundation coverage

Hosts compose the production foundation allowlist with application renderers:

```ts
const renderers = new RendererRegistry([
  ...createBasicCatalogRendererRegistrations({ catalogId, resourcePolicy }),
  ...applicationRenderers,
]);
```

Basic renderer registrations do not own catalog schema identity. The host passes the `catalogId` used by `WeaverRuntime`; schema trust and renderer implementation trust remain separate.

| Basic Catalog component | Status |
| --- | --- |
| Text | Implemented |
| Divider | Implemented |
| Row | Implemented |
| Column | Implemented |
| List | Implemented |
| Card | Implemented |
| Button | Implemented |
| TextField, CheckBox, Slider, ChoicePicker, DateTimeInput | Implemented |
| Image, Video, AudioPlayer | Implemented |
| Icon, Modal, Tabs | Deferred |

Unimplemented components remain absent from the registry and fail with `RENDERER_NOT_FOUND`; detached-tree construction preserves the last successful DOM, and a later supported update recovers normally.

## Basic media resource policy

The media trust boundary is explicit:

```text
A2UI/Core = produces hydrated resource string
      ↓
Basic media renderer = requests host approval
      ↓
host resource policy = decides whether and how the browser loads the resource
      ↓
native browser element
```

`createBasicCatalogRendererRegistrations` accepts an optional synchronous `resourcePolicy`. A policy can allowlist domains, map asset identifiers, proxy resources by rewriting URLs, or deny resources. Its returned string is authoritative; `undefined` denies loading. No resource policy means no agent-supplied media URL is loaded. This deny-by-default behavior is a Weaver Web security decision, while non-media renderers continue normally. Missing and blank URLs do not invoke the policy.

Image uses `<img>` with explicit schema-enum mappings for `object-fit`, safe variant hooks, and `alt=""` when no hydrated description exists. Video and AudioPlayer use native controls and do not autoplay. Audio description is rendered as plain figcaption text. Media loading and native load failures remain browser-local presentation behavior; Weaver adds no fetch, probing, retries, caching, or media events.

Task 22 Text renders strings with `textContent` and uses native headings, paragraph, and `small` semantics. Missing, mismatched, and explicit `null` values display as empty text. Task 22 outputs plain text only. Simple Markdown rendering remains a later conformance item.

Task 22 provides native semantics, essential flex layout behavior, separator geometry, and stable `data-a2ui-component` / Button `data-a2ui-variant` host styling hooks. It does not provide theme translation, brand styling, spacing, typography styling, or a full visual design system. `surface.theme` is not consumed.

Row and Column default to `justify = start` and `align = stretch`. List defaults to vertical direction and stretch alignment. Known enum values alone map to CSS; component property objects are never copied into styles. List children are wrapped in `role=listitem`; Card and Button consume the resolved `child` relationship.

A Basic Button uses native `disabled` state to mirror Core's current check snapshot: `invalid`, `pending`, and `error` disable it, while `valid` enables it. No snapshot leaves normal behavior unchanged. An absent progressive child is a renderer-level reason to disable the otherwise empty button until rerender. Core `ActionDispatcher` remains the authoritative action gate; browser disabled state is not a security boundary. Clicks call only `interactions.dispatchAction("action")`, relying on the existing generation guard and local/server action paths.

## Basic input policy

Web owns native browser normalization before delegating every write through `WeaverRuntime.writeInput()`; Core remains authoritative for binding paths and value types:

```text
TextField     → string
CheckBox      → boolean
Slider        → finite number
ChoicePicker  → string[]
DateTimeInput → string (ISO policy below)
```

`TextField` uses text, textarea, number, and password controls. The number variant provides native numeric editing UX, but its A2UI model value remains a string (unlike Slider). During IME composition, intermediate input events do not write; `compositionend` writes the final composed string once. `TextField.validationRegexp` is not executed by Weaver Web yet. Core `CheckRule` validation remains the authoritative implemented path.

ChoicePicker uses native radio controls for `mutuallyExclusive` and checkboxes for `multipleSelection`; both store `string[]`. Its optional case-insensitive label filter is ephemeral Web-only state and never writes the DataModel.

Date-only values use `YYYY-MM-DD`; time-only values use the native ISO-compatible time string and permit seconds. Combined date/time values populate `datetime-local` using browser-local wall time and write `Date.toISOString()` UTC values. Invalid or unrepresentable values and constraints render empty or are omitted without failing the surface. When both enable flags are false, Web renders a disabled, non-writing text representation.

All five inputs render only failed-check messages when component status is `invalid`, associate them with native controls, and set `aria-invalid=true`. Pending/error checks are not presented as confirmed validation failures. Validation never disables an input by itself; users can edit invalid values.

## Focus continuity

Weaver Web still performs full subtree replacement. Renderers register controls using component-local keys; each mount internally combines the key with `sourceComponentId + scopePath` in Weak DOM metadata. Before every render attempt Web captures a registered active control and supported text selection, invalidates the old interaction generation, and builds detached DOM. After successful replacement only, it focuses the matching control with `preventScroll` and restores its selection range where supported. Failed renders preserve visible but stale old DOM without reactivation. This is interactive-rendering correctness, not reconciliation or a virtual DOM.

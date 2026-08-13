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

## Mount-local renderer state

Renderer-local state is ephemeral Web presentation state. It is mount-local,
component-instance-local (`sourceComponentId + scopePath`), non-protocol, and
non-DataModel. It never enters `SurfaceStore`, `WeaverRuntime`, A2UI messages, or
server events. Tabs uses it for `selectedIndex`; Modal uses it for `open`. Modal open state is
mount-local renderer presentation state, not DataModel, protocol, or action state.

```text
DOM interaction
      ↓
setLocalState()
      ↓
mount refresh
      ↓
full subtree replacement
```

The refresh uses the normal focus capture, generation invalidation, detached
build, atomic replacement, and focus restoration pipeline. Reads and writes are
defensive JSON-like copies. Successful presentations prune state for absent
instances; failed attempts do not. A successful progressive `ready: false`
render and unmount clear all state for that mount. There is no persistence or
state subscription system.

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

## Basic theme bridge

`A2UI createSurface.theme` is catalog-defined surface data. Weaver Core validates it and retains it in the defensive `SurfaceSnapshot` and runtime resolution. Web styling is a separate, explicit host trust choice:

```text
createSurface.theme
      ↓
CatalogRegistry validation
      ↓
SurfaceSnapshot
      ↓
optional WebSurfaceThemeAdapter
      ↓
allowlisted CSS custom properties
      ↓
Weaver-owned mount
      ↓
Basic renderers
```

Hosts opt in with `themeAdapter: createBasicCatalogThemeAdapter({ catalogId })`. The exact caller-supplied catalog ID isolates Basic interpretation from custom catalogs. The Task 32 adapter maps only `theme.primaryColor` in `#RRGGBB` form to `--a2ui-color-primary`. Additional catalog-valid theme properties are ignored rather than mapped automatically. Without an adapter, agent theme data has no Web styling effect.

Hosts may independently provide inherited `--a2ui-color-primary` and `--a2ui-color-on-primary` values without enabling agent translation. Precedence is: an agent primary color translated onto the mount; otherwise an inherited host variable; otherwise the Basic renderer fallback. Adapter properties are applied only to the ordinary Weaver-owned mount container, never document-global styles. Each mount tracks and removes only its own stale adapter properties.

`theme.agentDisplayName` and `theme.iconUrl` are untrusted attribution claims. Catalog validation establishes only their structural validity; it does not make them verified identity. The theme adapter does not render or load them.

## Trusted surface attribution

`WebSurfaceAttributionProvider` is the explicit trusted host boundary:

```text
createSurface.theme claims
        ↓
surfaceId + catalogId + defensive theme snapshot
        ↓
trusted host attribution provider
        ↓
verified displayName + optional iconUrl
        ↓
Weaver-owned surface chrome
        ↓
A2UI component root
```

The host or orchestrator authenticates or validates the actual surface owner and may ignore the raw claims, compare them with trusted identity, or replace them from a registry. Weaver does not authenticate agents and does not prescribe the verification algorithm. The provider receives only ordinary `surfaceId`, `catalogId`, and a defensive theme copy—never runtime, stores, registries, data contexts, or evaluators. Provider mutation cannot affect Core, the theme adapter, or later renders.

Without a provider, no attribution DOM or attribution image is created. A provider returning `undefined` likewise removes attribution on the next successful atomic render. A successful result requires a non-whitespace `displayName`; an invalid result or provider exception is a typed Web rendering failure and leaves the previous successful DOM and theme intact. Exception text is not exposed.

Only the provider-returned `iconUrl` may become the chrome image `src`. Raw `theme.iconUrl` is inert. The returned URL is treated as a host-approved browser resource and may already be rewritten, proxied, signed, local, or CDN-hosted; this does not change the independent Basic media resource policy.

Attribution is plain native DOM inside the existing Weaver-owned mount and outside the A2UI component tree: an optional static `data-weaver-surface-attribution` row, optional decorative 24×24 `img` with `alt=""` and `object-fit:contain`, and a `span` populated with `textContent`. It has inherited text color, uses `var(--a2ui-space, 8px)` for gap and bottom separation, exposes no surface/catalog/claim identity attributes, and adds no interaction or focus target. It is rebuilt and replaced atomically with the A2UI root. Each mount invokes the provider independently and owns its own chrome.

## Basic Catalog foundation coverage

Hosts compose the production foundation allowlist with application renderers:

```ts
const renderers = new RendererRegistry([
  ...createBasicCatalogRendererRegistrations({ catalogId, resourcePolicy, iconResolver }),
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
| Tabs | Implemented |
| Modal | Implemented |
| Icon | Implemented |

Tabs uses native button headers in a `tablist`, one live `tabpanel`,
`aria-selected`, ARIA ID associations, and roving tabindex. ArrowLeft and
ArrowRight wrap, while Home and End select the boundary tabs; navigation uses
automatic activation and the normal registered-control focus restoration.
Each `tabs[index]` maps to its repeated `child` relationship by structured
location `/tabs/{index}/child`, never by raw ComponentId or leaf property alone.
Missing titles render empty and missing selected children produce an empty
panel. `selectedIndex` is positional: reordering preserves the numeric index,
not semantic tab identity; an out-of-range index renders as zero.

Only the selected Tabs child is inserted into the live DOM. A closed Modal likewise inserts only its direct `/trigger` relationship; an open Modal inserts only `/content` in its dialog. The current generic child-first renderer may still construct inactive descendants off-DOM. This can initiate policy-approved native media resource loading when `src` is assigned. These milestones do not claim lazy rendering or weaken the resource policy; selective relationship construction remains a future optimization if profiling or security requirements justify it.

Modal wraps its trigger in a neutral capture listener. Activation opens it locally before an actionable trigger Button can dispatch; non-interactive triggers receive `role=button`, `tabIndex=0`, Enter, and Space behavior. Actions and inputs inside content retain normal A2UI behavior and never close the Modal automatically. The open presentation contains an in-mount backdrop and `role=dialog` / `aria-modal=true` dialog with a generic accessible name because the Basic schema supplies no title. Close button, backdrop click, and Escape dismiss locally.

Opening maps registered trigger focus to the close control; every dismissal path maps focus through the close control and back to the trigger. Tab and Shift+Tab wrap inside the open dialog, while normal registered input focus and caret restoration continue across full rerenders. Nested Modals require no global stack: the closest active dialog consumes handled Tab/Escape events, so its keyboard containment, dismissal, and focus return do not affect its open parent. The Modal remains inside the Weaver mount: it uses no portal and mutates neither `document.body` nor host-owned siblings.

All 18 Basic Catalog components have renderer coverage and a complete-surface smoke gate. Visual/functional hardening, trusted attribution, and the final v0.9.1 conformance audit are complete. Detached inactive/closed descendants remain eagerly constructed as the accepted R155 hardening limitation.

## Basic Icon policy

A catalog bindable union is narrowly defined as direct `oneOf` literal/value branches plus exactly one direct `DataBinding` branch. Core resolves that binding through the instance `DataContext` and validates the result against the compiled literal branches. There is no general `oneOf` interpretation, `anyOf` bindable-union support, or bindable `FunctionCall` union support.

A standard named Icon is passed to the optional synchronous resolver configured on that Basic registration factory. The resolver may use the host's own icon set or static map and returns SVG path data. No resolver, or an `undefined` result, produces a safe empty SVG marked unresolved; there is no global registry, icon dependency, network fallback, name conversion, or warning.

Explicit `{ svgPath }` values bypass the resolver. Web creates `<svg>` and `<path>` with native namespaced DOM APIs and sets only the path `d` attribute; no SVG markup parsing occurs. Icons use `fill=currentColor`, are decorative by default (`aria-hidden=true`, `focusable=false`), and add no interaction. Semantic and accessibility meaning belongs to the surrounding component.

Weaver Basic Web renders path data at 24×24 in a `0 0 24 24` viewBox. This is a Web rendering decision because the Basic schema supplies no separate viewBox metadata.

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

Text uses native headings, paragraph, and `small` roots. Task 34 scans hydrated strings directly into allowlisted native DOM nodes: text nodes, `<strong>`, `<em>`, `<code>`, and `<br>`. It supports paired `**`/`__` strong, `*`/`_` emphasis, single-backtick inline code, recognized-marker backslash escapes, and maps every newline to `<br>` without creating paragraph blocks. Inline code does not interpret formatting markers. HTML, links, images, and block Markdown are not interpreted and remain literal text; no URL or resource-policy behavior is involved. The deliberately non-recursive scanner does not support nested formatting. Malformed or unsupported syntax remains readable literal text. Unexpected scanner failures fall back to the original raw text. Weaver generates and parses no HTML strings. Missing, mismatched, and explicit `null` values produce an empty semantic root; later hydrated strings and function-produced strings use the same scanner on rerender, with no Web function evaluation.

Task 22 provides native semantics, essential flex layout behavior, separator geometry, and stable `data-a2ui-component` / Button `data-a2ui-variant` host styling hooks. Task 32 adds only the optional primary accent bridge; it does not add broad brand styling, spacing, typography styling, or a theme engine.

Row and Column default to `justify = start` and `align = stretch`. For the schema's underdefined `justify=stretch`, Weaver Web uses start packing and gives every unweighted direct Element child `flex-grow: 1`; a valid explicit non-negative weight wins, including zero and fractional values. An ignored negative weight has no usable explicit meaning, so the stretch default applies. This is an explicit Weaver Web interpretation because Flexbox has no useful main-axis `justify-content: stretch` behavior for flex items. Cross-axis `align=stretch` remains ordinary Flexbox behavior.

List defaults to vertical direction and stretch alignment. A vertical List uses `overflow-y:auto`, `overflow-x:hidden`, and zero minimum flex dimensions so it scrolls when an ancestor constrains it. A horizontal List uses row direction, `overflow-x:auto`, `overflow-y:hidden`, and `flex-wrap:nowrap`. Its List-owned `role=listitem` wrappers use `flex-shrink:0` and `max-width:100%`, preserving natural child width up to the viewport without mutating child styles or imposing a fixed width. Native scrollbars remain available. Static and template children retain order and list semantics; List never interprets child weight. Known enum values alone map to CSS; component property objects are never copied into styles. Card and Button consume the resolved `child` relationship.

Basic `weight` belongs to the child component schema, but its layout meaning is parent-owned. `WebRenderedRelationship` carries a defensively owned snapshot of each target child's hydrated properties alongside its rendered Node. A direct Row or Column parent maps a finite, non-negative numeric `weight` to that child Element's inline CSS `flex-grow` before DOM commit. Zero and fractional values are preserved; omitted, non-finite, and negative values are ignored. Negative protocol data is not mutated. Weight outside a direct Row/Column relationship has no Web layout effect, including children of List, Card, Tabs, Modal, and Button. Non-Element custom renderer Nodes are left unchanged and are never wrapped.

A Basic Button uses native `disabled` state to mirror Core's current check snapshot: `invalid`, `pending`, and `error` disable it, while `valid` enables it. No snapshot leaves normal behavior unchanged. An absent progressive child is a renderer-level reason to disable the otherwise empty button until rerender. Core `ActionDispatcher` remains the authoritative action gate; browser disabled state is not a security boundary. Clicks call only `interactions.dispatchAction("action")`, relying on the existing generation guard and local/server action paths.

## Basic visual defaults

Basic Web owns a small, deterministic presentation layer; these values are renderer defaults, not protocol data. `Row`, `Column`, and `List` remain spacing-neutral (no renderer margin or padding). Visual leaves and outlined controls instead receive one external `var(--a2ui-space, 8px)` margin on their renderer-owned component root. Tabs and Modal do not receive this generic margin, and internal labels, controls, options, and validation messages do not receive additional component margins.

Text preserves native semantic roots and inherited color. Body is `1em` normal weight; headings h1–h5 are respectively `2.5em`, `2em`, `1.75em`, `1.5em`, and `1.25em`, with 700 weight and 1.2 line height; caption is `0.8em`, normal weight, and italic. Safe inline Markdown remains on the semantic root.

Image is block-level and responsive with `max-width:100%`. Geometry is: icon 24×24px; avatar 40×40px and circular; smallFeature 100×100px; mediumFeature width 100% up to 300px; largeFeature width 100% with 400px maximum height; header width 100% and height 200px. The independent closed `fit` property remains authoritative for `object-fit`, including denied or missing sources.

Cards use a transparent surface, outline, radius, 16px padding, and subtle shadow. Every Card applies the same treatment, so nested boundaries remain distinct without depth state. Buttons share spacing, padding, and radius: default uses a neutral control surface and outline, primary uses the primary/on-primary variables, and borderless stays transparent. ChoicePicker's `checkbox` display style is a native expanding vertical option list; `chips` is a wrapping chip-like group whose native radio/checkbox controls remain visible.

Hosts may override the inherited `--a2ui-space`, `--a2ui-radius`, `--a2ui-color-outline`, `--a2ui-color-control`, and `--a2ui-card-shadow` properties. These optional visual hooks are not mapped from agent theme data; the Basic theme adapter continues to map only `theme.primaryColor` to `--a2ui-color-primary`.

## Basic input policy

Web owns native browser normalization before delegating every write through `WeaverRuntime.writeInput()`; Core remains authoritative for binding paths and value types:

```text
TextField     → string
CheckBox      → boolean
Slider        → finite number
ChoicePicker  → string[]
DateTimeInput → string (ISO policy below)
```

`TextField` uses text, textarea, number, and password controls. The number variant provides native numeric editing UX, but its A2UI model value and matcher input remain strings (unlike Slider). During IME composition, intermediate input events do not write; `compositionend` writes the final composed string once. The resulting DataModel notification drives the ordinary full rerender, so local regexp presentation is derived from the current hydrated value and preserves the existing focus/caret continuity behavior.

For date-and-time controls, `createBasicCatalogRendererRegistrations` also accepts an optional synchronous `dateTimeInputLocalValueResolver`. Without it, the backward-compatible path remains `new Date(rawLocalValue).toISOString()`. With it, the host receives the native `datetime-local` value before any `Date` conversion, together with `surfaceId`, `sourceComponentId`, `scopePath`, and the current bound value. The host must explicitly accept with its selected canonical string or reject with a native validation message; rejection and resolver exceptions fail closed without a DataModel write. Date-only and time-only controls are unchanged.

```ts
createBasicCatalogRendererRegistrations({
  catalogId,
  dateTimeInputLocalValueResolver: ({ rawValue }) =>
    rawValue === "2032-03-14T02:30"
      ? { status: "reject", message: "Choose an existing local time." }
      : { status: "accept", value: resolveInHost(rawValue) },
});
```

Weaver deliberately defines no timezone or DST policy. Resolver identity is the protocol surface plus source component and scope path; it is stable while that component instance exists on the mounted surface. Hosts can discard tracked validation state through their existing surface unmount/deletion lifecycle. Resolver output remains host-selected client data, not trusted server authority: servers must validate received values independently. This seam prevents destructive client-side ambiguity; it does not replace server validation.

`validationRegexp` is an optional TextField-local validation hint. Execution requires the host to pass a trusted `BasicRegexMatcher` explicitly to `createBasicCatalogRendererRegistrations`; hosts may share the same matcher with `createBasicCatalogFunctionImplementations`, but the factories are not linked. Weaver never executes agent patterns with JavaScript `RegExp`, never sets the native input `pattern` attribute, and does not write validation results to the model. Missing dynamic values are pending and are not matched; the empty string is matched. A missing matcher is exposed only as `data-a2ui-regexp-state="unavailable"` and does not alter ordinary Core presentation. Matcher exceptions and non-boolean results are errors, fail soft, and expose no host error text.

Combined Web presentation uses `invalid > error > pending > valid`. A confirmed invalid control receives `aria-invalid=true`, visible validation text, and an `aria-describedby` association to every applicable opaque message ID; existing unrelated description tokens are preserved and deduplicated. Error, pending, and unavailable states do not claim confirmed invalidity. Failed Core messages remain visible in deterministic check order. A confirmed regexp mismatch additionally renders the renderer-owned text `Value does not match the required format.` and associates it with the TextField. This generic Weaver UI text is not an agent-authored `CheckRule` message. `validationRegexp` is Web presentation/input validation only. `CheckRule` remains Core validation and the authoritative action gate; business or security correctness that must block an action requires a real check or application/domain validation. A regexp mismatch alone does not produce `ACTION_BLOCKED_BY_CHECKS`.

ChoicePicker uses native radio controls for `mutuallyExclusive` and checkboxes for `multipleSelection`; both store `string[]`. Its optional case-insensitive label filter is ephemeral Web-only state and never writes the DataModel.

Date-only values use `YYYY-MM-DD`; time-only values use the native ISO-compatible time string and permit seconds. Combined date/time values populate `datetime-local` using browser-local wall time and write `Date.toISOString()` UTC values. Invalid or unrepresentable values and constraints render empty or are omitted without failing the surface. When both enable flags are false, Web renders a disabled, non-writing text representation.

All five inputs render only failed-check messages when component status is `invalid`, associate them with native controls, and set `aria-invalid=true`. Pending/error checks are not presented as confirmed validation failures. Validation never disables an input by itself; users can edit invalid values.

## Focus continuity

Weaver Web still performs full subtree replacement. Renderers register controls using component-local keys; each mount internally combines the key with `sourceComponentId + scopePath` in Weak DOM metadata. Before every render attempt Web captures a registered active control and supported text selection, invalidates the old interaction generation, and builds detached DOM. After successful replacement only, it focuses the matching control with `preventScroll` and restores its selection range where supported. Failed renders preserve visible but stale old DOM without reactivation. This is interactive-rendering correctness, not reconciliation or a virtual DOM.

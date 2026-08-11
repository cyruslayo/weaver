# Weaver conformance with A2UI v0.9.1

## Weaver v0.9.1 baseline decision

**CONFORMANCE BASELINE ACCEPTED.** Weaver Core/Web has no known `NOT-IMPLEMENTED` v0.9.1 requirement. Remaining statuses are architecture-owned transport/host work, specification ambiguities, and one accepted renderer hardening limitation. Weaver Core/Web is not by itself an A2A, HTTP/SSE, or MCP transport implementation.

Detached descendant/resource construction is **ACCEPTED FOR WEAVER V0.9.1 BASELINE**. Focused tests show closed Modal content and inactive Tabs descendants are constructed off-DOM, and approved Image/Video/AudioPlayer elements receive `src` before live mount. Construction does not dispatch A2UI actions, write the DataModel, execute action effects, call `openUrl`, bypass resource approval, or commit stale DOM. A browser may begin loading already host-approved media early; avoiding that would require lazy branch construction and is an accepted renderer hardening limitation, not an A2UI wire-conformance failure.

> Canonical conformance tracker. Release-gate date: **2026-08-10**. Official repository snapshot: `a2ui-project/a2ui@ec97cb0d7499932e67003ffe5b709a3db7e7033a`.

| Field | Value |
|---|---|
| Target protocol | A2UI v0.9.1 |
| Weaver status | pre-1.0 |
| Audit scope | `@weaver/core`, `@weaver/web`, `@weaver/mcp`, playground where relevant |
| Audit method | Official schemas and documents → implementation → status → test/code evidence → action |

## Status vocabulary and summary

- **PASS** — requirement implemented and tested.
- **PARTIAL** — meaningful support exists but the requirement is incomplete (including implemented behavior without a direct regression test).
- **DEFERRED-BY-ARCHITECTURE** — belongs to an intentionally separate layer not yet implemented.
- **NOT-IMPLEMENTED** — Weaver should implement it but does not.
- **NOT-APPLICABLE** — requirement does not apply to this package/layer.
- **SPEC-AMBIGUOUS** — official sources materially disagree or leave behavior undefined.

| PASS | PARTIAL | DEFERRED-BY-ARCHITECTURE | NOT-IMPLEMENTED | NOT-APPLICABLE | SPEC-AMBIGUOUS | Total |
|---:|---:|---:|---:|---:|---:|---:|
| 148 | 1 | 2 | 0 | 2 | 3 | **156** |

Counts cover the 156 numbered requirement rows (`R001`–`R156`) below. Guidance is audited but is not promoted to wire-validity merely because it suggests pixels, margins, shadows, or appearance.

## Official source register

Only first-party A2UI sources were used. Locations below are repository paths at the pinned commit.

| Key | Source and location | Class |
|---|---|---|
| P | `specification/v0_9_1/docs/a2ui_protocol.md` (envelope, transport, component/data/function/action/error sections) | protocol requirement |
| S | `specification/v0_9_1/catalogs/basic/catalog.json` (component/function/theme schema paths) | schema requirement |
| CTS | `specification/v0_9_1/json/client_to_server.json` | schema requirement |
| CAP | `specification/v0_9_1/json/client_capabilities.json` | schema requirement |
| CDM | `specification/v0_9_1/json/client_data_model.json` | schema requirement |
| G | `specification/v0_9_1/docs/basic_catalog_implementation_guide.md` | implementation guidance/recommendation, except its explicitly mandatory `openUrl` security rules |
| C | `docs/public/guides/renderer-development.md`, v0.9.1 checklists | renderer checklist requirement |

Important source detail: the v0.9.1 files retain `$id`, `$ref`, `catalogId`, and capability key strings containing `v0_9`/`v0.9`; CAP requires key **`v0.9`**. Weaver emits that exact official capability-file key.

## 1. Protocol, lifecycle, progressive rendering

| ID | Official requirement (source location; class) | Weaver implementation / evidence | Status | Remaining action |
|---|---|---|---|---|
| R001 | Four server envelope types (P “Envelope message structure”; protocol) | Exact handlers in `protocol/.../validation.ts`, `A2UIMessageProcessor.ts`; `validation.test.ts`, `A2UIMessageProcessor.test.ts` | PASS | None |
| R002 | Exactly one message discriminator (P envelope; protocol) | Exact-key and one-type validation; invalid fixtures/tests | PASS | None |
| R003 | `version` accepts v0.9 family (CTS and server schema family; schema) | Explicit `v0.9` and `v0.9.1`; rejects `v0.8`, `v1.0`; `validation.test.ts` | PASS | Preserve intentional set |
| R004 | JSON messages/values (P stream; protocol) | Recursive JSON-safe validation including component properties/data; `validation.test.ts` | PASS | None |
| R005 | Unknown/invalid envelope fails safely (P prompt-generate-validate; protocol) | Typed validation issues, no mutation; processor tests | PASS | Outbound protocol error is R091 |
| R006 | Create before updates (P `createSurface`; protocol) | Surface-not-found errors; processor/store tests | PASS | None |
| R007 | Store catalog binding, theme, `sendDataModel` (P `createSurface`; protocol) | Defensive surface state; processor/store/runtime tests | PASS | None |
| R008 | Add/update flat components (P `updateComponents`; protocol) | Atomic map upsert; processor/store tests | PASS | None |
| R009 | Data update/upsert (P `updateDataModel`; protocol) | `DataModel`; model/processor tests | PASS | Array deletion exception R035 |
| R010 | Delete all surface state (P `deleteSurface`; protocol) | Store deletion and Web unmount; store/runtime/Web tests | PASS | None |
| R011 | Duplicate create is error (P `createSurface`; protocol) | `SURFACE_ALREADY_EXISTS`; store/processor tests | PASS | None |
| R012 | Delete/recreate permits new identity (P `createSurface`; protocol) | Tested lifecycle | PASS | None |
| R013 | Catalog ID fixed; switch requires delete/recreate (P `createSurface`; protocol) | Duplicate create rejected; recreate validated against new catalog; processor tests | PASS | None |
| R014 | Root ID is `root` (P adjacency model; protocol) | Resolver starts only at literal `root`; tree/Web tests | PASS | None |
| R015 | Updates before root have no visible effect and are buffered (P adjacency; protocol) | Components retained, resolution returns missing root, later recovers; tree/Web tests | PASS | None |
| R016 | Render immediately once valid root arrives (C Progressive Rendering; checklist) | Runtime subscriptions trigger atomic Web rebuild; Web tests | PASS | None |
| R017 | Missing child references handled gracefully/skipped (P `updateComponents`; protocol) | Typed missing-reference result and partial tree behavior; tree tests | PASS | None |
| R018 | Later child delivery recovers (P progressive rendering; protocol) | Re-resolution on update; tree/instance/Web tests | PASS | None |
| R019 | Exactly one root in tree (P adjacency; protocol) | IDs are map-unique; replacement gives one current `root`; batch duplicate rejection tested | PASS | None |

## 2. Adjacency, data model, dynamic values

| ID | Requirement (source; class) | Weaver / evidence | Status | Action |
|---|---|---|---|---|
| R020 | Structural single links use `ComponentId` refs (P validator compliance; protocol) | Catalog metadata discovers exact refs; registry/tree tests | PASS | None |
| R021 | Lists use static or template `ChildList` (P common types; protocol) | Both resolved; tree/instance tests | PASS | None |
| R022 | Nested `ComponentId` in objects/arrays resolves (S Tabs/Modal paths; schema) | Relationship metadata walks nested structures; tree tests | PASS | None |
| R023 | Nested `ChildList` support for custom catalogs (P validator rules; protocol) | Metadata-based recursive discovery; catalog/tree tests | PASS | None |
| R024 | Cycles do not recurse forever (implicit valid tree; checklist) | Typed cycle detection; tree tests | PASS | None |
| R025 | Branch/component reuse is representable (P adjacency; protocol) | Same source definition may create multiple render instances; instance tests | PASS | None |
| R026 | Root replacement when path omitted or `/` (P data updates; protocol) | Both supported; model/processor tests | PASS | None |
| R027 | Path update and creation (P upsert; protocol) | Object upsert with defensive cloning; model tests | PASS | None |
| R028 | Omitted value deletes key (P data updates; protocol) | Distinguishes omitted from `null`; model/validation tests | PASS | None |
| R029 | RFC 6901 escapes (P path resolution; protocol) | `~0`/`~1` decoding; model/context tests | PASS | None |
| R030 | A2UI `/` root convention (P update defaults; protocol) | Explicit root treatment; model tests | PASS | None |
| R031 | Absolute scope from model root (P Path Resolution; protocol) | `DataContext`; context/property/action tests | PASS | None |
| R032 | Relative scope under templates (P Collection scopes; protocol) | Positional scope composition; context/instance tests | PASS | None |
| R033 | Array numeric indices only (P collection scopes; protocol) | Numeric validation; model/context tests | PASS | None |
| R034 | Array writes/upserts (P data updates; protocol) | Existing index replacement and append supported; `DataModel.test.ts` | PASS | None |
| R035 | Array delete sets index undefined while preserving length (P data updates; protocol) | Weaver rejects `ARRAY_INDEX_DELETE_UNSUPPORTED`; JSON cannot carry `undefined` and official issue is unresolved | SPEC-AMBIGUOUS | Keep documented divergence; revisit with spec resolution |
| R036 | Two-way input writes immediately (P read/write contract; protocol) | Input writer + Web events; input/runtime/Web tests | PASS | None |
| R037 | Reactive rebuild after writes/server updates (P Reactivity; protocol) | notifications + full Web rerender; runtime/Web tests | PASS | None |
| R038 | DynamicString literal/binding/call (P common types; protocol) | Catalog-driven hydration; property tests | PASS | None |
| R039 | DynamicNumber literal/binding/call | Same; property tests | PASS | None |
| R040 | DynamicBoolean literal/binding/call | Same; property/check tests | PASS | None |
| R041 | DynamicStringList literal/binding/call | Same; property/input tests | PASS | None |
| R042 | Generic `DynamicValue`/FunctionCall arguments (P functions; protocol) | Recursive argument resolver for declared schemas; evaluator tests | PASS | None |
| R043 | Nested Dynamic* needed by Basic option/tabs/function shapes (S nested properties; schema) | Recursive schema metadata; property tests | PASS | None |
| R044 | `allOf`-wrapped Dynamic* (S DateTime min/max; schema) | Discovery follows wrappers; catalog/property tests | PASS | None |
| R045 | Bindable union (`Icon.name`) (S `components.Icon.name`; schema) | Dedicated bindable-union metadata/hydration; basic/property tests | PASS | None |
| R046 | Missing dynamic data is graceful (P progressive note; guidance) | Typed unresolved values become renderer-safe fallbacks | PASS | None |
| R047 | Object/array interpolation JSON-stringifies (P Type conversion; protocol) | Basic formatString implementation/tests | PASS | None |

## 3. Functions, checks, actions, outbound schemas

| ID | Requirement (source; class) | Weaver / evidence | Status | Action |
|---|---|---|---|---|
| R048 | Functions declared by catalog (P Registered functions; protocol) | Catalog contract parsing; registry tests | PASS | None |
| R049 | Executable implementation is trusted host code (P no executable code; protocol) | Immutable `FunctionRegistry`; tests | PASS | None |
| R050 | Catalog isolation (P active catalog; protocol) | Registrations keyed by catalog/function; tests | PASS | None |
| R051 | Resolve dynamic arguments (P functions; protocol) | Evaluator/context; tests | PASS | None |
| R052 | Validate arguments and return type (S function definitions; schema) | Compiled argument/return validators; evaluator tests | PASS | None |
| R053 | Nested calls (P formatString/functions; protocol) | Evaluator recursion and parser; tests | PASS | None |
| R054 | Bound recursion depth (not required; Weaver hardening) | Configured depth limit; evaluator tests | PASS | None |
| R055 | Pure/action effect boundary (S openUrl void; security) | Effect metadata; pure contexts reject action functions | PASS | None |
| R056 | Effects only at direct local-action root (Weaver hardening) | Dispatcher root gate; action/evaluator/openUrl tests | PASS | None |
| R057 | Detect catalog `Checkable` (S Checkable mixin; schema) | Exact mixin metadata; registry/check tests | PASS | None |
| R058 | Literal boolean check condition (S common Check; schema) | Evaluator; check tests | PASS | None |
| R059 | DataBinding check condition | Evaluator; check tests | PASS | None |
| R060 | FunctionCall check condition | Evaluator; check tests | PASS | None |
| R061 | Collect failed messages (P checks; protocol) | Ordered failure messages; check/Web tests | PASS | None |
| R062 | Pending check presentation | Official v0.9.1 has synchronous functions and defines no pending state | NOT-APPLICABLE | Revisit for async protocol version |
| R063 | Check evaluation error fails closed | Typed errors and action blocking; check/action tests | PASS | None |
| R064 | Failed checks block Button action (P button validation; protocol) | Dispatcher/Web disable + guard; tests | PASS | None |
| R065 | Server event action (P Defining actions; protocol) | Transport-neutral handoff; action/runtime/Web tests | PASS | None |
| R066 | Local `functionCall` action (P local actions; protocol) | Trusted direct dispatch; action/openUrl tests | PASS | None |
| R067 | Resolve context at interaction time/scope (G Button; guidance) | Current instance/context resolver; action/Web tests | PASS | None |
| R068 | `sourceComponentId` is source ID (CTS action; schema) | Exact field; action tests | PASS | None |
| R069 | `surfaceId`, timestamp, context fields (CTS action; schema) | Exact fields and ISO timestamp; action tests | PASS | None |
| R070 | CTS top-level version/action exact shape (CTS root/action; schema) | Exact `{version:'v0.9.1',action:{...}}`; action tests | PASS | None |
| R071 | `sendDataModel` metadata on actions (P synchronization; protocol) | Transport-neutral metadata emitted when true; action/runtime/Web tests | PASS | Targeted delivery is adapter-owned |
| R072 | CDM exact `version` + `surfaces` shape (CDM root; schema) | Exact shape; each Weaver model is constrained to JSON object; action tests | PASS | None |
| R073 | Send only current surface owner (P Targeted Delivery; protocol) | Two loopback reference servers confirm session-routed deliveries are accepted only by the matching one-route HTTP/SSE adapter; wrong-route deliveries perform no POST, including optional client-data-model metadata | PASS | None |
| R074 | CAP `supportedCatalogIds` (CAP path `/v0.9/supportedCatalogIds`; schema) | Shared outbound builder and runtime emit exact `v0.9` shape; ordering/ownership/schema tests in `outbound.test.ts` | PASS | None |
| R075 | CAP `inlineCatalogs` optional (CAP path `/v0.9/inlineCatalogs`; schema) | Intentionally omitted and no inline trust path | PASS | None; optional and unsupported |
| R076 | Validation failure outbound `error` envelope (CTS `/error`; checklist) | Transport-neutral exact builder and eligible process-failure mapper; pinned CTS tests in `outbound.test.ts` | PASS | Transport decides delivery |
| R077 | Error code exactly `VALIDATION_FAILED` (CTS error oneOf; schema) | Builder fixes the outbound code to `VALIDATION_FAILED`; official-schema tested | PASS | None |
| R078 | Error `surfaceId/path/message` (CTS Validation Failed; schema) | Deterministic first normalized issue; inbound ID then trusted caller fallback; typed failure if unavailable | PASS | Host/transport may supply trusted routing context; never fabricate identity |

## 4. Transport and JSONL

| ID | Requirement (source; class) | Weaver / evidence | Status | Owner/action |
|---|---|---|---|---|
| R079 | Ordered reliable delivery (P Transport contract; protocol) | Real loopback Weaver HTTP/SSE events are processed sequentially, client POSTs are serialized, and opt-in bounded `Last-Event-ID` replay resumes only later events in order without duplicate lifecycle delivery; exhaustion and unavailable history are explicit | PASS | Production hosts own durable/session-correlated replay |
| R080 | Message framing (P Transport contract; protocol) | Core JSONL text decoder available; Weaver SSE binding uses one JSON envelope per event | PASS | Other transports own own framing |
| R081 | Metadata carriage (P Transport contract; protocol) | Real loopback POST wrappers carry exact capabilities on every request and optional routed client-data-model metadata | PASS | None |
| R082 | Bidirectional action channel (P optional contract; protocol) | Weaver Web adapter provides loopback-tested SSE server-to-client and POST client-to-server integration | PASS | None |
| R083 | `application/a2ui+json` interception (C MIME checklist; checklist) | `@weaver/mcp` performs exact, parameter-safe MIME interception for resource text and tool embedded resources; non-A2UI media never enters the runtime | PASS | None |
| R084 | A2A mapping/capability metadata (P A2A binding; protocol) | No A2A adapter by design | DEFERRED-BY-ARCHITECTURE | Future A2A adapter |
| R085 | MCP delivery (P Other transports; protocol) | Official SDK v2 modern HTTP harness proves MCP 2026-07-28 resource/tool delivery, per-request capabilities, routed actions/errors, and route isolation through `A2UITransportSession` | PASS | Application-domain server helpers remain separate |
| R086 | Arbitrary text chunks (C JSONL; checklist) | Incremental character buffer; JSONL tests | PASS | None |
| R087 | LF, CRLF, split CRLF (JSONL framing example; checklist) | All supported/tested | PASS | None |
| R088 | Unterminated final frame (reasonable stream completion behavior) | `finish()` parses/tested | PASS | None |
| R089 | Empty frame and malformed JSON recovery | Empty is INVALID_JSON; malformed frame does not poison next; tests | PASS | None |
| R090 | Maximum frame and recovery (Weaver hardening) | 1,048,576-char configurable limit/discard mode; tests | PASS | None |
| R091 | UTF-8 byte decoding boundary | Web HTTP/SSE adapter uses incremental streaming `TextDecoder`; split multibyte characters and bounded events are tested | PASS | None |

## 5. Catalog trust and custom catalogs

| ID | Requirement (source; class) | Weaver / evidence | Status | Action |
|---|---|---|---|---|
| R092 | Catalog ID and component schemas/functions/theme (P component catalog; protocol) | Direct official-style Draft 2020-12 registration; catalog tests | PASS | None |
| R093 | Resolve external common-type refs (P swappable catalogs; protocol) | Trusted schema bundle/ref map; catalog tests | PASS | None |
| R094 | Atomic registration (security property) | Compile/validate before commit; tests | PASS | None |
| R095 | Defensive ownership | Inputs/snapshots cloned; registry/store tests | PASS | None |
| R096 | No message-time catalog network resolution (P catalog ID not resolvable; protocol) | Registry is setup-only; tests | PASS | None |
| R097 | Component allowlist/property schema | Active-catalog schema validation; processor/catalog tests | PASS | None |
| R098 | Theme schema validation | Create validates catalog theme; processor tests | PASS | None |
| R099 | Function contract/checkability/structure metadata | Catalog-derived metadata; catalog tests | PASS | None |
| R100 | Dynamic/bindable metadata | Recursive trusted schema analysis; catalog/property tests | PASS | None |
| R101 | Generic Core has no Basic component names | `architecture-independence.test.ts` scans generic production Core (excluding the intentional `basic-functions` adapter) for component-name branching/lookup and Web imports | PASS | None |
| R102 | Generic Web renderer/registry has no Basic logic | Basic is separate adapter; registry tests | PASS | None |
| R103 | Deliberate exceptions | `basic-functions` in Core and `web/basic` are opt-in named adapters, not generic leakage | NOT-APPLICABLE | Keep package boundaries explicit |

## 6. Basic component matrix

All schema-property validation is delegated to the registered official Basic schema; “dynamic” below describes hydration. Common `weight` is catalog schema `$defs/CatalogComponentCommon`. Test evidence is chiefly `packages/web/src/basic/basic.test.ts`, `WebSurfaceRenderer.test.ts`, and Core property/tree/input tests.

| ID | Component | Supported schema/dynamic/structure/interaction | Accessibility / security / visual-guide state | Status | Action |
|---|---|---|---|---|---|
| R104 | Text | `text` dynamic, variants; safe simple Markdown | h1–h5/body/caption semantic roots, deterministic relative typography and margin, inherited color; direct variant/Markdown tests | PASS | None |
| R105 | Image | dynamic `url`,`description`; fit/variant hooks | `alt`, deny-by-default URL policy, responsive block base, explicit geometry for all six variants including denied-source tests | PASS | None |
| R106 | Icon | named, `svgPath`, binding; host resolver; 24×24 viewBox/currentColor | decorative `aria-hidden`; resolver/path trusted after schema; fixed viewBox is Weaver choice | PASS | Document custom paths must target 24×24 |
| R107 | Video | dynamic URL, native controls, width, no autoplay | resource policy; detached approved resource may load; no schema description | PASS | Detached loading is known hardening issue |
| R108 | AudioPlayer | URL/description dynamic, native controls, width, no autoplay | accessible label/description; policy; detached loading limitation | PASS | Same |
| R109 | Row | static/template children, row, justify/align, width, order, weight | `justify=stretch` uses start packing plus default child growth; explicit usable weight wins; direct tests cover edge cases | PASS | None |
| R110 | Column | static/template children, column, justify/align/order/weight | Same tested main-axis stretch policy as Row | PASS | None |
| R111 | List | static/template, direction/align, list/listitem semantics, weight isolation | Vertical/horizontal native scrolling, nowrap horizontal layout, and List-owned item constraints directly tested | PASS | None |
| R112 | Card | one nested child; missing child progressive; weight | transparent outlined surface, radius, padding, shadow and margin; nested and weighted regressions tested | PASS | None |
| R113 | Tabs | dynamic titles/nested child, local selected index, selected child only, click, progressive | ARIA/keyboard behavior plus reorder, shrink, and empty-safe behavior are tested; `selectedIndex` remains positional by catalog design | PASS | None |
| R114 | Modal | trigger/content, interception, local open/close, backdrop, Escape, semantics, focus trap/return | Nested production-renderer tests cover open state, closest-dialog Tab/Escape containment, backdrop, trigger/content actions, and focus return | PASS | None |
| R115 | Divider | axis, line hooks, weight | semantic separator/orientation with explicit host-overridable 1px horizontal/full-span and vertical/stretch geometry | PASS | None |
| R116 | Button | child/action/checks/variants/theme/weight | native button with shared shape and distinct default, primary and borderless treatments; child contrast inheritance tested | PASS | None |
| R117 | TextField | dynamic label/value; four variants; writes/checks/regexp/IME/focus-caret/weight | native labelled controls, invalid state/messages; number model remains string; schema/guide conflict prevents one unambiguous requirement | SPEC-AMBIGUOUS | Preserve support for both checks and trusted-host regexp |
| R118 | CheckBox | dynamic label/boolean; writes/checks/weight | native labelled checkbox; theme-aware `accent-color` and component-root margin are implemented and tested | PASS | None |
| R119 | ChoicePicker | dynamic labels, stable values, both variants/styles/filter, string[] writes/checks/weight | outlined native vertical list and wrapping native chip controls; selected/neutral treatments plus behavior/validation tested | PASS | None |
| R120 | Slider | min/max/dynamic number/decimal writes/checks/weight | native range and label | PASS | Optional visual value display not required |
| R121 | DateTimeInput | dynamic value/min/max; date/time/both; ISO writes/checks/weight | native controls/labels; local browser timezone policy; both false → disabled non-writing representation | PASS | Document timezone interoperability |

### Component-specific findings

- **Text/Markdown:** Weaver deliberately supports emphasis, strong, code, paragraphs, and safe heading text through DOM node creation. HTML, links, and images remain literal; malformed input falls back to raw text. This meets the schema’s “simple Markdown … without HTML, images, or links” more closely than a full parser. G only recommends a parser “when possible.” Semantic variants now have deterministic relative typography.
- **Image:** `fit` is a closed mapping independent of explicit geometry for all six variants. Width remains responsive where specified, and policy denial creates no browser request or geometry collapse.
- **Icon:** Named icons require a trusted host resolver; `svgPath` uses SVG DOM APIs. The 24×24 `viewBox` is Weaver-specific, consistent with G’s suggested size but potentially unsuitable for arbitrary-coordinate custom paths.
- **Media:** controls provide scrubbing where the browser supports it. No autoplay property is set. Approved `src` assignment while building the detached subtree can start a request before mount.
- **Layout:** CSS Flexbox cannot represent main-axis `justify=stretch` with `justify-content:stretch` usefully, so Weaver Web interprets it as start packing plus growth for direct children without a usable explicit weight.
- **List:** list semantics, directional native scrolling, nested flex minimum sizing, horizontal nowrap, and List-owned item constraints are covered.
- **Card:** G first suggests distinct background + corners + shadow; later recommends transparent + outline for nesting, while C says rounded corners and shadows. These are guidance/checklist tensions with multiple defensible strategies, not a single wire rule.
- **Tabs:** `selectedIndex` is intentionally positional. Reordering preserves its numeric value, shrinking falls back to render index 0 when out of range, and no index is invented for an empty renderer input. Only active content is mounted, though all descendants may first be constructed detached.
- **Modal:** trigger is visible and intercepted; close button/backdrop/Escape work. Focus enters, wraps, and returns. Nested production-renderer coverage verifies closest-dialog keyboard ownership and independent open state.
- **TextField ambiguity:** S includes `validationRegexp`; G v0.9.1 checklist says `checks` (and contrasts old regexp), while the current Basic implementation guide omits regexp. Weaver supports both, using only a trusted host matcher. Classification: **SPEC-AMBIGUOUS** (R117).
- **ChoicePicker:** the checkbox presentation remains a native expanding vertical list rather than a dropdown; chips wrap while retaining visible native controls.
- **DateTimeInput:** both flags false is unspecified. Weaver’s disabled non-writing representation is an explicit safe decision.

## 7. Basic function matrix

Implementations are opt-in trusted registrations. Tests: `packages/core/src/basic-functions/basic-functions.test.ts`; `packages/web/src/basic-functions/openUrl.test.ts`; evaluator/registry tests.

| ID | Function | Availability/capability/effect; exact behavior | Security deviation | Status |
|---|---|---|---|---|
| R122 | required | Core pure; null/undefined/empty string/empty array false | none | PASS |
| R123 | regex | Core pure only when host supplies matcher | no native agent-controlled `RegExp` | PASS |
| R124 | length | Core pure; inclusive optional min/max | none | PASS |
| R125 | numeric | Core pure; finite numeric parse/range | conservative invalid handling | PASS |
| R126 | email | Core pure; documented standard shape | none | PASS |
| R127 | formatString | Core pure parser; escapes, paths, literals, nested calls, conversion | bounded parser/evaluation | PASS |
| R128 | formatNumber | Core pure; locale/grouping/exact decimals | host locale option | PASS |
| R129 | formatCurrency | Core pure; ISO currency/locale/decimals/grouping | platform errors fail typed | PASS |
| R130 | formatDate | Core pure; supported documented TR35 tokens | rejects unsupported tokens | PASS |
| R131 | pluralize | Core pure; `Intl.PluralRules`, category → `other` fallback | none | PASS |
| R132 | openUrl | Web action; host opener/base/policy capability | mandatory URL hardening plus post-rewrite revalidation | PASS |
| R133 | and | Core pure; strict boolean list | schema validates min items | PASS |
| R134 | or | Core pure | same | PASS |
| R135 | not | Core pure; strict boolean negation | none | PASS |

`regex`: official G demonstrates native pattern construction. Weaver intentionally requires a trusted host matcher; without it the implementation is unavailable. This is deliberate security hardening, not accidental missing functionality.

`openUrl`: relative URLs resolve against a trusted base; only HTTP(S) survives initial policy and policy rewrite; target is `_blank` with `noopener,noreferrer`; it is action-effect-only and cannot execute through property/check/nested-call evaluation.

## 8. Theme, attribution, layout, color

| ID | Requirement (source; class) | Weaver / evidence | Status | Action |
|---|---|---|---|---|
| R136 | Validate `primaryColor`, `iconUrl`, `agentDisplayName`, reject unknown (S `$defs/theme`; schema) | Registered Basic schema validates all/unknowns; processor/theme tests | PASS | None |
| R137 | Apply primary color (S theme; schema/G visuals) | Opt-in trusted Web theme adapter CSS variable | PASS | Broader visual use is hardening |
| R138 | Render `iconUrl` attribution (P Identity; protocol) | Trusted Web attribution provider output alone may load a decorative chrome icon; raw claim remains inert; Web surface tests | PASS | None; host approves or rewrites URL |
| R139 | Render `agentDisplayName` attribution (P Identity; protocol) | Trusted Web attribution provider output renders as safe visible text outside the A2UI tree; raw claim remains inert; Web surface tests | PASS | None |
| R140 | Orchestrator validates attribution in multi-agent systems (P Identity; protocol) | Provider admits trusted host knowledge, but Weaver does not authenticate origin | DEFERRED-BY-ARCHITECTURE | Host/orchestrator owns authentication and verified override |
| R141 | Leaf-margin strategy (G §3; recommendation) | Direct tests verify zero Row/Column/List spacing and one shared host-overridable root margin across leaves/outlined controls | PASS | None |
| R142 | Weight on layout children (C component checklist; checklist) | Parent-aware flex mapping and isolation; Basic/Web tests | PASS | None |
| R143 | Primary Button sets inherited contrast color (G §4; recommendation) | Button sets CSS `color`; Text inherits; Icon `currentColor`; basic tests | PASS | Add nested end-to-end contrast assertion if desired |
| R144 | Nested Cards distinguishable (G §4; recommendation) | Every transparent Card owns an independently tested outline/radius/shadow boundary without depth metadata | PASS | None |

## 9. Web security and effects

| ID | Requirement (source; class) | Weaver / evidence | Status | Action |
|---|---|---|---|---|
| R145 | No unsafe HTML/code sinks | Production `packages/web/src`: no `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `DOMParser`, `createContextualFragment`, `eval`, `new Function`, `document.write` | PASS | Retain source scan in reviews |
| R146 | External resource requests are policy-controlled | Image/Video/Audio require host resource policy; openUrl requires policy; Icon named resolver may return DOM only; Markdown creates none | PASS | Theme `iconUrl` remains inert |
| R147 | No arbitrary agent CSS path | Closed mappings for weight, fit, layout, variant hooks; opt-in theme maps validated primary color only | PASS | None |
| R148 | Effect functions only through direct local action | Root/effect gate; evaluator/action/openUrl tests | PASS | None |

External-request inventory: approved Image `src`, Video `src`, Audio `src`, trusted attribution-provider icon `src`, and `openUrl` navigation can request/network. Named Icon resolution is host code; `svgPath` is inline. Markdown never creates links/images/HTML. Raw `theme.iconUrl` is validated/stored but inert. Theme, weight, fit, layout, and variant values flow through closed maps/attributes; there is no `agent property → arbitrary CSS` bridge.

## 10. Accessibility matrix

| ID | Area | Protocol/basic guidance vs Weaver | Status | Action |
|---|---|---|---|---|
| R149 | Text/Image/Icon/Button/input labels/Divider/media/List | Native headings/button/inputs/controls; image alt; icon decorative; separator orientation; list roles; controls tested in `basic.test.ts` | PASS | Expand browser-level AT testing later |
| R150 | Validation association | Confirmed invalid native controls use `aria-invalid`, visible messages, and merged opaque `aria-describedby` IDs; no global live announcer | PASS | None |
| R151 | Tabs ARIA/keyboard | tablist/tab/tabpanel relationships, selection/tabindex, click, and arrow/Home/End navigation are implemented and tested | PASS | None |
| R152 | Modal ARIA/focus | dialog/aria-modal/name, entry/return/Escape, Tab/Shift+Tab wrapping, and nested ownership are implemented and tested | PASS | None |

Accessibility semantics are principally Weaver enhancements because the wire schemas do not prescribe DOM. C/G require native widgets/interaction patterns; Weaver implements Tabs keyboard/ARIA and Modal trapping, while validation uses visible directly associated messages rather than a global live-announcement system.

## 11. Full-DOM rerender strategy and limitations

| ID | Requirement/property | Weaver / evidence | Status | Action |
|---|---|---|---|---|
| R153 | Reactive rendering without stale commits | Full detached subtree build, generation invalidation, atomic `replaceChildren`; Web tests | PASS | Preserve generation guard |
| R154 | Focus/caret continuity | Captures active input identity/selection and restores after rebuild; Web tests | PASS | Native edge cases remain |
| R155 | Inactive/closed descendants and detached resources | Focused production-renderer tests prove eager detached construction and approved media `src` assignment; security/effect/state/generation boundaries remain intact | PARTIAL | Accepted renderer hardening limitation; lazy construction requires separate evidence and architecture work |
| R156 | Template identity and resolver cost | Explicit reorder evidence shows `sourceComponentId + scopePath` identities remain `/items/0`, `/items/1` and follow positions | SPEC-AMBIGUOUS | v0.9.1 defines positional scopes and no stable template-key contract; benchmark before redesign |

Tabs selection is deliberately index-based: after reorder, the same numeric `selectedIndex` selects the new occupant of that position. Logical-tab identity is not inferred from child IDs, titles, or arbitrary data keys.

## 12. Coverage rule and evidence map

Every PASS row above cites at least a test file/group or, for negative source scans, the reproducible production-code search. Principal groups:

| Concern | Direct tests |
|---|---|
| Protocol/envelopes | `packages/core/src/protocol/a2ui/v0_9_1/validation.test.ts`, `message-processor/A2UIMessageProcessor.test.ts` |
| Lifecycle/data | `surfaces/SurfaceStore.test.ts`, `data-model/DataModel.test.ts`, `runtime/WeaverRuntime.test.ts` |
| Trees/scopes/dynamics | `component-tree`, `component-instances`, `component-properties`, `data-context` test files |
| Functions/checks/actions | `functions/*test.ts`, `basic-functions/basic-functions.test.ts`, `checks/CheckEvaluator.test.ts`, `actions/*test.ts` |
| JSONL | `transport/jsonl/JsonlDecoder.test.ts` |
| Catalog trust | `catalog/CatalogRegistry.test.ts` |
| Web/Basic/accessibility/security | `web/src/basic/basic.test.ts`, `surface/WebSurfaceRenderer.test.ts`, `basic-functions/openUrl.test.ts`, `renderers/RendererRegistry.test.ts` |

Pinned inbound tests validate canonical create/update/delete messages and invalid envelopes/components against the official server schema and exact Basic catalog. Pinned outbound tests validate capabilities, validation errors, actions, and client-data-model metadata. Architecture, security, positional identity, Tabs reorder, detached construction, all-18-renderer, and all-14-function gates are repeatable tests.

## 13. Prioritized backlogs

### Required conformance gaps

| Priority | Finding | Severity | Scope | Architectural risk |
|---:|---|---|---|---|
| 1 | Retain explicit array-delete divergence pending spec resolution (R035) | medium | Core | medium |

### Hardening / recommended visual behavior

| Priority | Finding | Severity | Scope | Risk |
|---:|---|---|---|---|
| 1 | Avoid detached construction/loading for inactive Tabs/closed Modal/media | medium | Web | high |
| 2 | Browser-level accessibility and visual regression suite | low | Web | low |

### Deliberate Weaver deviations (not defects)

| Decision | Severity | Scope | Risk / rationale |
|---|---|---|---|
| Host regex matcher; unavailable without matcher | low | Core/host | low; prevents agent-controlled native regex execution |
| Deny-by-default media resource policy | low | Web/host | low; no unapproved network requests |
| Action-effect functions only at direct local action root | low | Core | low; blocks side effects during render/check/nesting |
| Attribution authentication remains host-owned behind Web provider | medium | host/orchestrator | medium; raw claims stay inert and Weaver does not authenticate |
| Array-index deletion rejected | medium | Core | medium; JSON has no `undefined`, official behavior is unresolved |
| Fixed 24×24 SVG icon viewBox | low | Web/host | low; predictable icon contract |
| Both DateTime flags false → disabled/non-writing control | low | Web | low; safe behavior where spec is silent |

## 14. Proposed milestones derived from this audit

1. **Task 36 — protocol outbound conformance (complete):** exact capabilities serialization; transport-neutral CTS validation-error mapping; pinned outbound schema fixtures; locked existing array behavior. No network adapter.
2. **Task 37 — Basic functional/accessibility hardening (complete):** List scrolling/sizing, validation association, nested-Modal coverage, and `justify=stretch` resolution.
3. **Task 38 — Basic visual hardening (complete):** leaf margins, component variants, Card/Button/ChoicePicker/Divider visuals, inherited contrast and nested-card visual tests.
4. **Task 39 — trusted surface attribution boundary (complete):** trusted host provider output renders in Weaver-owned chrome; raw identity claims remain inert.
5. **Task 40 — final v0.9.1 conformance gate (complete):** pinned inbound/outbound schemas, architecture/security boundaries, full Basic smoke coverage, positional-state evidence, and final classification.
6. **Tasks 41–45 (complete):** transport-session routing, HTTP/SSE transport and bounded resume, then the MCP v2 A2UI client bridge. A2A remains independent and deferred.

## 15. Decisions before Zynra V2

Reconsider only these boundaries before integration:

1. Keep outbound capability/error objects in the transport-neutral Core builders; adapters must not duplicate their wire construction.
2. Preserve Task 41's host-assigned route ownership in concrete adapters so `sendDataModel` cannot cross agent boundaries; connect trusted attribution only in host code.
3. Decide whether detached full-subtree construction is acceptable for approved media and modal/tab content; this is the highest-risk renderer limitation, but does not justify replacing working architecture merely to resemble another renderer.
4. Establish stable host policy contracts (resource, URL, regex, icon) before exposing remote agents.

Task 36 changed the pre-1.0 runtime capability public shape from incorrect `v0.9.1` to official `v0.9` and added pure outbound builders/mapping. It added no transport or automatic delivery behavior.

## Final unresolved classification

- **PARTIAL:** R155 — accepted eager detached construction limitation.
- **DEFERRED-BY-ARCHITECTURE:** R084 — future A2A adapter; R140 — host/orchestrator.
- **SPEC-AMBIGUOUS:** R035 — protocol requests array deletion to JavaScript `undefined`, which JSON cannot represent; R117 — Basic schema exposes `validationRegexp` while guide/checklist sources disagree in emphasis/shape; R156 — v0.9.1 scopes are positional and `ChildList` provides no stable item key.
- **Accepted implementation limitation:** R155 — safe and correct but eager detached descendant/resource construction; approved media may begin loading before live mount.

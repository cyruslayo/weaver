# Weaver conformance with A2UI v0.9.1

> Canonical conformance tracker. Audit date: **2026-08-10**. Official repository snapshot: `google/A2UI@ec97cb0d7499932e67003ffe5b709a3db7e7033a` (`main` at audit time).

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
| 119 | 18 | 11 | 3 | 2 | 3 | **156** |

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

Important source discrepancy: the v0.9.1 files retain `$id`, `$ref`, `catalogId`, and capability key strings containing `v0_9`/`v0.9`; CAP requires key **`v0.9`**, while Weaver emits **`v0.9.1`**. This is not inferred away.

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
| R073 | Send only current surface owner (P Targeted Delivery; protocol) | Core has no server identity/routing; returns metadata to caller | DEFERRED-BY-ARCHITECTURE | Host/transport adapter must route only to owner |
| R074 | CAP `supportedCatalogIds` (CAP path `/v0.9/supportedCatalogIds`; schema) | Weaver emits IDs but beneath `v0.9.1` | PARTIAL | Outbound conformance adapter must emit official `v0.9` key |
| R075 | CAP `inlineCatalogs` optional (CAP path `/v0.9/inlineCatalogs`; schema) | Intentionally omitted and no inline trust path | PASS | None; optional and unsupported |
| R076 | Validation failure outbound `error` envelope (CTS `/error`; checklist) | Typed internal issues only; no transport-neutral protocol message | NOT-IMPLEMENTED | Build explicit error-message mapper, without coupling transport |
| R077 | Error code exactly `VALIDATION_FAILED` (CTS error oneOf; schema) | Internal error codes differ and are not outbound CTS | NOT-IMPLEMENTED | Same as R076 |
| R078 | Error `surfaceId/path/message` (CTS Validation Failed; schema) | Internal issues usually have path/message and optional surface ID, not full required shape | PARTIAL | Define mapping/fallback ownership |

## 4. Transport and JSONL

| ID | Requirement (source; class) | Weaver / evidence | Status | Owner/action |
|---|---|---|---|---|
| R079 | Ordered reliable delivery (P Transport contract; protocol) | Core processes call order but provides no network delivery | DEFERRED-BY-ARCHITECTURE | HTTP/SSE, A2A, MCP, or host adapter |
| R080 | Message framing (P Transport contract; protocol) | Core JSONL text decoder available | PASS | Other transports own own framing |
| R081 | Metadata carriage (P Transport contract; protocol) | Core creates metadata but does not carry it | DEFERRED-BY-ARCHITECTURE | Future A2A/HTTP/MCP/host adapter |
| R082 | Bidirectional action channel (P optional contract; protocol) | Web callback exposes handoff; no channel | DEFERRED-BY-ARCHITECTURE | Host/transport adapter |
| R083 | `application/a2ui+json` interception (C MIME checklist; checklist) | No HTTP/content-type layer | DEFERRED-BY-ARCHITECTURE | Future HTTP/SSE adapter |
| R084 | A2A mapping/capability metadata (P A2A binding; protocol) | No A2A adapter by design | DEFERRED-BY-ARCHITECTURE | Future A2A adapter |
| R085 | MCP delivery (P Other transports; protocol) | `@weaver/mcp` placeholder only | DEFERRED-BY-ARCHITECTURE | `@weaver/mcp` |
| R086 | Arbitrary text chunks (C JSONL; checklist) | Incremental character buffer; JSONL tests | PASS | None |
| R087 | LF, CRLF, split CRLF (JSONL framing example; checklist) | All supported/tested | PASS | None |
| R088 | Unterminated final frame (reasonable stream completion behavior) | `finish()` parses/tested | PASS | None |
| R089 | Empty frame and malformed JSON recovery | Empty is INVALID_JSON; malformed frame does not poison next; tests | PASS | None |
| R090 | Maximum frame and recovery (Weaver hardening) | 1,048,576-char configurable limit/discard mode; tests | PASS | None |
| R091 | UTF-8 byte decoding boundary | Decoder accepts JS text, not bytes | DEFERRED-BY-ARCHITECTURE | Fetch/stream adapter owns `TextDecoder` and byte limits |

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
| R101 | Generic Core has no Basic component names | Core generic registries/resolvers; source inspection | PARTIAL | Add architecture regression test if practical |
| R102 | Generic Web renderer/registry has no Basic logic | Basic is separate adapter; registry tests | PASS | None |
| R103 | Deliberate exceptions | `basic-functions` in Core and `web/basic` are opt-in named adapters, not generic leakage | NOT-APPLICABLE | Keep package boundaries explicit |

## 6. Basic component matrix

All schema-property validation is delegated to the registered official Basic schema; “dynamic” below describes hydration. Common `weight` is catalog schema `$defs/CatalogComponentCommon`. Test evidence is chiefly `packages/web/src/basic/basic.test.ts`, `WebSurfaceRenderer.test.ts`, and Core property/tree/input tests.

| ID | Component | Supported schema/dynamic/structure/interaction | Accessibility / security / visual-guide state | Status | Action |
|---|---|---|---|---|---|
| R104 | Text | `text` dynamic, variants; safe simple Markdown | h1–h5 elements, body/caption hooks; no HTML/link/image parsing; inherits color; visual sizing incomplete | PARTIAL | Visual hardening; direct semantic/caption tests |
| R105 | Image | dynamic `url`,`description`; fit/variant hooks | `alt`, deny-by-default URL policy, responsive width; exact variant geometry incomplete | PARTIAL | Visual geometry/margins tests |
| R106 | Icon | named, `svgPath`, binding; host resolver; 24×24 viewBox/currentColor | decorative `aria-hidden`; resolver/path trusted after schema; fixed viewBox is Weaver choice | PASS | Document custom paths must target 24×24 |
| R107 | Video | dynamic URL, native controls, width, no autoplay | resource policy; detached approved resource may load; no schema description | PASS | Detached loading is known hardening issue |
| R108 | AudioPlayer | URL/description dynamic, native controls, width, no autoplay | accessible label/description; policy; detached loading limitation | PASS | Same |
| R109 | Row | static/template children, row, justify/align, width, order, weight | zero spacing; `stretch` justify currently maps to `stretch`, invalid/ineffective CSS | PARTIAL | Define meaningful main-axis stretch behavior |
| R110 | Column | static/template children, column, justify/align/order/weight | zero spacing; same `justify=stretch` issue | PARTIAL | Same |
| R111 | List | static/template, direction/align, list/listitem semantics, weight isolation | Does not implement required vertical/horizontal scrolling or horizontal item constraints | NOT-IMPLEMENTED | Basic visual hardening milestone |
| R112 | Card | one nested child; missing child progressive; weight | boundary/padding hooks exist; rounded/background/outline/shadow/nesting distinction/external margin incomplete | PARTIAL | Choose one officially acceptable border/elevation strategy |
| R113 | Tabs | dynamic titles/nested child, local selected index, selected child only, click, progressive | active hooks; ARIA and keyboard arrow navigation absent; index is positional on reorder; weight works | PARTIAL | Accessibility + reorder hardening |
| R114 | Modal | trigger/content, interception, local open/close, backdrop, Escape, semantics, focus trap/return | accessible dialog and focus wrapping tested; nested behavior not directly covered; weight works | PARTIAL | Add nested Modal regression tests |
| R115 | Divider | axis, line hooks, weight | semantic separator/orientation; exact 1px/full-span visual incomplete | PARTIAL | Visual hardening |
| R116 | Button | child/action/checks/variants/theme/weight | native button, check disable; primary inherits contrast; default/borderless are primarily data/style hooks | PARTIAL | Implement guide visual treatments |
| R117 | TextField | dynamic label/value; four variants; writes/checks/regexp/IME/focus-caret/weight | native labelled controls, invalid state/messages; number model remains string; schema/guide conflict prevents one unambiguous requirement | SPEC-AMBIGUOUS | Preserve support for both checks and trusted-host regexp |
| R118 | CheckBox | dynamic label/boolean; writes/checks/weight | native labelled checkbox; theme accent not implemented | PARTIAL | Theme/visual hardening |
| R119 | ChoicePicker | dynamic labels, stable values, both variants/styles/filter, string[] writes/checks/weight | labelled native radio/checkbox + filter; functional, but guide prefers dropdown/expander and true chips | PARTIAL | Visual implementation, separately from function |
| R120 | Slider | min/max/dynamic number/decimal writes/checks/weight | native range and label | PASS | Optional visual value display not required |
| R121 | DateTimeInput | dynamic value/min/max; date/time/both; ISO writes/checks/weight | native controls/labels; local browser timezone policy; both false → disabled non-writing representation | PASS | Document timezone interoperability |

### Component-specific findings

- **Text/Markdown:** Weaver deliberately supports emphasis, strong, code, paragraphs, and safe heading text through DOM node creation. HTML, links, and images remain literal; malformed input falls back to raw text. This meets the schema’s “simple Markdown … without HTML, images, or links” more closely than a full parser. G only recommends a parser “when possible.” Heading semantics exist; visual weights/sizes are not hardened.
- **Image:** `fit` is a closed mapping; variant is exposed as a trusted dataset hook, but suggested geometry is not complete. Width is responsive. Policy denial creates no browser request.
- **Icon:** Named icons require a trusted host resolver; `svgPath` uses SVG DOM APIs. The 24×24 `viewBox` is Weaver-specific, consistent with G’s suggested size but potentially unsuitable for arbitrary-coordinate custom paths.
- **Media:** controls provide scrubbing where the browser supports it. No autoplay property is set. Approved `src` assignment while building the detached subtree can start a request before mount.
- **Layout:** CSS Flexbox cannot represent main-axis `justify=stretch` with `justify-content:stretch` in a useful interoperable way for flex items; current mapping is therefore not called conformant.
- **List:** list semantics pass; scrolling is a clear checklist/guide gap.
- **Card:** G first suggests distinct background + corners + shadow; later recommends transparent + outline for nesting, while C says rounded corners and shadows. These are guidance/checklist tensions with multiple defensible strategies, not a single wire rule.
- **Tabs:** only active content is mounted, but descendants may already have been constructed in the detached full subtree before selection pruning.
- **Modal:** trigger is visible and intercepted; close button/backdrop/Escape work. Focus enters, wraps within the dialog, and returns. Nested Modal behavior lacks a direct regression test.
- **TextField ambiguity:** S includes `validationRegexp`; G v0.9.1 checklist says `checks` (and contrasts old regexp), while the current Basic implementation guide omits regexp. Weaver supports both, using only a trusted host matcher. Classification: **SPEC-AMBIGUOUS** (R117).
- **ChoicePicker:** functional conformance and visual recommendation are deliberately separate.
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
| R138 | Render `iconUrl` attribution (P Identity; protocol) | Validated/stored, never rendered or fetched | DEFERRED-BY-ARCHITECTURE | Host-authenticated surface chrome |
| R139 | Render `agentDisplayName` attribution (P Identity; protocol) | Validated/stored, not rendered | DEFERRED-BY-ARCHITECTURE | Same |
| R140 | Orchestrator validates attribution in multi-agent systems (P Identity; protocol) | Renderer cannot authenticate origin | DEFERRED-BY-ARCHITECTURE | Host/orchestrator owns verified override |
| R141 | Leaf-margin strategy (G §3; recommendation) | Structural zero spacing mostly; uniform margins absent across leaves/outlined controls | PARTIAL | Visual hardening, not protocol validity |
| R142 | Weight on layout children (C component checklist; checklist) | Parent-aware flex mapping and isolation; Basic/Web tests | PASS | None |
| R143 | Primary Button sets inherited contrast color (G §4; recommendation) | Button sets CSS `color`; Text inherits; Icon `currentColor`; basic tests | PASS | Add nested end-to-end contrast assertion if desired |
| R144 | Nested Cards distinguishable (G §4; recommendation) | No dependable nested distinction yet | PARTIAL | Border/elevation hardening |

## 9. Web security and effects

| ID | Requirement (source; class) | Weaver / evidence | Status | Action |
|---|---|---|---|---|
| R145 | No unsafe HTML/code sinks | Production `packages/web/src`: no `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `DOMParser`, `createContextualFragment`, `eval`, `new Function`, `document.write` | PASS | Retain source scan in reviews |
| R146 | External resource requests are policy-controlled | Image/Video/Audio require host resource policy; openUrl requires policy; Icon named resolver may return DOM only; Markdown creates none | PASS | Theme `iconUrl` remains inert |
| R147 | No arbitrary agent CSS path | Closed mappings for weight, fit, layout, variant hooks; opt-in theme maps validated primary color only | PASS | None |
| R148 | Effect functions only through direct local action | Root/effect gate; evaluator/action/openUrl tests | PASS | None |

External-request inventory: approved Image `src`, Video `src`, Audio `src`, and `openUrl` navigation can request/network. Named Icon resolution is host code; `svgPath` is inline. Markdown never creates links/images/HTML. `theme.iconUrl` is validated/stored but inert. Theme, weight, fit, layout, and variant values flow through closed maps/attributes; there is no `agent property → arbitrary CSS` bridge.

## 10. Accessibility matrix

| ID | Area | Protocol/basic guidance vs Weaver | Status | Action |
|---|---|---|---|---|
| R149 | Text/Image/Icon/Button/input labels/Divider/media/List | Native headings/button/inputs/controls; image alt; icon decorative; separator orientation; list roles; controls tested in `basic.test.ts` | PASS | Expand browser-level AT testing later |
| R150 | Validation association | Invalid state/message rendered, but direct `aria-describedby`/live announcement coverage is incomplete | PARTIAL | Accessibility hardening |
| R151 | Tabs ARIA/keyboard | tablist/tab/tabpanel relationships, selection/tabindex, click, and arrow/Home/End navigation are implemented and tested | PASS | None |
| R152 | Modal ARIA/focus | dialog/aria-modal/name, entry/return/Escape, and Tab/Shift+Tab wrapping are implemented and tested | PASS | Add nested-modal coverage separately |

Accessibility semantics are principally Weaver enhancements because the wire schemas do not prescribe DOM. C/G require native widgets/interaction patterns; Weaver implements Tabs keyboard/ARIA and Modal trapping, while validation announcement remains a known limitation.

## 11. Full-DOM rerender strategy and limitations

| ID | Requirement/property | Weaver / evidence | Status | Action |
|---|---|---|---|---|
| R153 | Reactive rendering without stale commits | Full detached subtree build, generation invalidation, atomic `replaceChildren`; Web tests | PASS | Preserve generation guard |
| R154 | Focus/caret continuity | Captures active input identity/selection and restores after rebuild; Web tests | PASS | Native edge cases remain |
| R155 | Inactive/closed descendants and detached resources | Inactive Tabs and closed Modal descendants may be constructed detached; approved media may load detached | PARTIAL | Future lazy construction without architecture rewrite |
| R156 | Template identity and resolver cost | Positional identities can stale on reorder; relationship child-property cloning can be costly | SPEC-AMBIGUOUS | A2UI has no stable item key; benchmark before redesign |

Additional known limitation: mount-local Tabs selection is index-based and may follow position rather than logical tab after reorder. This is not solved in Task 35.

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

No audit-only tests were needed. Coverage gaps are deliberately represented as PARTIAL/NOT-IMPLEMENTED: CAP schema-key mismatch, outbound validation errors, array append/delete edge semantics, generic-Core negative coupling proof, visual component behavior, Tabs ARIA/keyboard, Modal focus trap, validation announcement, and detached construction.

## 13. Prioritized backlogs

### Required conformance gaps

| Priority | Finding | Severity | Scope | Architectural risk |
|---:|---|---|---|---|
| 1 | Emit official client capabilities shape with `v0.9` key (R074) | high | Core / transport adapter | low |
| 2 | Map validation failures to full CTS `{version,error:{code:'VALIDATION_FAILED',surfaceId,path,message}}` (R076–R078) | high | Core | medium |
| 3 | Implement List vertical/horizontal scrolling and horizontal sizing (R111) | medium | Web | low |
| 4 | Retain explicit array-delete divergence pending spec resolution (R035) | medium | Core | medium |

### Hardening / recommended visual behavior

| Priority | Finding | Severity | Scope | Risk |
|---:|---|---|---|---|
| 1 | Basic leaf margins, visual variants, Button/Card/Divider/ChoicePicker treatments | medium | Web | medium |
| 2 | Resolve Row/Column `justify=stretch` meaning rather than emitting ineffective CSS | medium | Web | low |
| 3 | Validation association/announcement and nested Modal tests | medium | Web | medium |
| 4 | Avoid detached construction/loading for inactive Tabs/closed Modal/media | medium | Web | high |
| 5 | Nested Card distinction and theme accent consistency | low | Web | low |
| 6 | Browser-level accessibility and visual regression suite | low | Web | low |

### Deliberate Weaver deviations (not defects)

| Decision | Severity | Scope | Risk / rationale |
|---|---|---|---|
| Host regex matcher; unavailable without matcher | low | Core/host | low; prevents agent-controlled native regex execution |
| Deny-by-default media resource policy | low | Web/host | low; no unapproved network requests |
| Action-effect functions only at direct local action root | low | Core | low; blocks side effects during render/check/nesting |
| Attribution deferred to authenticated host chrome | medium | host/orchestrator | medium; avoids spoofed agent identity |
| Array-index deletion rejected | medium | Core | medium; JSON has no `undefined`, official behavior is unresolved |
| Fixed 24×24 SVG icon viewBox | low | Web/host | low; predictable icon contract |
| Both DateTime flags false → disabled/non-writing control | low | Web | low; safe behavior where spec is silent |

## 14. Proposed milestones derived from this audit

1. **Task 36 — protocol outbound conformance:** correct capabilities serialization; add transport-neutral CTS validation-error mapping and schema fixtures; define array append behavior. No network adapter.
2. **Task 37 — Basic functional/accessibility hardening:** List scrolling/sizing, validation association, nested-Modal coverage, and `justify=stretch` resolution.
3. **Task 38 — Basic visual hardening:** leaf margins, component variants, Card/Button/ChoicePicker/Divider visuals, inherited contrast and nested-card visual tests.
4. **Task 39 — trusted surface attribution boundary:** host/orchestrator-authenticated chrome for `iconUrl`/`agentDisplayName`; never render unverified identity directly.
5. **Task 40 — final v0.9.1 conformance fixtures:** validate outbound objects against pinned official schemas, accessibility/browser regressions, and close tracker rows.
6. Later, independently: HTTP/SSE and A2A transport adapters, then `@weaver/mcp`; do not pull these into Core.

## 15. Decisions before Zynra V2

Reconsider only these boundaries before integration:

1. Decide where outbound capability/error schema objects live (Core serializer versus each transport adapter). Prefer one transport-neutral Core builder to prevent drift.
2. Define authenticated surface-owner identity/routing so `sendDataModel` cannot cross agent boundaries and attribution cannot be spoofed.
3. Decide whether detached full-subtree construction is acceptable for approved media and modal/tab content; this is the highest-risk renderer limitation, but does not justify replacing working architecture merely to resemble another renderer.
4. Establish stable host policy contracts (resource, URL, regex, icon) before exposing remote agents.

No production behavior was changed by this audit.

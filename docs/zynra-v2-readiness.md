# Zynra V2 integration readiness

> Canonical Task 47 architecture decision. Review date: 2026-08-11.

## Decision

**Final status: BLOCKED.**

Weaver has no identified generic blocker. Its A2UI Core, Basic Web renderer, routed browser transport, MCP client bridge, and MCP application-capability helpers are sufficient for the proposed vertical slice. The blocker is evidence integrity: the only file under `docs/references/`, `zynra-backend-reference.txt`, is a historical Weaver/A2UI Express/Vite prototype, not the described Zynra Cloudflare Workers/Hono/D1 backend. It contains none of the expected Zynra services, routes, schemas, Zoe manifests, recommendation/apply logic, or tests. Consequently this review cannot verify the proposed capability contracts, authorization calls, idempotency behavior, schema reuse, or service names against the required read-only source.

This is a **Zynra integration blocker**, not a generic Weaver blocker. Before implementation, provide the intended read-only reference (preferably sanitized) and revalidate the provisional plan below. No production Weaver change is justified.

If that evidence correction confirms the task-supplied architecture, the expected status becomes **READY WITH INTEGRATION WORK**: Zynra owns ordinary application integration, not another Weaver subsystem.

## Scope and evidence quality

Weaver evidence reviewed:

- [`PLAN.md`](./PLAN.md), [`architecture.md`](./architecture.md), and [`conformance-v0.9.1.md`](./conformance-v0.9.1.md)
- [`http-sse-transport.md`](./http-sse-transport.md), [`mcp.md`](./mcp.md), and [`web-rendering.md`](./web-rendering.md)
- the relevant public `@weaver/mcp` package contract

Zynra evidence result:

- **BLOCKER** — the stored reference does not match the required backend. The backend characteristics and domain inventory in the task are therefore treated as supplied requirements, not verified implementation evidence.
- **BLOCKER** — existing Zoe tool manifests, declarations, recommendation builders, report tools, verification logic, action readiness, trust tests, and integration tests cannot be inventoried from the available reference.
- **DEFERRED** — line-by-line route inventory and a backend requirements rewrite are intentionally outside this review.

### Intended Zynra inventory requiring confirmation

The task identifies Cloudflare Workers, Hono routing, authenticated application routes, D1 persistence, domain/service modules, Zod validation, Zoe recommendation logic, and existing unit/integration tests. Relevant application areas are events, categories, tasks, stakeholders, colleagues/team, invoices, reports, financial calculations, notifications, onboarding, sharing, and templates/tags. These remain Zynra application concerns; this inventory does not imply one MCP tool per area.

The historical prototype catalog (`Box`, `Visual`, `Field`, `DataGrid`, `Chart`, and `Overlay`) is not a Zynra V2 requirement and must not be copied.

## Recommended initial topology

**INTEGRATION-OWNED** — after the reference is corrected, place the first Zoe V2 Application Agent inside the existing Zynra backend runtime. The task-supplied architecture points to one Worker/Hono application already owning authentication, services, validation, and D1 access. In-process placement minimizes new deployment, identity propagation, latency, and failure boundaries.

```text
Browser
  ↓ Zynra-authenticated fetch
Zynra Web Host
  ↓
@weaver/web + @weaver/core
  ↓
A2UITransportSession (host-assigned route)
  ↓
Zynra Hono A2UI stream/send endpoints
  ↓
Zoe V2 agent/orchestrator
  ├── emits validated A2UI
  └── calls trusted Zynra integration handlers
          ↓
existing domain services
          ↓
D1 / approved external services
```

The return path is:

```text
domain result
  ↓
Zoe emits Basic A2UI
  ↓
owner-routed surface in Weaver Web
  ↓ user input + explicit server event
Zynra action mapping
  ↓
trusted capability handler
  ↓
domain service mutation
  ↓
refreshed A2UI to the same surface owner
```

**INTEGRATION-OWNED** — expose the same stable handlers as an official MCP server for external/application agents:

```text
external/application agent
  ↓ official MCP Streamable HTTP
Zynra Hono MCP endpoint
  ↓ @weaver/mcp registration helper
Zynra integration handler
  ↓ existing domain service
```

A same-process `agent → HTTP MCP → same Worker` loop is not needed. Internal agent code should invoke the same trusted application handlers directly. MCP remains the external capability boundary; REST and MCP may share services. Neither MCP handlers nor the agent should call Zynra's own REST endpoint when all code shares the same runtime.

This preserves the dependency rule:

```text
Zynra → Weaver
Weaver ✕ Zynra
```

No domain service moves into Weaver.

## First vertical slice

**PRODUCT-DECISION** — subject to confirmation against the correct reference, choose the recommendation-to-task apply flow. It is the task's strongest candidate because it is said to combine draft recommendations, explicit `create_task` application, events/categories/tasks, idempotent apply, and semantic verification. It proves the complete boundary without migrating unrelated domains:

```text
authenticated user
  → request Zoe event/task recommendations
  → read event/category/task facts
  → agent creates a draft recommendation
  → Basic A2UI shows draft and editable task fields
  → user explicitly applies
  → authorized, idempotent write handler
  → task/domain service
  → refreshed A2UI confirmation
```

The slice must prove authentication, authorization, MCP-shaped read/write contracts, A2UI rendering and input binding, controlled server action, idempotency, domain validation, owner routing, and refresh. It must not require a live model in ordinary CI.

### Proposed integration contract

These names are concepts, not committed APIs. Exact schemas and service methods are **BLOCKER** pending the correct reference.

| Name concept | Mode | Input | Domain service | Authorization | Idempotency | Output | MCP annotation hints |
|---|---|---|---|---|---|---|---|
| `get_event_work_context` | read | event identifier; optional bounded context selectors | existing event/category/task query services | current Zynra principal may view event and related work | none | safe event facts, categories, and relevant task summaries | `readOnlyHint: true`, `destructiveHint: false` |
| `get_task_recommendation_state` | read | event/recommendation identifier | existing Zoe recommendation/query module | principal may view the event and recommendation | none | draft/readiness/verification-safe recommendation projection | `readOnlyHint: true`, `destructiveHint: false` |
| `save_task_recommendation_draft` | write, non-domain-final | event identifier plus canonical draft fields | existing Zoe recommendation/draft module | principal may prepare actions for the event | request key advisable; exact rule from application workflow | saved draft projection and readiness result | `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint` only if contract proves it |
| `apply_task_recommendation` | write | accepted recommendation identifier, expected version, idempotency key | existing recommendation apply workflow and task/event/category services | principal may apply this recommendation and create the task | required; duplicate key returns the original safe result and creates no duplicate | applied result, created task projection, verification status | `readOnlyHint: false`, `destructiveHint` according to product semantics, `idempotentHint: true` |

Count: four concepts; two read and two state-changing. Annotations are model/client hints, never authorization or confirmation.

**INTEGRATION-OWNED** — each handler receives SDK-validated input, obtains trusted identity, authorizes, invokes existing services, maps expected failures to safe MCP tool failures, and returns safe structured output. It must not duplicate task rules, event ownership, financial calculations, stakeholder permissions, or idempotency logic.

**INTEGRATION-OWNED** — D1 stays behind domain services. Do not expose generic SQL tools.

## Validation, authentication, and identity

### Zod and Standard Schema

- **READY** — the official MCP TypeScript SDK v2 accepts Standard Schema with JSON Schema output. Weaver passes `StandardSchemaWithJSON` through unchanged and has no schema-library dependency.
- **READY** — official v2 serving examples use Zod v4 directly for tool input; the current Weaver workspace tests against SDK v2 and has Zod v4 available transitively.
- **INTEGRATION-OWNED** — use canonical Zynra domain Zod schemas directly when their public input/output shape is appropriate. Adapt with narrow `.pick()`, `.omit()`, `.extend()`, or explicit boundary mapping only where MCP must hide internal fields, bind identity server-side, or present a stable capability-oriented shape.
- **BLOCKER** — direct reuse versus adaptation for the proposed tools cannot be decided until the intended Zynra schemas are present. Do not create parallel REST/MCP/agent/UI catalogs meanwhile.

Schema validity never replaces domain or financial verification.

### Authentication and authorization

The task states Zynra already authenticates application requests; this boundary is **INTEGRATION-OWNED** and requires source confirmation. Weaver must not know the authentication vendor, cookie format, bearer-token format, or credential lifecycle.

```text
authenticated Hono request
  ↓ Zynra verification
MCP handler.fetch(request, { authInfo, parsedBody? })
  ↓ official ServerContext
ctx.http.authInfo / trusted request closure
  ↓ Zynra capability handler
per-capability domain authorization
  ↓ domain service
```

The official SDK documents this exact host-verification/pass-through shape. `clientInfo`, `serverInfo`, tool names, themes, and display names are not principals. Authorization remains Zynra-owned on every call.

`A2UIRouteId` and user identity are separate:

- route ID: opaque, host-assigned identity of the authenticated remote A2UI peer that owns a surface;
- user identity: trusted Zynra principal used for application authorization.

Never derive one from the other or serialize a route ID as authorization evidence.

## Zoe safety semantics to preserve

These task-supplied behaviors are mandatory but need confirmation against the intended reference:

- **INTEGRATION-OWNED** — model recommendations remain drafts and do not mutate domain state automatically.
- **INTEGRATION-OWNED** — user-provided and model-generated text remains untrusted data after crossing A2UI or MCP.
- **INTEGRATION-OWNED** — applying a recommendation requires an explicit user action and Zynra policy check.
- **INTEGRATION-OWNED** — the Zynra action workflow/integration handler creates or accepts the idempotency key. Weaver Core does not.
- **INTEGRATION-OWNED** — retrying one accepted recommendation returns the prior result or an equivalent safe result and causes no duplicate mutation.
- **INTEGRATION-OWNED** — existing semantic/domain/financial verification runs after schema validation and before mutation/commit as required.
- **INTEGRATION-OWNED** — prompts are not security boundaries; handlers and services remain authoritative.
- **BLOCKER** — exact existing key source, duplicate-return semantics, trust classification, and verification APIs cannot be certified from the available reference.

## A2UI integration policy

**INTEGRATION-OWNED** — map an allowlisted set of product actions at the Zynra host/orchestration layer:

```text
Button server event
  → allowlisted integration action
  → agent/host workflow
  → trusted capability handler
  → domain service
```

An arbitrary action name must never become dynamic function dispatch. Candidate concepts include applying a recommendation, opening an event, refreshing facts, and saving a task draft; finalize names from actual product behavior.

- `sendDataModel = false` by default.
- Action context carries only minimal opaque identifiers, expected version, and workflow correlation needed for the event—not complete records, credentials, authorization claims, or the whole DataModel.
- If current form state is necessary, send only the relevant surface model using A2UI semantics and validate it again server-side.
- Successful surface creation binds it to the trusted route owner. Updates, models, actions, and refreshes return only to that owner.
- Initial V2 uses one application agent. **DEFERRED** — A2A and interoperable multi-agent routing are unnecessary for this slice.

### Attribution

**INTEGRATION-OWNED** — configure `WebSurfaceAttributionProvider` from trusted host configuration. The minimal initial product-approved display name may be `Zoe`; this remains a **PRODUCT-DECISION** and must never come from model output. The provider may return a bundled icon or a trusted rewritten URL. Raw `theme.agentDisplayName` and `theme.iconUrl` remain inert.

R140 is host-owned: before showing verified Zoe attribution, Zynra must authenticate the surface-producing orchestration path and map it to trusted attribution configuration. This is not generic Weaver authentication.

### Host policies

- **INTEGRATION-OWNED** resource policy — deny Image, Video, and Audio by default. The available reference proves no necessary production media origin, so no domain is allowlisted. Add a bundled identifier mapping or exact approved/rewrite origin only when a real screen requires it.
- **INTEGRATION-OWNED** `openUrl` policy — HTTPS only, restricted to approved Zynra/application destinations configured by the host. Reject arbitrary agent URLs and unsafe rewrites.
- **READY** regex policy — install only a trusted bounded host matcher; never execute agent-controlled native regular expressions.
- **INTEGRATION-OWNED** icon policy — resolve named icons from a trusted bundled map. Do not load remote icon libraries from agent input.

## Basic Catalog decision

**READY** — Basic Catalog is sufficient for the first slice.

Expected components: `Text`, `Card`, `Row`, `Column`, `List`, `Button`, `TextField`, `ChoicePicker`, `DateTimeInput`, optionally `CheckBox`, `Modal`, and trusted `Icon`. These can represent recommendation facts, draft fields, validation state, explicit apply, and confirmation.

- **DEFERRED** — no custom catalog is required before the first slice.
- **PRODUCT-DECISION** — rich tables and charts may be useful for later finance/report screens, but the current evidence supplies no first-slice acceptance criterion requiring `DataGrid` or `Chart`.
- A custom catalog threshold is concrete screen evidence that Basic cannot represent cleanly, not historical prototype components or anticipated reporting needs.

## Browser transport and deployment

**READY** — Weaver's POST-opened HTTP/SSE stream plus POST send binding fits fetch-native hosting conceptually. Zynra owns Hono routes such as an application-chosen A2UI stream path and send path; no production URL is prescribed. Mount them behind existing authentication and assign a trusted opaque route per authenticated peer/session. The host-supplied fetch wrapper must use Zynra's existing authenticated browser request mechanism.

Do not copy `examples/http-sse-server/` into production. It proves the binding only.

**INTEGRATION-OWNED** — choose fresh reconstruction after disconnect:

```text
connection lost
  → bounded reconnect/resume unavailable
  → discard/reconcile the stale experience
  → rebuild a fresh surface from authoritative application state
```

No durable replay service is required for the first slice. Cloudflare's distributed runtime makes the reference server's in-memory, single-process replay unsuitable for production durability. If exact replay later becomes a product requirement, its session-correlated durable store is Zynra-owned; choose the minimum Cloudflare primitive then, not now.

### MCP v2, Hono, and Cloudflare compatibility

**READY** — no generic runtime incompatibility was found.

Official MCP TypeScript SDK v2 documentation provides:

- `createMcpHandler`, a web-standard `{ fetch }` handler suitable for Cloudflare Workers;
- `@modelcontextprotocol/hono`, whose handler accepts Hono's `c.req.raw` and passes parsed body/auth context;
- an ordinary Hono app export usable directly by Cloudflare Workers;
- a first-party integration test running `@modelcontextprotocol/server` in Workers without `nodejs_compat`;
- a Cloudflare-Worker validator export in SDK v2.

Use the official SDK. A Cloudflare-specific MCP framework is unnecessary. Zynra owns the Hono MCP endpoint, host/origin policy, authentication, and the server factory. For the initial stateless request model, construct/register the application capabilities in the SDK's per-request server factory as documented.

Official sources (accessed 2026-08-11):

- [MCP TypeScript SDK: Serve with Hono](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/hono.md)
- [MCP TypeScript SDK: web-standard runtimes](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/web-standard.md)
- [MCP SDK Cloudflare Workers integration test](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/test/integration/test/server/cloudflareWorkers.test.ts)
- [Hono official repository](https://github.com/honojs/hono) (Web Standards and Cloudflare Workers support)

## Error boundaries

Keep three layers distinct:

| Layer | Meaning | Mapping |
|---|---|---|
| A2UI validation error | malformed or catalog-invalid UI protocol | Weaver's protocol validation response |
| MCP tool error | an authorized application capability failed safely or expected domain failure occurred | safe `isError` tool result; diagnostic retained host-side |
| HTTP/application error | authentication, endpoint, deployment, or host runtime failure | Zynra HTTP/observability policy |

A business failure is not `A2UI VALIDATION_FAILED`.

## Testing strategy

1. Preserve and extend domain service tests.
2. Add MCP capability integration tests with trusted and unauthorized identities, safe failures, schema boundaries, and duplicate apply.
3. Add A2UI protocol fixtures for valid Basic output, invalid output, action routing, and minimal model/context behavior.
4. Retain Weaver browser package tests; add Zynra-host integration tests for render, input, attribution, and policies.
5. Add one vertical end-to-end test:

```text
authenticated fixture user
  → deterministic Zoe fixture receives event facts
  → emits Basic A2UI recommendation draft
  → browser renders and edits bound task data
  → user applies
  → one authorized/idempotent task mutation
  → duplicate apply creates nothing
  → refreshed owner-routed surface confirms result
```

**INTEGRATION-OWNED** — ordinary CI uses deterministic agent/tool/A2UI fixtures and no live LLM. **DEFERRED** — live-model golden verification may run separately and must not gate deterministic correctness. Preserve existing Zoe golden, verification, trust, failure, and financial-audit test concepts; do not delete invariants during migration. Their actual files remain unverified due to the reference mismatch.

## Known Weaver limitations

- **DEFERRED** — R155 eager detached construction is accepted for this text/form slice. Reassess only if policy-approved expensive or sensitive media becomes necessary.
- **DEFERRED** — R035 array-index deletion ambiguity does not block ordinary object-based form state. Avoid relying on array-index deletion semantics.
- **READY** — R117 trusted regexp behavior does not block integration; use a host matcher and domain validation.
- **DEFERRED** — R156 positional template identity does not block this slice if recommendation/task lists are not reordered in place. Carry stable domain identifiers in event context.
- **DEFERRED** — R084/A2A; one application agent is enough.
- **INTEGRATION-OWNED** — R140 attribution authentication is supplied by Zynra host/orchestrator configuration.

## Readiness matrix

| Area | Weaver capability | Zynra evidence | Status | Owner | Required before first slice? | Action |
|---|---|---|---|---|---|---|
| A2UI Core | v0.9.1 validation/runtime/actions | intended flow needs generated UI | READY | Weaver | yes | use public runtime |
| Basic rendering | all 18 Basic renderers | recommendation form can use Basic | READY | Weaver/Zynra host | yes | register trusted Basic catalog/renderers |
| browser transport | POST SSE + POST send | Worker/Hono is task-supplied, unverified | READY | Zynra | yes | mount authenticated endpoints |
| transport routing | owner-bound `A2UITransportSession` | one peer/surface required | READY | Zynra host | yes | assign opaque trusted route |
| reconnect/resume | bounded cursor/reconnect | no exact replay criterion | INTEGRATION-OWNED | Zynra | yes | reconstruct fresh on unavailable resume |
| MCP client bridge | MCP A2UI delivery bridge | optional for external UI-producing agent | READY | Weaver | no for in-process slice | use only where MCP carries A2UI |
| MCP application capabilities | registration/safe-result helper | actual manifests absent | BLOCKER | Zynra evidence/integration | yes | restore reference; define 4-tool contract |
| Cloudflare MCP server runtime | official web-standard handler | Worker claim unverified locally | READY | MCP SDK/Zynra | yes | use official SDK fetch handler |
| authentication | no Weaver auth by design | existing auth asserted, not evidenced | BLOCKER | Zynra evidence/integration | yes | confirm middleware and adapt trusted identity |
| authorization | context passed unchanged | service checks absent | BLOCKER | Zynra evidence/integration | yes | confirm per-capability checks |
| idempotency | deliberately application-owned | apply semantics absent | BLOCKER | Zynra evidence/integration | yes | confirm workflow/key/result behavior |
| semantic verification | schema boundary only | Zoe verification absent | BLOCKER | Zynra evidence/integration | yes | invoke existing verification |
| agent generation | valid A2UI consumption | agent code absent | INTEGRATION-OWNED | Zynra | yes | one in-process agent/orchestrator |
| attribution | trusted provider boundary | product identity not evidenced | PRODUCT-DECISION | Zynra | yes | approve name; configure trusted provider |
| resource policy | deny-by-default hook | no required origins evidenced | READY | Zynra host | yes | deny all initially |
| openUrl policy | trusted policy hook | destinations not evidenced | INTEGRATION-OWNED | Zynra host | yes | HTTPS approved destinations only |
| icon policy | trusted resolver/provider asset | no icon requirement evidenced | INTEGRATION-OWNED | Zynra host | yes | bundled resolver/asset |
| regex policy | trusted matcher hook | no special pattern requirement | READY | Zynra host | yes | bounded trusted matcher |
| custom catalog | extensibility exists | no first-slice need | DEFERRED | Zynra product | no | use Basic |
| DataModel privacy | selective `sendDataModel` | forms need limited state only | INTEGRATION-OWNED | Zynra | yes | false by default; minimal context |
| testing | package/protocol test seams | Zoe tests absent from artifact | BLOCKER | Zynra evidence/integration | yes | confirm invariants; add layered tests |
| deployment | fetch/SSE compatible boundaries | deployment details absent | PRODUCT-DECISION | Zynra | yes | approve endpoint/auth/route policies |
| secret hygiene | no secrets required by Weaver | reference has credential-like material | BLOCKER | reference owner | yes | provide sanitized intended reference |
| A2A | intentionally absent | no day-one multi-agent need | DEFERRED | future | no | do not add |

Matrix result: Weaver capability readiness is adequate; six rows are blocked by the wrong/sensitive Zynra evidence artifact, not by generic Weaver code.

## Decisions Zynra must make

Before production, Zynra must approve: in-process agent placement; MCP endpoint and auth policy; A2UI stream/send endpoint and auth policy; route-ID assignment/lifetime; trusted attribution source and display; browser fetch authentication; fresh-reconstruction disconnect policy; and resource, URL, icon, and regex policies. It must also confirm the proposed capability schemas, service calls, authorization rules, and idempotency semantics from the intended source.

## Security note

The current read-only backend reference contains credential-like/test-secret material. It should later be replaced with a sanitized structural reference before publishing Weaver, widening repository access, or using broad code-indexing tools. This task does not modify the reference. No credential, key, token, private-key material, secret, or real account identifier has been copied into this document.

## Complexity challenge

**DEFERRED/rejected for the first slice:** generic agent framework, workflow engine, event bus, command bus, custom MCP registry, custom authentication, custom design system, database abstraction, microservices, Docker, message broker, A2A, custom A2UI catalog, and durable replay infrastructure. None has a concrete first-slice requirement. Existing domain services remain authoritative; REST remains in place and shares those services with MCP handlers.

## True blockers and next milestone

True blockers: **one underlying blocker**, represented by six affected matrix rows—the required Zynra backend evidence is absent/mismatched and sensitive. Generic Weaver blockers: **zero**. Zynra integration/evidence blockers: **one**.

Task 48 should not modify Weaver production packages. First, in the Zynra integration repository or controlled reference-export process, supply a sanitized structural backend reference and perform a short contract-confirmation pass over auth, schemas, Zoe manifests, apply/idempotency, verification, services, and tests. Then Task 48 should implement the recommendation-to-task vertical slice in the **Zynra repository**, not Weaver. This precedes A2A, a custom catalog, durable replay, or service replacement because it validates the complete user path with existing generic boundaries and the least new infrastructure.

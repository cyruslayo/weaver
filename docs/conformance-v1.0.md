# Weaver conformance with A2UI v1.0

> This tracker is for the unreleased 0.4.0 line. It replaces the v0.9.1 tracker, which describes
> the released 0.3.1 packages and is kept in the 0.3.1 tag.

## Target and sources

| Field | Value |
|---|---|
| Target protocol | A2UI v1.0 |
| Upstream | `a2ui-project/a2ui`, commit `5ff1b05f02d39f969b52a942e78e864ef3ac01fa` |
| Pinned corpus | `packages/core/src/protocol/a2ui/v1_0/conformance/` (provenance in its `PROVENANCE.txt`) |
| Specification | `a2ui_protocol.md`, `evolution_guide.md`, `basic_catalog_implementation_guide.md` (A2UI v1.0 snapshot) |
| Weaver status | 0.4.0, unreleased |

## How to read the status

- **Implemented** means the behaviour exists in the packages and has unit tests named in the
  evidence column. It does not mean that a corpus case was run.
- **Planned** means the behaviour is not supported yet. The runtime returns a typed error, and the
  row says which error.
- **Accepted limitation** means the behaviour differs from an ideal, and the decision is recorded.

The pinned corpus is test data. Nothing in this release runs it. A corpus runner is a planned
follow-up, and until it lands, the statuses below are from the implementation and its unit tests.

## Corpus coverage

Each pinned corpus file is listed with the Weaver area that covers it.

| Corpus file (`conformance/core/`) | Area | Status | Evidence / note |
|---|---|---|---|
| `validator_v1_0.yaml` | Protocol envelope, wire validation | Implemented, corpus not run | `protocol/a2ui/v1_0/validation.test.ts`, `inbound/inbound.test.ts` |
| `message_processor_v1_0.yaml` | Message lifecycle | Implemented, corpus not run | `message-processor/A2UIMessageProcessor.test.ts`, `surfaces` |
| `reserved_keys.yaml` | `@`-keys and `@@` escaping | Implemented, corpus not run | `component-properties/`, `functions/`, `actions/` tests |
| `validation_result.yaml` | `ValidationResult` checks and severity | Implemented, corpus not run | `checks/` tests |
| `index_function.yaml` | `@index` in templates | Implemented, corpus not run | `data-context/`, `functions/` tests |
| `data_deletion.yaml` | `updateDataModel` with `null` | Implemented, corpus not run | `data-model/`, `message-processor/` tests |
| `data_model.yaml` | Data model paths and updates | Implemented, corpus not run | `data-model/`, `data-context/` tests |
| `expressions.yaml` | Bindings, `@call`, literal escaping | Implemented, corpus not run | `functions/`, `component-properties/` tests |
| `accessibility.yaml` | `@accessibility` envelope key | Implemented, corpus not run | `component-properties/` tests |
| `rpc_functions.yaml` | `callRendererFunction`, `agentFunctionResponse` | Implemented, corpus not run | Cases ported by hand in `message-processor/remoteFunctions.test.ts` and `transport/session/remoteFunctions.test.ts`; see R-F1 to R-F6 |
| `agent_function_routing.yaml` | Remote function routing | Implemented, corpus not run | Cases ported by hand in `agent-functions/agentFunctionRouting.test.ts`; deviations listed under Known gaps |
| `multi_catalog.yaml` | Multi-catalog surfaces, `@catalogId` | Implemented, corpus not run | `message-processor/multiCatalog.test.ts`; cases ported by intent, see Known gaps (R-M1 to R-M6) |
| `composition_constraints.yaml` | `allowedParents`, `allowedChildren` | Planned | Accepted in catalogs, not enforced (see R-P4) |
| `catalog.yaml` | Catalog schema and registration | Implemented, corpus not run | `catalog/` tests; schema-level cases that need embedded `common_types` are rejected by design |
| `common_types.yaml` | Built-in `common_types.json` | Implemented, corpus not run | `catalog/` tests; embedding is rejected |
| `functions.yaml` | Function declarations and evaluation | Implemented, corpus not run | `functions/` tests |
| `actions.yaml` | Action dispatch and context | Implemented, corpus not run | `actions/` tests |
| `error_responses.yaml` | Typed error codes | Implemented, corpus not run | `diagnostics/describeWeaverError.test.ts` |

## Requirement matrix

### Protocol and lifecycle

| ID | Requirement | Status | Evidence / note |
|---|---|---|---|
| R-L1 | Accept only wire version `"1.0"` | Implemented | `protocol/a2ui/v1_0/validation.test.ts` |
| R-L2 | Exactly one server message per envelope | Implemented | `validation.test.ts` |
| R-L3 | `createSurface` creates a surface; duplicate create is `INTEGRITY_ERROR` | Implemented | `message-processor/A2UIMessageProcessor.test.ts` |
| R-L4 | `createSurface` may carry `components` and `dataModel`, applied atomically | Implemented | `message-processor/A2UIMessageProcessor.test.ts` |
| R-L5 | `createSurface` rejects `theme` | Implemented | `validation.test.ts` |
| R-L6 | `updateComponents` upserts flat components; ids follow UAX #31 | Implemented | `message-processor/`, `validation.test.ts` |
| R-L7 | `updateDataModel` requires `value`; `null` deletes | Implemented | `data-model/`, `message-processor/` tests |
| R-L8 | `deleteSurface` removes all surface state | Implemented | `surfaces/`, `runtime/` tests |
| R-L9 | Root component id is `root`; updates before the root are buffered | Implemented | `component-tree/` tests |
| R-L10 | A failed message changes no state | Implemented | `message-processor/A2UIMessageProcessor.test.ts` |
| R-L11 | Inbound `callRendererFunction` and `agentFunctionResponse` | Implemented | `message-processor/remoteFunctions.test.ts`; see R-F1 and R-F3 |

### Bindings, escaping and reserved keys

| ID | Requirement | Status | Evidence / note |
|---|---|---|---|
| R-B1 | `{"@path": ...}` and `{"@call": ...}` bindings | Implemented | `component-properties/`, `functions/` tests |
| R-B2 | `@@` escapes a literal `@` string | Implemented | `functions/dynamic.ts` tests |
| R-B3 | An undeclared bare key, or a stray `@` key, is `INVALID_RESERVED_KEY` | Implemented | `component-properties/` tests |
| R-B4 | `@accessibility`, `@checks` and `@metadata` are the only envelope keys | Implemented | `catalog/` and `component-properties/` tests; legacy bare keys are rejected unless the catalog declares them |
| R-B5 | `@index` in templates | Implemented | `data-context/`, `functions/` tests |

### Catalogs and functions

| ID | Requirement | Status | Evidence / note |
|---|---|---|---|
| R-C1 | Catalog declares `protocolVersion: "1.0"` | Implemented | `catalog/definition.test.ts` |
| R-C2 | Catalog `functions` map, validated and registered | Implemented | `catalog/`, `functions/` tests |
| R-C3 | `common_types.json` is built in; embedding is rejected | Implemented | `catalog/CatalogRegistry.test.ts` |
| R-C4 | `requiresUserActivation` gates a function to a user gesture | Implemented | `functions/` and `actions/` tests |
| R-C5 | `allowedCallers` limits which callers may use a function | Implemented | `functions/` tests |
| R-C6 | `allowedParents`, `allowedChildren` are declared | Implemented | `catalog/CatalogRegistry.test.ts` |
| R-C7 | `allowedParents`, `allowedChildren` are enforced | Planned | Accepted, not enforced (R-P4) |
| R-C8 | Basic Catalog v1.0 id and content | Implemented | `basic-catalog/basic-catalog.test.ts` |
| R-C9 | Regular expressions use the A2UI regex dialect with size limits | Implemented | `basic-functions/regexDialect.ts` tests |

### Checks

| ID | Requirement | Status | Evidence / note |
|---|---|---|---|
| R-K1 | `@checks` are evaluated against the data model | Implemented | `checks/` tests |
| R-K2 | Check `severity` distinguishes advisory results from blocking ones | Implemented | `checks/` tests |

### Prompt generation

| ID | Requirement | Status | Evidence / note |
|---|---|---|---|
| R-P0 | The prompt lists declared components and registered functions, and includes catalog instructions | Implemented | `prompt/` tests |

### Transport and renderer messages

| ID | Requirement | Status | Evidence / note |
|---|---|---|---|
| R-T1 | Renderer capabilities use the `"1.0"` key | Implemented | `protocol/a2ui/v1_0/outbound/outbound.test.ts` |
| R-T2 | Renderer messages carry `a2uiRendererCapabilities` and `a2uiRendererDataModel` metadata | Implemented | `transport/session/`, `web/src/transport/http-sse/` |
| R-T3 | Route ownership and routing rejection | Implemented | `transport/session/createA2UITransportSession.test.ts` |

### Basic Catalog and rendering

| ID | Requirement | Status | Evidence / note |
|---|---|---|---|
| R-W1 | All 18 Basic components have trusted renderers | Implemented | `web/src/renderers/`, `web/src/basic/` tests |
| R-W2 | `Text` variants and the supported Markdown subset | Implemented | `web/src/basic/` tests |
| R-W3 | `TextField` `placeholder`; `validationRegexp` is removed | Implemented | `web/src/basic/` tests |
| R-W4 | `Slider` `steps`; `Video` `posterUrl` | Implemented | `web/src/basic/` tests |
| R-W5 | Media URLs follow the specification rule before the host `resourcePolicy` | Implemented | `web/src/basic/media.ts` (`checkBasicMediaUrl`) |
| R-W6 | `openUrl` only from a user gesture | Implemented | `web/src/basic-functions/` tests |
| R-W7 | Deny-by-default media and attribution | Implemented | `web/src/basic-web-runtime/` tests |
| R-W8 | Eager construction of detached inactive or closed descendants | Accepted limitation | Constructed off-DOM. No action is dispatched and no DataModel is written during construction. |

### Remote function calls

| ID | Requirement | Status | Evidence / note |
|---|---|---|---|
| R-F1 | Agent `callRendererFunction` runs a trusted local function and gets a `rendererFunctionResponse` on the inbound route, including for a refused call | Implemented | `message-processor/remoteFunctions.test.ts`, `transport/session/remoteFunctions.test.ts`, `web/src/transport/http-sse/http-sse.test.ts`, `mcp/src/index.test.ts` |
| R-F2 | A renderer call with no local implementation becomes a `callAgentFunction` on the route that owns its surface, and the host drains and sends it | Implemented | `agent-functions/agentFunctionRouting.test.ts`, `web/src/transport/http-sse/http-sse.test.ts`, `mcp/src/index.test.ts` |
| R-F3 | `agentFunctionResponse` settles the call, notifies subscribers with `agentFunctionSettled`, and resumes a waiting action; an unknown id is ignored | Implemented | `agent-functions/agentFunctionRouting.test.ts`, `web/src/surface/WebSurfaceRenderer.test.ts` |
| R-F4 | The host cancels a call with `TIMEOUT` or `TRANSPORT_FAILED`; a binding waiting on it resolves to `null` and an action that waits fails with `EXPRESSION_ERROR` | Implemented | `agent-functions/agentFunctionRouting.test.ts`, `web/src/transport/http-sse/http-sse.test.ts` |
| R-F5 | `allowedCallers` and `requiresUserActivation` are enforced on both sides; an `agentOnly` function is not callable from a binding or action | Implemented | `agent-functions/agentFunctionRouting.test.ts`, `functions/` tests |
| R-F6 | A call that fails is answered once; a later identical reactive call returns the failure from the surface cache rather than sending again | Accepted limitation | See Known gaps |
| R-F7 | Local implementations are synchronous | Accepted limitation | See Known gaps |
| R-F8 | A nested call into a different catalog resolves its own catalog, not the enclosing call's | Implemented | `message-processor/multiCatalog.test.ts` (a nested call does not inherit the catalog of the call that contains it) |

### Multi-catalog surfaces

| ID | Requirement | Status | Evidence / note |
|---|---|---|---|
| R-M1 | A component resolves to its `@catalogId`, else to the surface default catalog; `createSurface.catalogId` is optional | Implemented | `message-processor/multiCatalog.test.ts` (explicit catalog id resolution, surface default fallback, a surface with no default and no components) |
| R-M2 | A function call resolves to its own `catalogId`, else to the surface default; a `${...}` call inside `formatString` takes that call's catalog; `@index` takes none | Implemented | `multiCatalog.test.ts` (function resolution precedence, catalog id override, formatString without default) |
| R-M3 | A component or call that resolves to no catalog is rejected at ingress with `CATALOG_RESOLUTION_FAILED`, and nothing is stored | Implemented | `multiCatalog.test.ts` (no default catalog and no `@catalogId` is refused atomically; a top-level call on a defaultless surface is refused with its JSON pointer) |
| R-M4 | An unregistered catalog id on a component is refused and stores nothing | Implemented | `multiCatalog.test.ts` (unregistered catalog error) |
| R-M5 | Each embedded call is validated against its resolved catalog; an undeclared call name fails at ingress as `CATALOG_REGISTRY_ERROR` with `FUNCTION_NOT_ALLOWED` | Implemented | `multiCatalog.test.ts`, `catalog/CatalogRegistry.test.ts` |
| R-M6 | Hydrated instances carry their resolved `catalogId`; the Web renderer looks up each instance's renderer in that catalog | Implemented | `multiCatalog.test.ts` (resolved surfaces keep the catalogId of each component); `web/src/surface/WebSurfaceRenderer.test.ts` (mixed catalogs, defaultless surface, RENDERER_NOT_FOUND for another catalog) |

### Planned

| ID | Requirement | Status | Typed result |
|---|---|---|---|
| R-P4 | Composition constraints (`allowedParents`, `allowedChildren`) | Planned | Accepted in catalogs; not enforced |

## Known gaps and decisions

- No corpus runner. The pinned corpus is test data, and no test executes it in this release.
- Remote function calls (R-F1 to R-F8) deviate from the pinned corpus in these ways:
  - **Failure cache, no resend.** A failed call is not sent again. The failure is cached per
    surface, so an identical later reactive call receives that failure. The corpus expects a
    fresh request after a failure.
  - **Activation fixtures adapted.** The `rendererOrAgent` cases that combine it with
    `requiresUserActivation` follow the activation rule in
    [architecture.md](architecture.md#remote-function-calls): the agent never calls such a
    function, and the renderer calls it only from a user gesture.
  - **Synchronous implementations.** Local function implementations run synchronously. A function
    that needs I/O is an agent function.
  - **Version mismatch is a registration rejection.** A catalog that declares a v0.9 protocol
    version is rejected when it is registered, with `CATALOG_CONFIGURATION_FAILED`. It never reaches
    a surface, because every v1.0 catalog declares `protocolVersion` as the constant `"1.0"`. The
    pinned case expects the mixed-version error at message time.
  - **Multi-catalog cases ported by intent.** The `multi_catalog.yaml` cases are not run from the
    corpus. Their intent is tested in `message-processor/multiCatalog.test.ts`, and the cases that
    use legacy shapes are written in the v1.0 envelope.
- Strict bare-key rejection is deliberate. Catalogs that still use legacy bare `accessibility`,
  `checks` or `metadata` keys must rename them to the `@`-prefixed form.
- The Basic Catalog's `Text` Markdown support is limited. Links, images and HTML are not interpreted.

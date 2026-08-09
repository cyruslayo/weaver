# Weaver Development Plan

## 1. Project Goal

Build Weaver as a reusable framework for dynamic web applications.

Weaver will use A2UI for user interfaces.

Weaver will support MCP 2026-07-28 for application capabilities.

Zynra V2 will become the first real application built with Weaver.

Weaver must remain independent from Zynra.

Zynra can depend on Weaver.

Weaver must never depend on Zynra.

---

# 2. Core Architecture

The target architecture is:

```text
                     USER
                      |
                      v
                 Web Browser
                      |
                      v
                @weaver/web
                      |
                      v
                @weaver/core
                      |
                   A2UI
                      |
                      v
               Application Agent
                 /          \
                /            \
             A2UI            MCP
                              |
                              v
                     Application Actions
                              |
                              v
                        Domain Services
                              |
                              v
                            Data
```

A2UI controls interface descriptions.

MCP exposes application capabilities.

Weaver renders A2UI.

The application owns business rules.

The agent coordinates interface generation and application capabilities.

---

# 3. Important Boundaries

## Weaver Core

Weaver Core must not know about:

- Zynra
- Cloudflare
- Firebase
- OpenAI
- Gemini
- D1
- application databases
- application business rules

Weaver Core should know about:

- A2UI messages
- surfaces
- component definitions
- data models
- bindings
- actions
- catalogs
- validation

## Weaver Web

Weaver Web should know about:

- browser APIs
- DOM rendering
- browser events
- accessibility
- trusted component rendering
- browser transports

## Weaver MCP

Weaver MCP should know about:

- MCP 2026-07-28
- A2UI transport through MCP
- MCP client integration
- MCP server integration helpers

It must remain optional.

An application must use Weaver without MCP.

## Zynra

Zynra owns:

- users
- events
- tasks
- stakeholders
- reports
- finances
- permissions
- authentication
- persistence
- application workflows

No Zynra domain code belongs inside Weaver.

---

# 4. Initial Repository Structure

Refactor the Weaver repository toward this structure:

```text
weaver/
├── packages/
│   ├── core/
│   ├── web/
│   └── mcp/
│
├── examples/
│   └── playground/
│
├── docs/
│   ├── PLAN.md
│   ├── architecture.md
│   └── references/
│       └── zynra-backend-reference.txt
│
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
└── README.md
```

Do not create more packages yet.

Add packages only after a real requirement appears.

---

# 5. Reference Document Rules

Treat the Zynra backend document as read-only reference material.

Do not import code from it.

Do not build Weaver APIs around Zynra-specific concepts.

Search the document only when a real application requirement needs clarification.

The reference file must not enter published Weaver packages.

Check the document for credentials before committing it.

Remove tokens, API keys, private keys, passwords, and personal information.

Keep package publication limited to compiled package files.

---

# 6. Phase 0 — Secure and Clean the Repository

## Goal

Create a safe development baseline.

## Tasks

1. Check the current Git status.
2. Review the existing Weaver prototype.
3. Preserve useful prototype tests.
4. Remove committed secrets.
5. Sanitize the Zynra reference document.
6. Configure `.gitignore`.
7. Configure the workspace.
8. Select one package manager.
9. Prefer pnpm for the workspace.
10. Confirm a clean install works.

Do not rewrite the prototype yet.

First document which parts will survive.

## Prototype concepts to preserve

Preserve these ideas:

```text
ComponentRegistry
StateActionBus
StreamingEngine tests
trusted component catalog
design token boundary
browser action dispatch
```

Do not preserve the old protocol shapes.

## Completion Gate

Phase 0 finishes when:

```text
pnpm install
pnpm test
```

work from a clean checkout.

The repository must contain no real credentials.

---

# 7. Phase 1 — Define Weaver Core

## Goal

Build the protocol-independent runtime.

Create:

```text
packages/core/src/
├── protocol/
├── surfaces/
├── data-model/
├── actions/
├── catalog/
├── validation/
└── index.ts
```

Do not use DOM APIs here.

Do not use network APIs here.

## Main Runtime

Create one main runtime object:

```ts
const weaver = createWeaverRuntime(...)
```

The runtime should coordinate:

```text
Protocol Adapter
Surface Store
Data Model
Action Dispatcher
Catalog Registry
Validation
```

Keep each part independently testable.

---

# 8. Phase 2 — Implement A2UI v0.9.1

## Goal

Implement the current production protocol before adding AI.

Support these server messages:

```text
createSurface
updateComponents
updateDataModel
deleteSurface
```

Every incoming message must pass validation.

Do not repair invalid messages silently.

Return structured validation errors.

## Protocol Adapter

Create an internal interface similar to:

```text
A2UIProtocolAdapter
```

Use one implementation:

```text
A2UIProtocolAdapterV091
```

Do not implement v1.0 yet.

Keep the adapter boundary small.

This boundary will support a later v1.0 migration.

## Completion Gate

Tests must prove:

- a surface can be created
- components can be added
- components can be updated
- data can be updated
- surfaces can be deleted
- invalid messages fail
- unknown message types fail

No browser must be required for these tests.

---

# 9. Phase 3 — Build the Surface Store

## Goal

Make surfaces the main unit of interface state.

Each surface should contain:

```text
surfaceId
catalogId
components
dataModel
metadata
```

Use an internal structure similar to:

```text
SurfaceStore
├── surface-a
│   ├── components
│   └── dataModel
│
└── surface-b
    ├── components
    └── dataModel
```

Do not use one global data model.

## Required Behavior

Implement:

```text
create
get
update
delete
subscribe
```

Surface updates should notify subscribers.

Avoid framework-specific state libraries.

Use normal TypeScript.

## Completion Gate

Tests must cover several surfaces at the same time.

Updates to one surface must not affect another surface.

---

# 10. Phase 4 — Build the A2UI Data Model

## Goal

Implement proper A2UI data binding.

Support JSON Pointer paths.

Examples:

```text
/user/name
/events/0/name
/form/email
```

Implement:

```text
get(path)
set(path, value)
delete(path)
subscribe(path)
replace(value)
```

Components must read data without owning that data.

## Important Rule

Keep interface structure separate from application data.

Do not place large application data sets inside component definitions.

## Completion Gate

Tests must verify:

```text
server data update
        ↓
data model
        ↓
binding changes
        ↓
subscriber receives update
```

---

# 11. Phase 5 — Build the Catalog System

## Goal

Create a trusted component boundary.

The agent may request components.

The renderer decides which components exist.

Create a catalog registry.

Use a model similar to:

```ts
catalog.register(...)
```

Unknown components must fail safely.

Never execute code supplied by an agent.

Never accept arbitrary HTML.

Never accept arbitrary JavaScript.

Never accept arbitrary CSS.

## Initial Components

Start with:

```text
Text
Button
TextField
Row
Column
Card
Image
Divider
```

Do not add DataGrid yet.

Do not add Chart yet.

Do not add complex overlays yet.

Add them after the basic runtime works.

## Design Tokens

Preserve the trusted token idea from the prototype.

Support safe values such as:

```text
spacing
size
radius
variant
alignment
color role
```

The agent chooses tokens.

The application defines their visual meaning.

---

# 12. Phase 6 — Build @weaver/web

## Goal

Render Weaver surfaces in a browser.

Create:

```text
packages/web/src/
├── renderer/
├── components/
├── bindings/
├── events/
├── transport/
└── index.ts
```

The web renderer depends on `@weaver/core`.

Core must never depend on Web.

## Renderer Flow

```text
A2UI Message
     ↓
Weaver Core
     ↓
Surface Store
     ↓
Web Renderer
     ↓
Catalog Renderer
     ↓
DOM
```

Use native browser APIs first.

Do not add React.

Do not add Vue.

Do not add another rendering framework.

Those adapters can come later.

## Completion Gate

A static A2UI stream must render a complete interface.

No server should be necessary.

---

# 13. Phase 7 — Build the Playground

## Goal

Create a small application for framework development.

Create:

```text
examples/playground/
```

The playground must not contain Zynra code.

Include several examples:

```text
Hello surface
Form
Data binding
Multiple surfaces
Action handling
Progressive updates
Invalid message
Unknown component
```

The playground becomes Weaver's manual test application.

Every new framework feature should appear there first.

---

# 14. Phase 8 — Implement Actions

## Goal

Complete the browser interaction loop.

Create a generic action model.

An action should contain useful context such as:

```text
name
surfaceId
sourceComponentId
context
dataModel
```

The exact wire format must follow the selected A2UI version.

## Action Types

Support two broad action classes.

### Local Actions

Local actions execute trusted browser functions.

Examples:

```text
focus
copy
close
navigate
validate
```

### Remote Actions

Remote actions go back to the application.

Example:

```text
complete_task
```

Do not send every interaction to an LLM.

Use local behavior when no reasoning is required.

## Completion Gate

The playground must support:

```text
user changes input
      ↓
data model updates

user clicks button
      ↓
action dispatches
      ↓
handler returns update
      ↓
surface changes
```

---

# 15. Phase 9 — Build Transport Interfaces

## Goal

Keep A2UI independent from one network method.

Define a transport interface.

The runtime should not know whether messages came from:

```text
static data
HTTP
SSE
MCP
tests
```

Implement browser HTTP streaming first.

Use JSONL A2UI messages.

Add SSE only where it provides clear value.

Do not create WebSocket infrastructure without a real requirement.

## Completion Gate

The same surface must render from:

```text
static fixture
HTTP stream
```

without changing renderer code.

---

# 16. Phase 10 — Add Server-Side Validation

## Goal

Keep invalid model output away from the browser.

Use this boundary:

```text
LLM
 ↓
parse
 ↓
validate
 ↓
A2UI message
 ↓
transport
 ↓
browser
```

Never use this boundary:

```text
LLM
 ↓
broken JSON
 ↓
browser repairs it
```

Remove the old browser JSON repair responsibility.

The browser may reject invalid network data.

It must not guess the model's intent.

## Completion Gate

Tests must cover malformed model output.

Invalid output must never reach rendering code.

---

# 17. Phase 11 — First Weaver Release

Release:

```text
Weaver 0.1.0
```

It should contain:

```text
@weaver/core
@weaver/web
```

Do not publish `@weaver/mcp` yet.

Version `0.1.0` must support:

- A2UI v0.9.1
- surfaces
- components
- data models
- trusted catalogs
- actions
- browser rendering
- HTTP streaming
- validation

It must work without an AI model.

It must work without MCP.

It must work without Zynra.

---

# 18. Phase 12 — Add MCP 2026-07-28

## Goal

Add modern MCP support without coupling MCP to Weaver Core.

Create:

```text
packages/mcp/
```

Use the official MCP TypeScript v2 packages.

Target protocol revision:

```text
2026-07-28
```

Use modern stateless MCP.

Do not design around MCP sessions.

Use Streamable HTTP for remote MCP.

## Package Boundary

`@weaver/mcp` may depend on:

```text
@weaver/core
MCP SDK
```

It must not depend on:

```text
@weaver/web
Zynra
Cloudflare
```

except through optional adapters.

## Initial Purpose

Provide helpers for:

```text
A2UI tool results
A2UI resources
MCP transport adapters
capability discovery
```

Do not create a new application framework inside this package.

## Completion Gate

Create a sample MCP server.

Expose one simple tool.

Call the tool from a sample client.

Return data that can populate a Weaver surface.

---

# 19. Phase 13 — First Complete MCP + A2UI Example

## Goal

Prove both protocols together without Zynra.

Create a simple example application.

Use something like:

```text
tasks.list
tasks.complete
```

Flow:

```text
Browser
   ↓
Weaver
   ↓
Action
   ↓
Agent
   ↓
MCP
   ↓
Tool
   ↓
Result
   ↓
A2UI
   ↓
Weaver
   ↓
Browser
```

Use in-memory data.

Do not add a database.

Do not add authentication.

Do not add cloud infrastructure.

## Completion Gate

A user must see tasks and complete one task.

The interface must update without a page reload.

---

# 20. Phase 14 — Release Weaver 0.2.0

Release:

```text
@weaver/core
@weaver/web
@weaver/mcp
```

Create package tarballs before publication.

Install those tarballs into a clean test project.

Do not rely only on workspace links.

This test catches missing package files and hidden workspace dependencies.

---

# 21. Phase 15 — Begin Zynra V2

Now return to the Zynra repository.

Create:

```bash
git switch -c zynra-v2
```

Keep:

```text
backend/
frontend/
```

Create:

```text
frontend-v2/
```

Do not delete the old frontend.

It remains the working behavior reference.

Install packaged Weaver into `frontend-v2`.

Prefer a packed local tarball during development.

This tests Weaver as a real external dependency.

---

# 22. Phase 16 — Prepare the Zynra Backend

Do not create a second Zynra backend.

Use the existing backend.

The current backend already separates many routes and services.

Add an application action layer.

Target:

```text
REST Route
     \
      \
       Application Action
              |
              v
           Service
              |
              v
              D1

MCP Tool
      /
     /
```

MCP tools must not call Zynra REST endpoints internally.

They should call application actions directly.

## Initial Structure

Add:

```text
backend/src/application/
├── events/
├── tasks/
└── shared/
```

Do not move all services immediately.

Wrap only the behavior needed by the first vertical slice.

---

# 23. Phase 17 — Add MCP to Zynra

Add a modern MCP endpoint to the existing Hono backend.

Use the official MCP v2 Hono integration where appropriate.

Start with three tools:

```text
events.list
events.get
tasks.complete
```

Do not expose every backend route.

## Security Rule

Every MCP tool must enforce the same authorization rules as REST.

Never call a service directly when route middleware currently provides required authorization.

Move required authorization into reusable application actions.

## Completion Gate

An authenticated MCP client must:

1. List only the user's events.
2. Read an owned event.
3. Complete an allowed task.
4. Fail when access is not allowed.

---

# 24. Phase 18 — Add the Zynra Agent Boundary

The Zynra agent will coordinate MCP and A2UI.

Keep this code inside Zynra.

Do not put the Zynra agent inside Weaver.

Flow:

```text
User intent
    ↓
Zynra Agent
   /     \
  /       \
MCP       A2UI
 |          |
Data      Interface
```

The agent can choose application capabilities.

The agent can create or update interfaces.

All A2UI output must pass Weaver validation before delivery.

---

# 25. Phase 19 — Build the First Zynra Vertical Slice

Use Events first.

Do not migrate the complete application.

Implement this flow:

```text
Open Zynra V2
      ↓
List events
      ↓
Select event
      ↓
Show event details
      ↓
Show tasks
      ↓
Complete task
      ↓
Update interface
```

This vertical slice must use:

```text
Weaver
A2UI
MCP 2026-07-28
Zynra application actions
existing Zynra services
existing D1 database
existing authentication
```

Do not duplicate business logic.

---

# 26. Phase 20 — Framework Feedback Cycle

After the first Zynra slice, stop feature work.

Review every workaround.

Classify each issue as:

```text
Weaver problem
Zynra problem
A2UI limitation
MCP limitation
application-specific requirement
```

Only general problems should change Weaver.

Never add Zynra-specific APIs to solve Zynra-specific problems.

Release Weaver `0.3.0` after this review.

---

# 27. Phase 21 — Migrate Zynra Feature Groups

Migrate one feature group at a time.

Suggested order:

```text
1. Events
2. Tasks
3. Stakeholders
4. Dashboard
5. Reports
6. Financial views
7. Event templates
8. Onboarding
9. Team management
10. Sharing
11. Notifications
```

Do not migrate a feature until the previous feature passes tests.

Keep the old frontend available during migration.

Use it as a behavior reference.

---

# 28. Phase 22 — Expand the Weaver Catalog

Only add generic components after Zynra proves the need.

Likely later additions include:

```text
DataGrid
Chart
Dialog
Tabs
Select
DateField
Menu
Badge
Progress
```

Each component must include:

- schema
- renderer
- accessibility behavior
- binding behavior
- tests
- playground example

Do not add components only because they seem useful.

---

# 29. Phase 23 — A2UI v1.0 Preparation

Do not make v1.0 the main runtime while it remains a candidate.

Keep the protocol adapter boundary.

When v1.0 becomes suitable, add:

```text
A2UIProtocolAdapterV100
```

Run the same runtime tests against both adapters where possible.

Review these v1.0 areas carefully:

```text
actionResponse
callFunction
functionResponse
mixed catalogs
catalog resolution
createSurface changes
```

Do not break v0.9.1 users during migration.

---

# 30. Phase 24 — Packaging and Documentation

Prepare Weaver for external use.

Each public package needs:

```text
README
API documentation
examples
version
license
exports
types
tests
```

Document the simplest path first.

A developer should render a static surface quickly.

Then show actions.

Then show streaming.

Then show MCP.

Do not make MCP the first tutorial.

---

# 31. Phase 25 — Weaver Release Criteria

Do not call Weaver `1.0` because the code looks complete.

Require real evidence.

Before Weaver 1.0:

- Zynra must run successfully on Weaver.
- One independent sample application must use Weaver.
- Package installation must work outside the monorepo.
- Public APIs must remain stable across several releases.
- Security boundaries must have tests.
- Accessibility must have tests.
- Invalid A2UI must fail safely.
- Unknown components must fail safely.
- MCP failures must not corrupt interface state.
- Framework code must contain no Zynra assumptions.

---

# 32. Test Strategy

Use four test levels.

## Unit Tests

Test:

```text
protocol parsing
validation
surface state
JSON Pointer operations
catalog registration
actions
```

## Renderer Tests

Test:

```text
DOM output
bindings
events
unknown components
accessibility
```

## Protocol Tests

Test valid and invalid A2UI fixtures.

Test MCP request and response behavior.

## End-to-End Tests

Test:

```text
user
 ↓
Weaver
 ↓
agent
 ↓
MCP
 ↓
application
 ↓
A2UI
 ↓
Weaver
```

Keep end-to-end tests small.

Do not replace unit tests with browser tests.

---

# 33. Coding Agent Rules

Every coding agent task must have one clear goal.

Do not give an agent the complete roadmap as its implementation request.

Give it one phase or one milestone.

The agent must:

1. Read this plan first.
2. Read only relevant source files.
3. Search the Zynra reference only when necessary.
4. Preserve package boundaries.
5. Add tests with each behavior change.
6. Run relevant tests before completion.
7. Report changed files.
8. Report commands executed.
9. Report test results.
10. Stop after the assigned milestone.

The agent must not:

- redesign unrelated code
- add new frameworks without need
- introduce microservices
- add Docker without need
- add queues without need
- add databases to Weaver
- copy Zynra domain code
- bypass validation
- bypass authorization
- silently repair invalid protocol messages

---

# 34. Commit Strategy

Use milestone commits.

Examples:

```text
bootstrap weaver workspace

implement a2ui v0.9.1 message model

add surface store

add a2ui data model bindings

add trusted catalog registry

add web renderer

add action dispatcher

add http transport

add server-side a2ui validation

release weaver 0.1

add mcp 2026-07-28 adapter

add mcp a2ui example

release weaver 0.2

integrate weaver with zynra events
```

Keep commits narrow.

Avoid one large rewrite commit.

---

# 35. Definition of Finished

The project reaches its first major goal when this flow works:

```text
Zynra User
     ↓
Zynra V2
     ↓
Weaver Web
     ↓
A2UI
     ↓
Zynra Agent
     ↓
MCP 2026-07-28
     ↓
Zynra Application Actions
     ↓
Existing Zynra Services
     ↓
D1
     ↓
A2UI Update
     ↓
Weaver
     ↓
User
```

Weaver must remain independently installable.

Zynra must not require a forked Weaver version.

The old Zynra backend must remain the source of domain truth.

The old frontend can be removed only after required feature parity exists.

---

# 36. Immediate Next Milestone

Do only Phase 0 first.

Do not start A2UI implementation yet.

The first coding-agent task should:

1. Audit the cloned Weaver repository.
2. Sanitize the Zynra reference document.
3. Create the pnpm workspace.
4. Create `packages/core`.
5. Create `packages/web`.
6. Create `packages/mcp`.
7. Create `examples/playground`.
8. Preserve useful prototype code without migrating it.
9. Configure tests and TypeScript.
10. Confirm a clean build.
11. Document the final repository structure.
12. Stop.

After that milestone passes, begin A2UI v0.9.1 Core.
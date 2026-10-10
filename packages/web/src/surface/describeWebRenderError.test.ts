import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createWeaverRuntime,
  describeWeaverError,
  type JsonObject,
  type WeaverErrorDescription,
  type WeaverSurfaceResolutionError,
} from "@cylayo/weaver-core";
import { Window } from "happy-dom";
import { RendererRegistry } from "../renderers/RendererRegistry.js";
import type { WebInteractionError } from "../renderers/types.js";
import type { WebRenderError } from "./errors.js";
import { describeWebRenderError, type DescribableWebError, type WebLocalStateError } from "./describeWebRenderError.js";
import { WebSurfaceRenderer } from "./WebSurfaceRenderer.js";

// ---------------------------------------------------------------------------
// Code inventory. Every code in the Web unions the describer accepts. The
// compile-time checks at the bottom fail if this list drifts from the unions.
// ---------------------------------------------------------------------------

const ALL_CODES = [
  "SURFACE_RESOLUTION_FAILED", "THEME_ADAPTER_FAILED", "ATTRIBUTION_PROVIDER_FAILED",
  "INVALID_VERIFIED_ATTRIBUTION", "RENDERER_NOT_FOUND", "RENDERER_EXECUTION_FAILED",
  "INVALID_RENDERER_RESULT", "STALE_RENDER_INTERACTION", "SERVER_EVENT_HANDOFF_FAILED",
  "INVALID_LOCAL_STATE_VALUE",
] as const;

type WebErrorCode = (typeof ALL_CODES)[number];
type UnionCodes = WebRenderError["code"] | WebInteractionError["code"] | WebLocalStateError["code"];

// Compile-time: these fail the typecheck if a code is missing from ALL_CODES
// or if ALL_CODES names something no Web union defines.
const missingCodes: Exclude<UnionCodes, WebErrorCode> extends never ? true : never = true;
const unknownCodes: Exclude<WebErrorCode, UnionCodes> extends never ? true : never = true;
void missingCodes;
void unknownCodes;

// ---------------------------------------------------------------------------
// Fixtures. One value per code. Surface-resolution fixtures carry a Core cause.
// ---------------------------------------------------------------------------

const rendererLocation = {
  catalogId: "catalog",
  component: "Text",
  sourceComponentId: "title",
  scopePath: "/items/0",
} as const;

const surfaceNotFoundCause: WeaverSurfaceResolutionError = { code: "SURFACE_NOT_FOUND", surfaceId: "main" };
const componentTreeCause: WeaverSurfaceResolutionError = {
  code: "COMPONENT_TREE_RESOLUTION_FAILED",
  cause: {
    code: "CATALOG_NOT_FOUND",
    message: "no catalog",
    catalogId: "catalog",
    cause: { code: "CATALOG_NOT_FOUND", message: "missing", catalogId: "catalog" },
  },
};

const fixtures: { code: WebErrorCode; error: DescribableWebError }[] = [
  { code: "SURFACE_RESOLUTION_FAILED", error: { code: "SURFACE_RESOLUTION_FAILED", cause: surfaceNotFoundCause } },
  { code: "THEME_ADAPTER_FAILED", error: { code: "THEME_ADAPTER_FAILED" } },
  { code: "ATTRIBUTION_PROVIDER_FAILED", error: { code: "ATTRIBUTION_PROVIDER_FAILED" } },
  { code: "INVALID_VERIFIED_ATTRIBUTION", error: { code: "INVALID_VERIFIED_ATTRIBUTION" } },
  { code: "RENDERER_NOT_FOUND", error: { code: "RENDERER_NOT_FOUND", ...rendererLocation } },
  { code: "RENDERER_EXECUTION_FAILED", error: { code: "RENDERER_EXECUTION_FAILED", ...rendererLocation } },
  { code: "INVALID_RENDERER_RESULT", error: { code: "INVALID_RENDERER_RESULT", ...rendererLocation } },
  { code: "STALE_RENDER_INTERACTION", error: { code: "STALE_RENDER_INTERACTION" } },
  { code: "SERVER_EVENT_HANDOFF_FAILED", error: { code: "SERVER_EVENT_HANDOFF_FAILED" } },
  { code: "INVALID_LOCAL_STATE_VALUE", error: { code: "INVALID_LOCAL_STATE_VALUE" } },
];

const UNKNOWN_FALLBACK = /cannot describe/;

test("every code in the Web unions has a fixture that describes it under the same code", () => {
  for (const code of ALL_CODES) {
    const fixture = fixtures.find((candidate) => candidate.code === code);
    assert.ok(fixture, `no fixture for ${code}`);
    assert.equal(describeWebRenderError(fixture.error).code, code);
  }
  assert.equal(fixtures.length, ALL_CODES.length);
});

test("every fixture yields a real summary and never the unknown-code fallback", () => {
  for (const { code, error } of fixtures) {
    const description = describeWebRenderError(error);
    assert.ok(description.summary.length > 0, `${code} has no summary`);
    assert.doesNotMatch(description.summary, UNKNOWN_FALLBACK, `${code} fell back to unknown`);
    assert.equal(description.severity, "error", `${code} severity`);
  }
});

test("RENDERER_NOT_FOUND names the catalogId, component, sourceComponentId and scopePath, and gives the registration hint", () => {
  const description = describeWebRenderError({ code: "RENDERER_NOT_FOUND", ...rendererLocation });
  assert.equal(description.componentId, "title");
  assert.equal(description.scopePath, "/items/0");
  assert.match(description.summary, /"catalog"/);
  assert.match(description.summary, /"Text"/);
  assert.equal(description.hint, "Register a trusted renderer for this catalog/component.");
  assert.deepEqual(description.causes, []);
});

test("RENDERER_EXECUTION_FAILED and INVALID_RENDERER_RESULT name the catalog, component and location", () => {
  for (const code of ["RENDERER_EXECUTION_FAILED", "INVALID_RENDERER_RESULT"] as const) {
    const description = describeWebRenderError({ code, ...rendererLocation });
    assert.equal(description.code, code);
    assert.equal(description.componentId, "title", `${code} componentId`);
    assert.equal(description.scopePath, "/items/0", `${code} scopePath`);
    assert.match(description.summary, /"catalog"/, `${code} catalogId`);
    assert.match(description.summary, /"Text"/, `${code} component`);
    assert.ok(description.hint, `${code} hint`);
  }
});

test("SURFACE_RESOLUTION_FAILED delegates to Core, keeping Core's description as its first cause", () => {
  const core = describeWeaverError(surfaceNotFoundCause);
  const description = describeWebRenderError({ code: "SURFACE_RESOLUTION_FAILED", cause: surfaceNotFoundCause });
  assert.equal(description.code, "SURFACE_RESOLUTION_FAILED");
  assert.equal(description.surfaceId, "main");
  assert.deepEqual(description.causes, [{ ...core, causes: [] }, ...core.causes]);
  assert.equal(description.causes[0]?.code, "SURFACE_NOT_FOUND");
});

test("SURFACE_RESOLUTION_FAILED flattens Core's nested cause chain, and each entry carries no further causes", () => {
  const core = describeWeaverError(componentTreeCause);
  const description = describeWebRenderError({ code: "SURFACE_RESOLUTION_FAILED", cause: componentTreeCause });
  assert.equal(description.causes.length, 1 + core.causes.length);
  assert.ok(description.causes.length > 1, "expected nested Core causes to be flattened");
  for (const entry of description.causes) {
    assert.deepEqual(entry.causes, [], `${entry.code} should carry no causes`);
  }
  assert.deepEqual(
    description.causes.map((entry) => entry.code),
    [core.code, ...core.causes.map((entry) => entry.code)],
  );
});

test("SURFACE_RESOLUTION_FAILED takes its location from Core when the wrapper has none", () => {
  const description = describeWebRenderError({ code: "SURFACE_RESOLUTION_FAILED", cause: surfaceNotFoundCause });
  assert.equal(description.surfaceId, "main");
  assert.equal(describeWebRenderError({ code: "THEME_ADAPTER_FAILED" }).surfaceId, undefined);
});

test("STALE_RENDER_INTERACTION and SERVER_EVENT_HANDOFF_FAILED carry actionable hints", () => {
  const stale = describeWebRenderError({ code: "STALE_RENDER_INTERACTION" });
  assert.match(stale.summary, /replaced/);
  assert.equal(stale.hint, "Use the latest rendered surface for this interaction.");

  const handoff = describeWebRenderError({ code: "SERVER_EVENT_HANDOFF_FAILED" });
  assert.match(handoff.summary, /onServerEvent/);
  assert.equal(handoff.hint, "Check the onServerEvent handler passed to WebSurfaceRenderer.");
});

test("a code from a newer JavaScript caller gets a generic description rather than a crash", () => {
  const description: WeaverErrorDescription = describeWebRenderError({ code: "FUTURE_CODE" } as unknown as DescribableWebError);
  assert.equal(description.code, "FUTURE_CODE");
  assert.match(description.summary, UNKNOWN_FALLBACK);
  assert.deepEqual(description.causes, []);
});

test("INVALID_LOCAL_STATE_VALUE says the value is not JSON-safe and gives the JSON-safe hint", () => {
  const description = describeWebRenderError({ code: "INVALID_LOCAL_STATE_VALUE" });
  assert.equal(description.code, "INVALID_LOCAL_STATE_VALUE");
  assert.match(description.summary, /not JSON-safe/);
  assert.match(description.summary, /local state was not changed/);
  assert.equal(
    description.hint,
    "Pass a JSON-safe value to setLocalState: a string, finite number, boolean, null, array, or plain object.",
  );
  assert.deepEqual(description.causes, []);
});

// ---------------------------------------------------------------------------
// Render-budget failures through the real WebSurfaceRenderer (WVR-064). The
// budget is set low, so mounting a surface with more children than it allows
// fails in Core's resolution, which the renderer reports as
// SURFACE_RESOLUTION_FAILED. Nothing here compares DOM nodes: a failing
// assertion on a happy-dom node would hang.
// ---------------------------------------------------------------------------

const BUDGET_CATALOG_ID = "budget";
const BUDGET_SURFACE_ID = "budget-surface";

function budgetCatalog(): JsonObject {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    catalogId: BUDGET_CATALOG_ID,
    $defs: {
      theme: { type: "object" },
      commonTypes: {
        $id: "common_types.json",
        $defs: {
          ComponentId: { type: "string" },
          ChildList: {
            oneOf: [
              { type: "array", items: { $ref: "common_types.json#/$defs/ComponentId" } },
              {
                type: "object",
                properties: { path: { type: "string" }, componentId: { $ref: "common_types.json#/$defs/ComponentId" } },
                required: ["path", "componentId"],
                additionalProperties: false,
              },
            ],
          },
        },
      },
    },
    components: {
      Column: {
        type: "object",
        properties: {
          id: { type: "string" },
          component: { const: "Column" },
          children: { $ref: "common_types.json#/$defs/ChildList" },
        },
        required: ["id", "component"],
        additionalProperties: false,
      },
      Text: {
        type: "object",
        properties: { id: { type: "string" }, component: { const: "Text" }, text: { type: "string" } },
        required: ["id", "component"],
        additionalProperties: false,
      },
    },
  };
}

/** Mounts a Column with `childCount` Text children under a budget of 2 resolved instances. */
function mountOverBudget(childCount: number) {
  const made = createWeaverRuntime({
    catalogs: [{ catalogId: BUDGET_CATALOG_ID, schema: budgetCatalog() }],
    safety: { maxResolvedInstances: 2 },
  });
  assert.ok(made.ok, "the budget test runtime must be created");
  const runtime = made.value;
  runtime.process({ version: "v0.9.1", createSurface: { surfaceId: BUDGET_SURFACE_ID, catalogId: BUDGET_CATALOG_ID } });
  // A templated child list expands one instance per data item. That is the instance-phase
  // budget (COMPONENT_INSTANCE_RESOLUTION_FAILED), the same path as the cookbook's 70-row list.
  runtime.process({
    version: "v0.9.1",
    updateDataModel: {
      surfaceId: BUDGET_SURFACE_ID,
      value: { items: Array.from({ length: childCount }, (_, index) => ({ name: `Row ${index}` })) },
    },
  });
  runtime.process({
    version: "v0.9.1",
    updateComponents: {
      surfaceId: BUDGET_SURFACE_ID,
      components: [
        { id: "root", component: "Column", children: { path: "/items", componentId: "row" } },
        { id: "row", component: "Text", text: "row" },
      ],
    },
  });
  const target = new Window().document.createElement("main") as unknown as Element;
  const renderer = new WebSurfaceRenderer({ runtime, renderers: new RendererRegistry([]) });
  return renderer.mount({ surfaceId: BUDGET_SURFACE_ID, target });
}

test("a render-budget failure's description carries the id of the surface the renderer mounted", () => {
  const result = mountOverBudget(4);
  assert.ok(!result.ok, "four children under a budget of two must fail to mount");
  const description = describeWebRenderError(result.error);
  assert.equal(description.code, "SURFACE_RESOLUTION_FAILED");
  assert.equal(description.surfaceId, BUDGET_SURFACE_ID);
  // The chain below the wrapper is Core's budget failure, not the SURFACE_NOT_FOUND chain.
  const codes = description.causes.map((cause) => cause.code);
  assert.equal(codes.includes("COMPONENT_INSTANCE_RESOLUTION_FAILED"), true, `causes were ${codes.join(", ")}`);
  assert.equal(codes.includes("RESOLUTION_BUDGET_EXCEEDED"), true, `causes were ${codes.join(", ")}`);
  assert.equal(codes.includes("SURFACE_NOT_FOUND"), false);
});

test("the raw WebRenderError from a render-budget failure carries the surface id", () => {
  const result = mountOverBudget(4);
  assert.ok(!result.ok, "four children under a budget of two must fail to mount");
  assert.equal(result.error.code, "SURFACE_RESOLUTION_FAILED");
  assert.equal(result.error.surfaceId, BUDGET_SURFACE_ID);
  assert.equal(result.error.cause.code, "COMPONENT_INSTANCE_RESOLUTION_FAILED");
});

test("the description prefers the Web surface id over Core's id, and falls back to Core's when absent", () => {
  const preferred = describeWebRenderError({ code: "SURFACE_RESOLUTION_FAILED", surfaceId: "web-id", cause: surfaceNotFoundCause });
  assert.equal(preferred.surfaceId, "web-id");
  const fallback = describeWebRenderError({ code: "SURFACE_RESOLUTION_FAILED", cause: surfaceNotFoundCause });
  assert.equal(fallback.surfaceId, "main");
});

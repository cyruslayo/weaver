import assert from "node:assert/strict";
import { test } from "node:test";
import type { A2UIComponent } from "@cylayo/weaver-core";
import {
  createBasicWebRuntime,
  describeWebRenderError,
  type RendererRegistration,
  type WebRenderError,
} from "@cylayo/weaver-web";
import { Window } from "happy-dom";
import { COOKBOOK_CATALOG_ID, cookbookCatalog } from "./catalog.js";
import { cookbookCatalogRendererRegistrations } from "./renderers.js";

/*
 * Cross-catalog safety. Each guarantee has a test that fails when it breaks:
 * (a) an unknown component on a cookbook surface is rejected at validation,
 * (b) a cookbook component on a Basic surface is rejected, with no fallback,
 * (c) a component declared by the catalog with no renderer keeps the last good
 *     DOM, calls onError, and is described with a hint.
 * Case (d), the standalone browser check, is not covered here. See the issue Log.
 *
 * Comparisons use strings and booleans only. Never pass a DOM node to assert.
 */

const SURFACE_ID = "cookbook-cross-catalog";
const BASIC_CATALOG_ID = "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json";
const LAST_GOOD_TEXT = "Last good screen";

function createWeb(renderers: readonly RendererRegistration[] = cookbookCatalogRendererRegistrations) {
  const created = createBasicWebRuntime({
    additionalCatalogs: [cookbookCatalog],
    additionalRenderers: renderers,
  });
  assert.equal(created.ok, true, "the cookbook web runtime must create");
  if (!created.ok) throw new Error("unreachable");
  return created.value;
}

function createTarget(): Element {
  const window = new Window();
  return window.document.createElement("main") as unknown as Element;
}

/** The catalog error code behind a validation rejection, or undefined for any other outcome. */
function rejectionCode(result: { ok: boolean; error?: unknown }): string | undefined {
  const catalogError = (result.error as { catalogError?: { code?: string } } | undefined)?.catalogError;
  return catalogError?.code;
}

function createSurface(catalogId: string, surfaceId: string = SURFACE_ID) {
  return { version: "v0.9.1" as const, createSurface: { surfaceId, catalogId } };
}

function update(components: A2UIComponent[], surfaceId: string = SURFACE_ID) {
  return { version: "v0.9.1" as const, updateComponents: { surfaceId, components } };
}

/** A screen that uses only components every catalog in these tests declares: Column and Text. */
const goodScreen: A2UIComponent[] = [
  { id: "root", component: "Column", children: ["title"] },
  { id: "title", component: "Text", text: LAST_GOOD_TEXT },
];

test("(a) an unknown component on a cookbook surface is rejected at validation and the prior DOM is kept", () => {
  const web = createWeb();
  assert.equal(web.runtime.process(createSurface(COOKBOOK_CATALOG_ID)).ok, true);
  assert.equal(web.runtime.process(update(goodScreen)).ok, true);
  const target = createTarget();
  assert.equal(web.mount({ surfaceId: SURFACE_ID, target }).ok, true);
  const before = target.innerHTML;
  assert.equal(before.includes(LAST_GOOD_TEXT), true, "the good screen must be on the page before the bad update");

  const rejected = web.runtime.process(
    update([
      { id: "root", component: "Column", children: ["title", "chart"] },
      { id: "title", component: "Text", text: "Broken update" },
      { id: "chart", component: "Chart3D", values: [{ label: "A", value: 1 }] } as unknown as A2UIComponent,
    ]),
  );
  assert.equal(rejected.ok, false, "Chart3D is not declared by the cookbook catalog, so validation must reject it");
  assert.equal(rejectionCode(rejected), "COMPONENT_NOT_ALLOWED", "the rejection is the catalog's component check");
  assert.equal(target.innerHTML === before, true, "the last good DOM is unchanged by the rejected update");
  assert.equal(target.innerHTML.includes("Chart3D"), false, "no Chart3D markup reaches the page");
  assert.equal(target.innerHTML.includes("Broken update"), false, "the rejected text never reaches the page");
});

test("(b) a custom DataTable on a Basic surface is rejected, and Basic never falls back to the cookbook catalog", () => {
  const web = createWeb();
  assert.equal(web.runtime.process(createSurface(BASIC_CATALOG_ID)).ok, true);
  assert.equal(web.runtime.process(update(goodScreen)).ok, true);
  const target = createTarget();
  assert.equal(web.mount({ surfaceId: SURFACE_ID, target }).ok, true);
  const before = target.innerHTML;

  const rejected = web.runtime.process(
    update([
      { id: "root", component: "Column", children: ["table"] },
      {
        id: "table",
        component: "DataTable",
        columns: [{ key: "id", header: "Order" }],
        rows: [{ id: "A-1" }],
      } as unknown as A2UIComponent,
    ]),
  );
  assert.equal(rejected.ok, false, "DataTable is not declared by the Basic catalog, so Basic must reject it");
  assert.equal(rejectionCode(rejected), "COMPONENT_NOT_ALLOWED", "the rejection is the Basic catalog's component check");
  assert.equal(target.innerHTML === before, true, "the Basic DOM is unchanged");
  assert.equal(
    target.querySelector("[data-cookbook-component=DataTable]") === null,
    true,
    "no cookbook DataTable is rendered on the Basic surface",
  );

  // Control: the same DataTable is accepted on a cookbook surface, so the rejection above is the catalog boundary.
  const controlSurface = "cookbook-control";
  assert.equal(web.runtime.process(createSurface(COOKBOOK_CATALOG_ID, controlSurface)).ok, true);
  const accepted = web.runtime.process(
    update(
      [
        { id: "root", component: "Column", children: ["table"] },
        {
          id: "table",
          component: "DataTable",
          columns: [{ key: "id", header: "Order" }],
          rows: [{ id: "A-1" }],
        } as unknown as A2UIComponent,
      ],
      controlSurface,
    ),
  );
  assert.equal(accepted.ok, true, "the same DataTable must be accepted on a cookbook surface (control)");
});

test("(c) a component declared by the catalog with no renderer keeps the last good DOM, calls onError, and gets a hint", () => {
  const renderers = cookbookCatalogRendererRegistrations.filter((registration) => registration.component !== "DataTable");
  assert.equal(
    renderers.length,
    cookbookCatalogRendererRegistrations.length - 1,
    "the test must drop exactly one renderer, the DataTable one",
  );
  const web = createWeb(renderers);
  assert.equal(web.runtime.process(createSurface(COOKBOOK_CATALOG_ID)).ok, true);
  assert.equal(web.runtime.process(update(goodScreen)).ok, true);
  const target = createTarget();
  const errors: WebRenderError[] = [];
  assert.equal(
    web.mount({ surfaceId: SURFACE_ID, target, onError: (error) => errors.push(error) }).ok,
    true,
  );
  const before = target.innerHTML;

  // The DataTable is valid against the cookbook schema, so validation passes and the render step fails.
  const update1 = web.runtime.process(
    update([
      { id: "root", component: "Column", children: ["title", "table"] },
      { id: "title", component: "Text", text: "Missing renderer update" },
      {
        id: "table",
        component: "DataTable",
        columns: [{ key: "id", header: "Order" }],
        rows: [{ id: "A-1" }],
      } as unknown as A2UIComponent,
    ]),
  );
  assert.equal(update1.ok, true, "the schema-valid DataTable passes validation; the failure happens at render");
  assert.equal(target.innerHTML === before, true, "the last good DOM is kept when the renderer is missing");
  assert.equal(target.innerHTML.includes("Missing renderer update"), false, "the failed update never reaches the page");
  assert.equal(errors.length, 1, "onError is called exactly once");
  assert.equal(errors[0]?.code, "RENDERER_NOT_FOUND", "the code is RENDERER_NOT_FOUND");
  assert.equal(errors[0]?.catalogId === COOKBOOK_CATALOG_ID, true, "the error names the cookbook catalog");
  assert.equal(errors[0]?.component === "DataTable", true, "the error names DataTable");

  const description = describeWebRenderError(errors[0]!);
  assert.equal(description.code, "RENDERER_NOT_FOUND", "describeWebRenderError keeps the code");
  assert.equal(description.summary.includes('component "DataTable"'), true, "the summary names the component");
  assert.equal(typeof description.hint === "string" && description.hint.length > 0, true, "the description gives a hint");
});

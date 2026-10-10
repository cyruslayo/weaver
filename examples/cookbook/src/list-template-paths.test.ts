import assert from "node:assert/strict";
import { test } from "node:test";
import type { A2UIComponent } from "@cylayo/weaver-core";
import { Window } from "happy-dom";
import { mountCookbookScreen, type CookbookScreenDefinition } from "./shared/harness.js";

// WVR-066. This pins, at the render level, the author-facing rule in docs/debugging.md
// ("Symptom: template text is empty with no error") and docs/architecture.md ("Collection-item
// scope"): inside a List template, a leading slash reads the DataModel root, so an item field
// bound as "/name" renders empty with no error. Do not change this without updating those docs.
// Booleans and strings only: never pass DOM nodes to assert.* (a failure can hang under happy-dom).

const SURFACE_ID = "list-template-paths";

type ProbeState = { readonly items: readonly { readonly name: string }[] };

function probeDefinition(textPath: string): CookbookScreenDefinition<ProbeState> {
  return {
    surfaceId: SURFACE_ID,
    attributionName: "List path probe",
    initialState: { items: [{ name: "Alpha" }, { name: "Beta" }] },
    components: () => [
      { id: "root", component: "Column", children: ["ticketList"] },
      {
        id: "ticketList",
        component: "List",
        children: { componentId: "ticketName", path: "/items" },
      } as unknown as A2UIComponent,
      { id: "ticketName", component: "Text", text: { path: textPath } },
    ],
    actions: {},
  };
}

/** Mounts one probe screen and returns only strings and booleans about what rendered. */
function renderItems(textPath: string): {
  itemTexts: string[];
  renderErrorCount: number;
  resolveSurfaceOk: boolean;
} {
  // SAFETY: happy-dom implements the DOM API; its node types are structurally the DOM ones.
  const window = new Window();
  const document = window.document as unknown as Document;
  const target = document.createElement("main");
  document.body.append(target);
  const renderErrors: string[] = [];
  const screen = mountCookbookScreen(target, probeDefinition(textPath), {
    onRenderError: (error) => renderErrors.push(error.code),
  });
  const resolved = screen.web.runtime.resolveSurface(SURFACE_ID);
  const itemTexts = [...target.querySelectorAll('[data-a2ui-component="Text"]')].map(
    (element) => element.textContent ?? "",
  );
  return {
    itemTexts,
    renderErrorCount: renderErrors.length,
    resolveSurfaceOk: resolved.ok,
  };
}

test("a relative item path renders each item's own value with no render error", () => {
  const result = renderItems("name");
  assert.deepEqual(result.itemTexts, ["Alpha", "Beta"]);
  assert.equal(result.renderErrorCount, 0);
  assert.equal(result.resolveSurfaceOk, true);
});

test("an absolute item path renders empty item text from the root, with no render error", () => {
  const result = renderItems("/name");
  assert.deepEqual(result.itemTexts, ["", ""]);
  assert.equal(result.renderErrorCount, 0);
  assert.equal(result.resolveSurfaceOk, true);
});

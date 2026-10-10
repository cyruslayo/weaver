import assert from "node:assert/strict";
import { test } from "node:test";
import { Window } from "happy-dom";
import { createA2UIV091Producer } from "@cylayo/weaver-core";
import { describeWebRenderError, type WebRenderError } from "@cylayo/weaver-web";
import { encodeA2UIMessage, mountCookbookScreen, type CookbookScreen } from "../shared/harness.js";
import {
  ERROR_DEMO_SURFACE_ID,
  errorDemoBadUpdates,
  errorDemoScreen,
  mountErrorDemo,
  type ErrorDemoState,
} from "./error-demo.js";

function mount() {
  const window = new Window();
  const body = window.document.body;
  const surface = body.appendChild(window.document.createElement("div")) as unknown as Element;
  const panel = body.appendChild(window.document.createElement("div")) as unknown as HTMLElement;
  const run = mountErrorDemo(surface, panel);
  return { surface, panel, run };
}

/** The visible text of the surface's titles and items, as strings. */
function surfaceText(surface: Element): string {
  return surface.textContent ?? "";
}

test("the three bad updates are single JSONL lines, one update each", () => {
  const updates = errorDemoBadUpdates();
  assert.equal(updates.length, 3);
  for (const update of updates) {
    assert.equal(update.chunk.endsWith("\n"), true, update.label);
    assert.equal(update.chunk.indexOf("\n"), update.chunk.length - 1, `${update.label} is one line`);
  }
});

test("each bad update produces exactly one described entry, in feed order", () => {
  const { run } = mount();
  assert.deepEqual(
    run.descriptions.map((description) => description.frame),
    [4, 5, 6],
  );
  assert.deepEqual(
    run.descriptions.map((description) => description.code),
    ["INVALID_JSON", "CATALOG_REGISTRY_ERROR", "SURFACE_RESOLUTION_FAILED"],
  );
  assert.ok(run.descriptions.every((description) => description.severity === "error"));
});

test("the panel lists one entry per bad frame, grouped under its frame heading", () => {
  const { panel } = mount();
  assert.equal(panel.querySelectorAll(".diagnostics-entry").length, 3);
  assert.equal(panel.querySelector(".diagnostics-count")?.textContent, "3 entries.");
  const frameHeadings = Array.from(panel.querySelectorAll(".diagnostics-frame-title"), (heading) => heading.textContent);
  assert.deepEqual(frameHeadings, ["Frame 4", "Frame 5", "Frame 6"]);
});

test("the render failure is attributed to the frame that caused it, and names the surface", () => {
  const { run } = mount();
  const render = run.descriptions.find((description) => description.code === "SURFACE_RESOLUTION_FAILED");
  assert.ok(render !== undefined);
  assert.equal(render.frame, 6);
  // The screen no longer adds this id: the value comes from describeWebRenderError() in the library.
  assert.equal(render.surfaceId, ERROR_DEMO_SURFACE_ID);
});

test("the intact surface stays on screen after the three bad updates", () => {
  const { surface } = mount();
  const text = surfaceText(surface);
  assert.ok(text.includes("Error demo"), "the heading is still rendered");
  assert.ok(text.includes("3 open tickets"), "the status is the last good value");
  assert.ok(text.includes("Login fails on Safari"), "the first ticket is still rendered");
  assert.ok(text.includes("Add dark mode"), "the last ticket is still rendered");
  assert.ok(!text.includes("Ticket 70"), "the rejected 70-row list was never rendered");
});

test("the panel is rendered beside the surface, and it is not inside it", () => {
  const { surface, panel } = mount();
  // Booleans only: a failing assertion on a DOM node would hang under happy-dom.
  assert.equal(surface.querySelector(".diagnostics-panel") === null, true);
  assert.equal(panel.querySelector(".diagnostics-panel") !== null, true);
});

/** Mounts the error demo screen alone, so each push can be observed and every render error kept. */
function mountObserved() {
  const window = new Window();
  const surface = window.document.body.appendChild(window.document.createElement("div")) as unknown as Element;
  const renderErrors: WebRenderError[] = [];
  const screen = mountCookbookScreen(surface, errorDemoScreen, {
    onRenderError: (error) => {
      renderErrors.push(error);
    },
  });
  return { surface, screen, renderErrors };
}

/** One field of the runtime's store for the error demo surface, read as the runtime holds it. */
function storeValue(screen: CookbookScreen<ErrorDemoState>, key: "items" | "status"): unknown {
  const model = screen.web.runtime.getSurface(ERROR_DEMO_SURFACE_ID)?.dataModel as Record<string, unknown> | undefined;
  return model?.[key];
}

function storeItemCount(screen: CookbookScreen<ErrorDemoState>): number {
  const items = storeValue(screen, "items");
  return Array.isArray(items) ? items.length : -1;
}

test("a render failure keeps the accepted data in the store and the last good render in the DOM", () => {
  const { surface, screen, renderErrors } = mountObserved();
  // Strings and booleans only: a failing assertion on a DOM node would hang under happy-dom.
  const lastGoodText = surface.textContent ?? "";
  const tooLong = errorDemoBadUpdates()[2]!;

  const events = screen.stream.push(tooLong.chunk);
  assert.equal(events.every((event) => event.ok), true, "the 70-row update is valid JSON and A2UI");
  assert.equal(renderErrors.length, 1, "the render fails once");
  assert.equal(describeWebRenderError(renderErrors[0]!).code, "SURFACE_RESOLUTION_FAILED");
  assert.equal(storeItemCount(screen), 70, "the store keeps the accepted 70 rows");
  assert.equal(surface.textContent ?? "", lastGoodText, "the DOM equals the last good render");
  assert.equal((surface.textContent ?? "").includes("Ticket 70"), false, "the rejected rows are not rendered");
});

test("a still-over-budget update keeps failing, and a corrective update re-syncs the store and the DOM", () => {
  const { surface, screen, renderErrors } = mountObserved();
  const producer = createA2UIV091Producer();
  const lastGoodText = surface.textContent ?? "";
  screen.stream.push(errorDemoBadUpdates()[2]!.chunk);

  // A status-only update still renders the 70-row store, so it fails the same budget.
  const statusEvents = screen.stream.push(
    encodeA2UIMessage(producer.updateDataModel({ surfaceId: ERROR_DEMO_SURFACE_ID, path: "/status", value: "Status only" })),
  );
  assert.equal(statusEvents.every((event) => event.ok), true);
  assert.equal(renderErrors.length, 2, "a status-only update still fails");
  assert.equal(describeWebRenderError(renderErrors[1]!).code, "SURFACE_RESOLUTION_FAILED");
  assert.equal(storeValue(screen, "status"), "Status only", "the store takes the status");
  assert.equal(storeItemCount(screen), 70, "the store still holds the 70 rows");
  assert.equal(surface.textContent ?? "", lastGoodText, "the DOM still shows the last good render");

  const good = [{ name: "Login fails on Safari" }, { name: "Invoice PDF is blank" }, { name: "Add dark mode" }];
  const correctiveEvents = screen.stream.push(
    encodeA2UIMessage(producer.updateDataModel({ surfaceId: ERROR_DEMO_SURFACE_ID, path: "/items", value: good })),
  );
  assert.equal(correctiveEvents.every((event) => event.ok), true);
  assert.equal(renderErrors.length, 2, "the corrective update renders without a new error");
  assert.equal(storeItemCount(screen), 3, "the store holds the three good tickets");
  const text = surface.textContent ?? "";
  assert.equal(text.includes("Invoice PDF is blank"), true, "the DOM re-syncs to the store");
  assert.equal(text.includes("Status only"), true, "the DOM shows the status the store holds");
  assert.equal(text.includes("Ticket 70"), false, "the rejected rows are gone");
});

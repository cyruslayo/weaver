import assert from "node:assert/strict";
import { test } from "node:test";
import { Window } from "happy-dom";
import { ERROR_DEMO_SURFACE_ID, errorDemoBadUpdates, mountErrorDemo } from "./error-demo.js";

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

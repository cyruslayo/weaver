import assert from "node:assert/strict";
import { test } from "node:test";
import type { WeaverErrorDescription } from "@cylayo/weaver-core";
import { Window } from "happy-dom";
import { groupDiagnostics, renderDiagnosticsPanel } from "./diagnostics-panel.js";

function description(
  overrides: Partial<WeaverErrorDescription> & { code: string; summary: string },
): WeaverErrorDescription {
  return { severity: "error", causes: [], ...overrides };
}

function setup(): { window: Window; target: HTMLElement } {
  const window = new Window();
  const target = window.document.body.appendChild(window.document.createElement("div"));
  // SAFETY: happy-dom implements the DOM API. Its node types are structurally the DOM ones.
  return { window, target: target as unknown as HTMLElement };
}

/** The headings in document order as "TAG: text" strings, so tests compare strings, not nodes. */
function headingReadout(target: HTMLElement): string[] {
  return Array.from(target.querySelectorAll("h2, h3, h4, h5, h6"), (heading) => `${heading.tagName}: ${heading.textContent}`);
}

const scrambled: WeaverErrorDescription[] = [
  description({ code: "NO_FRAME", summary: "no frame", componentId: "x", surfaceId: "s1" }),
  description({ code: "LATE", summary: "late", frame: 6, surfaceId: "s1", componentId: "b" }),
  description({ code: "FIRST_A", summary: "first a", frame: 4, surfaceId: "s2", componentId: "a" }),
  description({ code: "SECOND", summary: "second", frame: 4, surfaceId: "s1", componentId: "z" }),
  description({ code: "THIRD", summary: "third", frame: 4, surfaceId: "s1", componentId: "a" }),
  description({ code: "FOURTH", summary: "fourth", frame: 4, surfaceId: "s1", componentId: "z" }),
];

test("groupDiagnostics orders frames ascending, then surfaces and components by first appearance, with no-frame last", () => {
  const groups = groupDiagnostics(scrambled);
  assert.deepEqual(
    groups.map((group) => group.frame),
    [4, 6, undefined],
  );
  const frameFour = groups[0]!;
  assert.deepEqual([...frameFour.surfaces.keys()], ["s2", "s1"]);
  assert.deepEqual([...frameFour.surfaces.get("s1")!.components.keys()], ["z", "a"]);
  assert.deepEqual(
    frameFour.surfaces.get("s1")!.components.get("z")!.map((entry) => entry.code),
    ["SECOND", "FOURTH"],
  );
});

test("the panel renders frame, then surface, then component headings in that order", () => {
  const { target } = setup();
  renderDiagnosticsPanel(target, scrambled, { title: "Errors" });
  assert.deepEqual(headingReadout(target), [
    "H2: Errors",
    "H3: Frame 4",
    'H4: Surface "s2"',
    'H5: Component "a"',
    'H4: Surface "s1"',
    'H5: Component "z"',
    'H5: Component "a"',
    "H3: Frame 6",
    'H4: Surface "s1"',
    'H5: Component "b"',
    "H3: No frame number",
    'H4: Surface "s1"',
    'H5: Component "x"',
  ]);
});

test("the panel shows a count, and each description appears once as a list entry", () => {
  const { target } = setup();
  renderDiagnosticsPanel(target, scrambled);
  assert.equal(target.querySelector(".diagnostics-count")?.textContent, "6 entries.");
  assert.equal(target.querySelectorAll(".diagnostics-entry").length, 6);
  const codes = Array.from(target.querySelectorAll(".diagnostics-entry"), (entry) => entry.getAttribute("data-code") ?? "");
  assert.deepEqual(codes, ["FIRST_A", "SECOND", "FOURTH", "THIRD", "LATE", "NO_FRAME"]);
});

test("a missing surface or component is labeled, not dropped", () => {
  const { target } = setup();
  renderDiagnosticsPanel(target, [description({ code: "BARE", summary: "bare", frame: 2 })]);
  assert.deepEqual(headingReadout(target), ["H2: Diagnostics", "H3: Frame 2", "H4: No surface", "H5: No component"]);
});

test("each entry shows its summary, the hint, and the flattened cause chain in order", () => {
  const { target } = setup();
  renderDiagnosticsPanel(target, [
    description({
      code: "SURFACE_RESOLUTION_FAILED",
      summary: "The surface could not be resolved.",
      frame: 5,
      surfaceId: "orders",
      componentId: "chart",
      scopePath: "/rows/0",
      dataPath: "/orders",
      hint: "Keep the list under the render budget.",
      causes: [
        description({ code: "RESOLUTION_BUDGET_EXCEEDED", summary: "Too many instances." }),
        description({ code: "MISSING_COMPONENT_REFERENCE", summary: "A child is missing." }),
      ],
    }),
  ]);
  const entry = target.querySelector(".diagnostics-entry");
  assert.ok(entry !== null);
  assert.equal(entry.querySelector(".diagnostics-summary")?.textContent, "SURFACE_RESOLUTION_FAILED (error): The surface could not be resolved.");
  assert.equal(entry.querySelector(".diagnostics-hint")?.textContent, "Fix: Keep the list under the render budget.");
  const causes = Array.from(entry.querySelectorAll(".diagnostics-causes li"), (item) => item.textContent);
  assert.deepEqual(causes, ["RESOLUTION_BUDGET_EXCEEDED: Too many instances.", "MISSING_COMPONENT_REFERENCE: A child is missing."]);
  const fields = Array.from(entry.querySelectorAll(".diagnostics-fields dt, .diagnostics-fields dd"), (item) => item.textContent);
  assert.deepEqual(fields, ["Scope", "/rows/0", "Data path", "/orders"]);
});

test("an entry without a hint or causes shows neither", () => {
  const { target } = setup();
  renderDiagnosticsPanel(target, [description({ code: "PLAIN", summary: "plain" })]);
  // Booleans only: a failing assertion on a DOM node would hang under happy-dom.
  assert.equal(target.querySelector(".diagnostics-hint") === null, true);
  assert.equal(target.querySelector(".diagnostics-causes") === null, true);
});

test("the empty state says there is nothing to show, and the custom text can replace it", () => {
  const { target } = setup();
  renderDiagnosticsPanel(target, []);
  assert.equal(target.querySelector(".diagnostics-empty")?.textContent, "No errors to show.");
  assert.equal(target.querySelectorAll(".diagnostics-entry").length, 0);

  renderDiagnosticsPanel(target, [], { emptyText: "Nothing failed." });
  assert.equal(target.querySelector(".diagnostics-empty")?.textContent, "Nothing failed.");
});

test("rendering again replaces the previous panel instead of stacking another one", () => {
  const { target } = setup();
  renderDiagnosticsPanel(target, scrambled);
  renderDiagnosticsPanel(target, [description({ code: "ONLY", summary: "only", frame: 1 })]);
  assert.equal(target.querySelectorAll(".diagnostics-panel").length, 1);
  assert.equal(target.querySelectorAll(".diagnostics-entry").length, 1);
});

test("text is set with textContent: markup in a description is shown as text and creates no element", () => {
  const { target } = setup();
  const payload = "<img src=x onerror=\"window.__diagnosticsRan = 1\">";
  renderDiagnosticsPanel(target, [
    description({
      code: "HOSTILE",
      summary: payload,
      frame: 3,
      surfaceId: payload,
      componentId: payload,
      hint: payload,
      causes: [description({ code: "CAUSE", summary: payload })],
    }),
  ]);
  assert.equal(target.querySelectorAll("img").length, 0);
  assert.equal(target.querySelectorAll("script").length, 0);
  assert.ok((target.textContent ?? "").includes(payload));
  assert.ok((target.querySelector(".diagnostics-summary")?.textContent ?? "").includes(payload));
  assert.ok(headingReadout(target).includes(`H4: Surface "${payload}"`));
});

test("the panel is one keyboard-focusable region, with a label", () => {
  const { target } = setup();
  renderDiagnosticsPanel(target, scrambled, { title: "Errors" });
  const panel = target.querySelector<HTMLElement>(".diagnostics-panel");
  assert.ok(panel !== null);
  assert.equal(panel.tabIndex, 0);
  assert.equal(panel.getAttribute("aria-label"), "Errors");
});

test("headingLevel 3 moves the title and the groups down one level", () => {
  const { target } = setup();
  renderDiagnosticsPanel(target, [description({ code: "ONE", summary: "one", frame: 1, surfaceId: "s", componentId: "c" })], { title: "Error", headingLevel: 3 });
  assert.deepEqual(headingReadout(target), ["H3: Error", "H4: Frame 1", 'H5: Surface "s"', 'H6: Component "c"']);
});

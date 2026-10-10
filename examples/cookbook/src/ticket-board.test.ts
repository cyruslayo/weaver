import assert from "node:assert/strict";
import { test } from "node:test";
import type { JsonObject } from "@cylayo/weaver-core";
import type { WebServerEventHandoff } from "@cylayo/weaver-web";
import { Window } from "happy-dom";
import { createCookbookAgent, mountCookbookScreen } from "./shared/harness.js";
import {
  TICKET_ASSIGN,
  TICKET_BOARD_INITIAL_STATE,
  TICKET_CLOSE,
  TICKET_MOVE,
  TICKET_BOARD_SURFACE_ID,
  ticketBoardScreen,
} from "./screens/ticket-board.js";

function mount() {
  const window = new Window();
  // SAFETY: happy-dom implements the DOM API; its node types are structurally the DOM ones.
  const document = window.document as unknown as Document;
  const target = document.createElement("main");
  // Attached to the document so focus can move, as it does in a browser.
  document.body.append(target);
  const screen = mountCookbookScreen(target, ticketBoardScreen);
  return { window, document, target, screen };
}

function actionMessage(
  name: string,
  context: JsonObject,
): WebServerEventHandoff {
  return {
    message: {
      version: "v0.9.1",
      action: {
        name,
        surfaceId: TICKET_BOARD_SURFACE_ID,
        sourceComponentId: "test",
        timestamp: "2030-01-01T00:00:00.000Z",
        context,
      },
    },
  };
}

/** The Card that shows a ticket title. */
function cardFor(target: Element, title: string): Element {
  const card = [...target.querySelectorAll('[data-a2ui-component="Card"]')].find(
    (candidate) => candidate.querySelector("h3")?.textContent === title,
  );
  if (card === undefined) throw new Error(`Card "${title}" was not rendered`);
  return card;
}

function buttonIn(root: Element, label: string): HTMLButtonElement {
  const button = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent === label,
  );
  if (button === undefined) throw new Error(`Button "${label}" was not rendered`);
  return button;
}

/** The column container, found from its heading. */
function columnFor(target: Element, heading: string): Element {
  const title = [...target.querySelectorAll("h2")].find(
    (candidate) => candidate.textContent === heading,
  );
  if (title?.parentElement === undefined || title.parentElement === null)
    throw new Error(`Column "${heading}" was not rendered`);
  return title.parentElement;
}

function titlesIn(column: Element): string[] {
  return [...column.querySelectorAll("h3")].map((title) => title.textContent ?? "");
}

function dataModelOf(screen: ReturnType<typeof mount>["screen"]): JsonObject {
  return screen.web.runtime.getSurface(TICKET_BOARD_SURFACE_ID)
    ?.dataModel as unknown as JsonObject;
}

test("the board renders three Row, Column, and List columns with the initial tickets inside the finite budgets", () => {
  const { target, screen } = mount();

  assert.deepEqual(titlesIn(columnFor(target, "Open")), [
    "Fix login redirect",
    "Document the cookbook",
  ]);
  assert.deepEqual(titlesIn(columnFor(target, "In progress")), ["Add keyboard focus ring"]);
  assert.deepEqual(titlesIn(columnFor(target, "Done")), []);
  assert.equal(target.querySelectorAll('[data-a2ui-component="Card"]').length, 3);

  const resolved = screen.web.runtime.resolveSurface(TICKET_BOARD_SURFACE_ID);
  assert.equal(resolved.ok, true, "the board must stay within the finite budgets");
  assert.deepEqual(screen.getState(), TICKET_BOARD_INITIAL_STATE);
});

test("moving a ticket updates both columns in the DOM, the agent state, and the core data model", () => {
  const { target, screen } = mount();

  buttonIn(cardFor(target, "Fix login redirect"), "Start").click();

  assert.deepEqual(titlesIn(columnFor(target, "Open")), ["Document the cookbook"]);
  assert.deepEqual(titlesIn(columnFor(target, "In progress")), [
    "Add keyboard focus ring",
    "Fix login redirect",
  ]);
  assert.deepEqual(
    screen.getState().board.open.map((ticket) => ticket.id),
    ["t-2"],
  );
  assert.deepEqual(
    screen.getState().board.inProgress.map((ticket) => ticket.id),
    ["t-3", "t-1"],
  );
  assert.deepEqual(dataModelOf(screen).board, screen.getState().board);
  assert.equal(
    screen.web.runtime.resolveSurface(TICKET_BOARD_SURFACE_ID).ok,
    true,
  );
  assert.deepEqual(screen.rejectedEventNames, []);
});

test("old-scope buttons are inert after an update, thanks to the stale-generation guard", () => {
  const { target, screen } = mount();

  // Capture the "Start" button of t-1 before anything moves. Its context is { ticketId: "t-1", from: "open", to: "inProgress" }.
  const staleStart = buttonIn(cardFor(target, "Fix login redirect"), "Start");

  // Move t-1 out and back. It is open again, so that old context is valid at the state level.
  buttonIn(cardFor(target, "Fix login redirect"), "Start").click();
  buttonIn(cardFor(target, "Fix login redirect"), "Back to open").click();
  assert.deepEqual(
    screen.getState().board.open.map((ticket) => ticket.id),
    ["t-2", "t-1"],
  );

  // Without the stale-generation guard this click would move t-1 again. It must do nothing.
  const before = screen.getState();
  staleStart.click();

  assert.deepEqual(screen.getState(), before);
  assert.equal(staleStart.isConnected, false, "the old button must be detached after the update");
  assert.deepEqual(screen.rejectedEventNames, []);
});

test("every action is a native, enabled, focusable button in the tab order", () => {
  const { document, target } = mount();
  const buttons = [...target.querySelectorAll<HTMLButtonElement>("button")];

  assert.ok(buttons.length > 0);
  for (const button of buttons) {
    assert.equal(button.disabled, false, `"${button.textContent}" must be enabled`);
    assert.ok(button.tabIndex >= 0, `"${button.textContent}" must be in the tab order`);
    button.focus();
    assert.ok(document.activeElement === button, `"${button.textContent}" must take focus`);
  }
  assert.ok(buttons.some((button) => button.textContent === "Start"));
  assert.ok(buttons.some((button) => button.textContent === "Close"));
  assert.ok(buttons.some((button) => button.textContent === "Assign"));
});

test("the Assign Modal opens from its trigger, closes with its Close control, and returns focus to the trigger", () => {
  const { document, target, screen } = mount();
  const trigger = buttonIn(cardFor(target, "Fix login redirect"), "Assign");

  // A keyboard user tabs to the trigger, then presses Enter, which the browser turns into a click.
  trigger.focus();
  trigger.click();
  const dialog = target.querySelector('[role="dialog"]');
  assert.ok(dialog !== null, "the dialog must open");
  assert.deepEqual(
    screen.rejectedEventNames,
    [],
    "the Modal trigger's required action must never reach the agent",
  );
  assert.equal(dialog.getAttribute("aria-modal"), "true");
  // Keyboard users land inside the dialog when it opens.
  assert.ok(dialog.contains(document.activeElement), "focus must move into the dialog");

  const close = buttonIn(dialog, "Close");
  close.click();
  assert.equal(target.querySelector('[role="dialog"]') === null, true, "the dialog must close");

  const restored = target.querySelector<HTMLButtonElement>(
    '[data-a2ui-modal-trigger] button',
  );
  assert.ok(restored !== null, "the trigger must be rendered again");
  // Identity checks use ok() so a failure prints a short message, not the DOM graph.
  assert.ok(document.activeElement === restored, "focus must return to the trigger");
});

test("assign opens a ChoicePicker of people, writes the draft, and the confirm button assigns and resets the draft", () => {
  const { window, target, screen } = mount();

  buttonIn(cardFor(target, "Document the cookbook"), "Assign").click();
  const dialog = target.querySelector('[role="dialog"]') as Element;
  const labels = [...dialog.querySelectorAll("label")].map((label) => label.textContent?.trim());
  assert.ok(labels.includes("Grace Hopper"));

  const grace = dialog.querySelector<HTMLInputElement>('input[value="grace"]');
  assert.ok(grace !== null, "the person must be an option");
  grace.checked = true;
  const DomEvent = (window as unknown as typeof globalThis).Event;
  grace.dispatchEvent(new DomEvent("change"));
  assert.deepEqual(dataModelOf(screen).draft, { assignee: ["grace"] });

  // The picker write re-renders the surface, so the Confirm button must be read from the fresh dialog.
  const freshDialog = target.querySelector('[role="dialog"]') as Element;
  buttonIn(freshDialog, "Assign ticket").click();

  assert.equal(
    screen.getState().board.open.find((ticket) => ticket.id === "t-2")?.assignee,
    "Grace Hopper",
  );
  assert.match(cardFor(target, "Document the cookbook").textContent ?? "", /Grace Hopper/);
  assert.deepEqual(screen.getState().draft, { assignee: [] });
  assert.deepEqual(dataModelOf(screen).draft, { assignee: [] });
});

test("move, assign, and close emit only updateDataModel with the exact changed paths", () => {
  const agent = createCookbookAgent(ticketBoardScreen, { catalogId: "test-catalog" });
  agent.start();

  const cases: Array<{ name: string; context: JsonObject; paths: string[] }> = [
    { name: TICKET_MOVE, context: { ticketId: "t-1", from: "open", to: "inProgress" }, paths: ["/board/open", "/board/inProgress"] },
    { name: TICKET_CLOSE, context: { ticketId: "t-3" }, paths: ["/board/inProgress", "/board/done"] },
    { name: TICKET_ASSIGN, context: { ticketId: "t-2", assignee: ["ada"] }, paths: ["/board/open", "/draft/assignee"] },
  ];

  for (const { name, context, paths } of cases) {
    const outcome = agent.handleAction(name, context);
    assert.equal(outcome.accepted, true, `${name} must be accepted`);
    if (!outcome.accepted) continue;
    assert.deepEqual(
      outcome.messages.map((message) => Object.keys(message).sort()),
      paths.map(() => ["updateDataModel", "version"]),
      `${name} must emit only updateDataModel messages`,
    );
    assert.deepEqual(
      outcome.messages.map((message) => (message as unknown as { updateDataModel: { path: string } }).updateDataModel.path),
      paths,
      `${name} must emit exactly its changed paths`,
    );
  }
});

test("invalid trusted context is rejected before any state changes", () => {
  const { target, screen } = mount();
  const before = screen.getState();

  const rejected: Array<[string, JsonObject]> = [
    [TICKET_MOVE, { ticketId: "missing", from: "open", to: "inProgress" }],
    [TICKET_MOVE, { ticketId: "t-3", from: "open", to: "inProgress" }],
    [TICKET_MOVE, { ticketId: "t-1", from: "open", to: "done" }],
    [TICKET_MOVE, { ticketId: "t-1", from: "open", to: "open" }],
    [TICKET_MOVE, { ticketId: "t-1", from: "sideways", to: "inProgress" }],
    [TICKET_CLOSE, { ticketId: "missing" }],
    [TICKET_ASSIGN, { ticketId: "t-1", assignee: [] }],
    [TICKET_ASSIGN, { ticketId: "t-1", assignee: ["ada", "grace"] }],
    [TICKET_ASSIGN, { ticketId: "t-1", assignee: ["nobody"] }],
    [TICKET_ASSIGN, { ticketId: "t-1", assignee: "ada" }],
  ];
  for (const [name, context] of rejected) {
    assert.deepEqual(
      screen.handleServerEvent(actionMessage(name, context)),
      { accepted: false, reason: "INVALID_EVENT_CONTEXT" },
      `${name} ${JSON.stringify(context)} must be rejected`,
    );
  }
  assert.deepEqual(screen.getState(), before);
  assert.deepEqual(titlesIn(columnFor(target, "Open")), ["Fix login redirect", "Document the cookbook"]);
});

test("closing a ticket moves it to Done, and a Done ticket cannot be closed again", () => {
  const { target, screen } = mount();

  buttonIn(cardFor(target, "Add keyboard focus ring"), "Close").click();
  assert.deepEqual(titlesIn(columnFor(target, "Done")), ["Add keyboard focus ring"]);
  assert.deepEqual(titlesIn(columnFor(target, "In progress")), []);
  assert.deepEqual(
    screen.getState().board.done.map((ticket) => ticket.id),
    ["t-3"],
  );
  assert.equal(
    [...cardFor(target, "Add keyboard focus ring").querySelectorAll("button")].some(
      (button) => button.textContent === "Close",
    ),
    false,
    "a Done ticket offers no Close action",
  );
  assert.deepEqual(
    screen.handleServerEvent(actionMessage(TICKET_CLOSE, { ticketId: "t-3" })),
    { accepted: false, reason: "INVALID_EVENT_CONTEXT" },
  );
});

test("the board rejects foreign surfaces and unknown event names", () => {
  const { screen } = mount();
  const before = screen.getState();

  assert.deepEqual(
    screen.handleServerEvent({
      message: {
        version: "v0.9.1",
        action: {
          name: TICKET_MOVE,
          surfaceId: "other-surface",
          sourceComponentId: "test",
          timestamp: "2030-01-01T00:00:00.000Z",
          context: { ticketId: "t-1", from: "open", to: "inProgress" },
        },
      },
    }),
    { accepted: false, reason: "SURFACE_NOT_ALLOWED" },
  );
  assert.deepEqual(
    screen.handleServerEvent(actionMessage("ticket.delete", { ticketId: "t-1" })),
    { accepted: false, reason: "EVENT_NOT_ALLOWLISTED" },
  );
  assert.deepEqual(screen.getState(), before);
});

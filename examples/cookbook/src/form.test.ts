import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type {
  A2UIServerMessage,
  JsonObject,
} from "@cylayo/weaver-core";
import type { WebServerEventHandoff } from "@cylayo/weaver-web";
import { Window } from "happy-dom";
import { mountCookbookScreen } from "./shared/harness.js";
import {
  FORM_SUBMIT,
  FORM_SURFACE_ID,
  formPrompt,
  formRegexMatcher,
  formScreen,
  validateSubmission,
} from "./screens/form/screen.js";

function dom() {
  const window = new Window();
  return {
    window,
    target: window.document.createElement("main") as unknown as Element,
  };
}

function mountForm() {
  const { window, target } = dom();
  const screen = mountCookbookScreen(target, formScreen);
  // Record every message the agent sends to the stream, in order.
  const sent: A2UIServerMessage[] = [];
  const send = screen.stream.send.bind(screen.stream);
  screen.stream.send = (messages) => {
    sent.push(...messages);
    send(messages);
  };
  return { window, target, screen, sent };
}

function textOf(node: Element): string {
  return node.textContent ?? "";
}

/** Dispatches a happy-dom event. The cast only satisfies the DOM lib type. */
function fire(window: Window, control: Element, type: string): void {
  control.dispatchEvent(new window.Event(type) as unknown as globalThis.Event);
}

function controlFor(target: Element, labelText: string): HTMLInputElement {
  const label = [...target.querySelectorAll("label")].find(
    (candidate) => textOf(candidate).trim() === labelText,
  );
  if (label === undefined) throw new Error(`Label "${labelText}" was not rendered`);
  const htmlFor = label.getAttribute("for");
  const control =
    htmlFor === null
      ? label.querySelector<HTMLInputElement>("input")
      : target.querySelector<HTMLInputElement>(`[id="${htmlFor}"]`);
  if (control === null) throw new Error(`Control for "${labelText}" was not rendered`);
  return control;
}

function typeInto(window: Window, control: HTMLInputElement, value: string): void {
  control.value = value;
  fire(window, control, "input");
}

function submitButton(target: Element): HTMLButtonElement {
  const button = [...target.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => textOf(candidate) === "Submit request",
  );
  if (button === undefined) throw new Error("Submit button was not rendered");
  return button;
}

function fillValid(window: Window, target: Element, overrides: Partial<Record<string, string>> = {}): void {
  const values: Record<string, string> = {
    Name: "Ada Lovelace",
    Email: "ada@example.com",
    Summary: "Cannot export invoices",
    "Order reference": "AB-1234",
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    typeInto(window, controlFor(target, label), value);
  }
  const technical = target.querySelector<HTMLInputElement>('input[type="radio"][value="technical"]');
  if (technical === null) throw new Error("Technical option was not rendered");
  technical.checked = true;
  fire(window, technical, "change");
}

function actionMessage(context: JsonObject): WebServerEventHandoff {
  return {
    message: {
      version: "v0.9.1",
      action: {
        name: FORM_SUBMIT,
        surfaceId: FORM_SURFACE_ID,
        sourceComponentId: "submit",
        timestamp: "2030-01-01T00:00:00.000Z",
        context,
      },
    },
  };
}

function onlyDataModelUpdates(messages: readonly A2UIServerMessage[]): boolean {
  return messages.every(
    (message) =>
      "updateDataModel" in message &&
      !("updateComponents" in message) &&
      !("createSurface" in message),
  );
}

test("first render is correct: labels, empty controls, required messages, disabled submit", () => {
  const { target, screen } = mountForm();

  assert.match(textOf(target), /Support request/);
  for (const label of ["Name", "Email", "Summary", "Order reference", "Urgent", "Category", "Due date"]) {
    assert.ok(
      [...target.querySelectorAll("label, legend")].some((node) => textOf(node).trim() === label),
      `label "${label}" must render`,
    );
  }
  assert.equal(controlFor(target, "Name").value, "");
  assert.equal(controlFor(target, "Email").value, "");
  assert.equal(controlFor(target, "Urgent").checked, false);
  assert.equal(controlFor(target, "Due date").value, "");
  // Basic checks have no "touched" state, so empty required fields show their messages from the start.
  assert.match(textOf(target), /Enter your name\./);
  assert.match(textOf(target), /Enter a valid email address\./);
  assert.match(textOf(target), /Summarise the problem\./);
  assert.match(textOf(target), /Choose a category\./);
  assert.equal(submitButton(target).disabled, true, "submit must start disabled");
  assert.doesNotMatch(textOf(target), /Ticket SR-/);
  assert.equal(controlFor(target, "Name").getAttribute("aria-invalid"), "true");
  assert.deepEqual(screen.getState().errors, []);
  assert.equal(screen.getState().result, "");
});

test("keyboard only: the controls are native and follow DOM order, ending at Submit", () => {
  const { target } = mountForm();

  const focusable = [...target.querySelectorAll("input, textarea, select, button")].map(
    (element) => `${element.tagName.toLowerCase()}:${element.getAttribute("type") ?? ""}`,
  );
  assert.deepEqual(focusable, [
    "input:text",
    "input:text",
    "input:text",
    "input:text",
    "input:checkbox",
    "input:radio",
    "input:radio",
    "input:radio",
    "input:radio",
    "input:date",
    "button:button",
  ]);
  // Native checkbox toggles with Space and native button activates with Enter or Space.
  // happy-dom does not simulate key presses, so the test asserts those controls.
});

test("invalid input shows the check message and blocks submit", () => {
  const { window, target, screen, sent } = mountForm();
  const before = screen.getState();

  typeInto(window, controlFor(target, "Name"), "");
  assert.match(textOf(target), /Enter your name\./);
  assert.equal(controlFor(target, "Name").getAttribute("aria-invalid"), "true");
  assert.equal(submitButton(target).disabled, true);
  submitButton(target).click();
  assert.deepEqual(screen.getState(), before);
  assert.equal(sent.length, 0, "a blocked submit must not reach the agent");

  typeInto(window, controlFor(target, "Name"), "Ada");
  typeInto(window, controlFor(target, "Email"), "not-an-email");
  assert.match(textOf(target), /Enter a valid email address\./);
  assert.equal(submitButton(target).disabled, true);
  assert.equal(sent.length, 0);
});

test("a valid submit round-trips to an accepted ticket and updates only the data model", () => {
  const { window, target, screen, sent } = mountForm();
  fillValid(window, target);
  assert.equal(submitButton(target).disabled, false, "valid input enables submit");

  submitButton(target).click();

  assert.equal(screen.getState().result, "SR-1001");
  assert.equal(screen.getState().resultText, "Ticket SR-1001 created.");
  assert.deepEqual(screen.getState().errors, []);
  assert.match(textOf(target), /Ticket SR-1001 created\./);
  assert.ok(sent.length > 0, "the agent must answer the submit");
  assert.ok(onlyDataModelUpdates(sent), "the submit answer must be updateDataModel only");
});

test("ticket numbers are deterministic across accepted submits", () => {
  const { window, target, screen } = mountForm();
  fillValid(window, target);
  submitButton(target).click();
  submitButton(target).click();

  assert.equal(screen.getState().result, "SR-1002");
  assert.equal(screen.getState().nextTicket, 1003);
});

test("a whitespace-only name passes the client check and is rejected by the agent with /errors", () => {
  const { window, target, screen, sent } = mountForm();
  fillValid(window, target, { Name: "   " });
  assert.equal(submitButton(target).disabled, false);

  submitButton(target).click();

  assert.deepEqual(screen.getState().errors, ["Enter your name."]);
  assert.equal(screen.getState().result, "");
  assert.match(textOf(target), /Enter your name\./);
  assert.doesNotMatch(textOf(target), /Ticket SR-/);
  assert.ok(sent.length > 0);
  assert.ok(onlyDataModelUpdates(sent), "the rejected answer must be updateDataModel only");
});

test("the agent re-validates a forged context and answers with /errors, not updateComponents", () => {
  const { target, screen, sent } = mountForm();
  const before = screen.getState();

  assert.deepEqual(
    screen.handleServerEvent(
      actionMessage({
        name: "Ada",
        email: "not-an-email",
        summary: "",
        orderRef: "ab-12",
        urgent: false,
        category: ["unknown"],
        dueDate: "",
      }),
    ),
    { accepted: true },
  );
  assert.deepEqual(screen.getState().errors, [
    "Enter a valid email address.",
    "Summarise the problem.",
    "Order reference must look like AB-1234.",
    "Choose a category.",
  ]);
  assert.equal(screen.getState().result, "");
  assert.notDeepEqual(screen.getState(), before);
  assert.match(textOf(target), /Enter a valid email address\./);
  assert.ok(onlyDataModelUpdates(sent));
});

test("a context of the wrong shape is rejected and leaves the state unchanged", () => {
  const { screen, sent } = mountForm();
  const before = screen.getState();

  assert.deepEqual(
    screen.handleServerEvent(
      actionMessage({
        name: "Ada",
        email: "ada@example.com",
        summary: "x",
        orderRef: "AB-1234",
        urgent: "yes",
        category: ["billing"],
        dueDate: "",
      }),
    ),
    { accepted: false, reason: "INVALID_EVENT_CONTEXT" },
  );
  assert.deepEqual(screen.getState(), before);
  assert.equal(sent.length, 0);
});

test("agent validation covers each rule and the order-reference matcher is trusted", () => {
  const valid = {
    name: "Ada",
    email: "ada@example.com",
    summary: "Help",
    orderRef: "AB-1234",
    urgent: false,
    category: ["account"],
    dueDate: "2030-01-31",
  };
  assert.deepEqual(validateSubmission({ ...valid }), []);
  assert.deepEqual(validateSubmission({ ...valid, summary: "x".repeat(81) }), [
    "Summary must be 80 characters or fewer.",
  ]);
  assert.deepEqual(validateSubmission({ ...valid, orderRef: "ab-1234" }), [
    "Order reference must look like AB-1234.",
  ]);
  assert.deepEqual(validateSubmission({ ...valid, dueDate: "31/01/2030" }), [
    "Due date must be a date.",
  ]);

  assert.equal(formRegexMatcher({ value: "AB-1234", pattern: "^[A-Z]{2}-[0-9]{4}$" }), true);
  assert.equal(formRegexMatcher({ value: "AB-12345", pattern: "^[A-Z]{2}-[0-9]{4}$" }), false);
  assert.throws(() => formRegexMatcher({ value: "x", pattern: "(a+)+$" }), /Unsupported/);
});

test("prompt.txt is the generated prompt for this screen", () => {
  const onDisk = readFileSync(new URL("../src/screens/form/prompt.txt", import.meta.url), "utf8");
  assert.equal(onDisk, formPrompt());
  assert.match(onDisk, /TextField/);
  assert.match(onDisk, /ChoicePicker/);
});

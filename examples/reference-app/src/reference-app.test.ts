import assert from "node:assert/strict";
import { test } from "node:test";
import type { A2UIClientActionMessage, JsonObject } from "@weaver/core";
import { Window } from "happy-dom";
import {
  createReferenceAgent,
  REFERENCE_CREATE_REQUEST,
  REFERENCE_SURFACE_ID,
} from "./application-agent.js";
import { encodeA2UIMessage } from "./agent-stream.js";
import { createReferenceApplication } from "./reference-app.js";
import type { WebServerEventHandoff } from "@weaver/web";

function dom() {
  const window = new Window();
  return {
    window,
    target: window.document.createElement("main") as unknown as Element,
  };
}

function dispatch(node: Element, type: string): void {
  const EventConstructor = node.ownerDocument.defaultView!.Event;
  node.dispatchEvent(new EventConstructor(type, { bubbles: true }));
}

function actionMessage(
  name: string,
  context: JsonObject = {},
): WebServerEventHandoff {
  const message: A2UIClientActionMessage = {
    version: "v0.9.1",
    action: {
      name,
      surfaceId: REFERENCE_SURFACE_ID,
      sourceComponentId: "test",
      timestamp: "2030-01-01T00:00:00.000Z",
      context,
    },
  };
  return { message };
}

test("proves the reference application producer, JSONL, ingestion, Web, and action round trip", () => {
  const { target } = dom();
  const application = createReferenceApplication(target);
  const initial = application.agent.start();

  assert.equal(initial.length, 3);
  assert.equal(initial[0]!.version, "v0.9.1");
  assert.equal(
    encodeA2UIMessage(initial[0]!),
    `${JSON.stringify(initial[0])}\n`,
  );
  assert.ok(application.web.runtime.getSurface(application.surfaceId));
  const initialSurface = application.web.runtime.resolveSurface(
    application.surfaceId,
  );
  assert.equal(initialSurface.ok, true);
  assert.equal(initialSurface.ok && initialSurface.value.tree.ready, true);
  assert.match(target.textContent ?? "", /Reference Request/);
  assert.match(target.textContent ?? "", /Create request/);
  assert.equal(
    target.querySelector("input[type=text]")?.getAttribute("type"),
    "text",
  );
  assert.ok(target.querySelector("button"));
  assert.equal(
    target.querySelector("[data-weaver-surface-attribution]")?.textContent,
    "Reference Agent",
  );

  const title = target.querySelector<HTMLInputElement>('input[type="text"]')!;
  title.value = "Build docs";
  dispatch(title, "input");
  const draftAfterTitle = application.web.runtime.getSurface(
    application.surfaceId,
  )?.dataModel as { draft: { title: string } };
  assert.equal(draftAfterTitle.draft.title, "Build docs");

  const high = target.querySelector<HTMLInputElement>(
    'input[type="radio"][value="high"]',
  )!;
  high.checked = true;
  dispatch(high, "change");
  const draftAfterPriority = application.web.runtime.getSurface(
    application.surfaceId,
  )?.dataModel as { draft: { priority: string[] } };
  assert.deepEqual(draftAfterPriority.draft.priority, ["high"]);

  const button = [...target.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent === "Create request",
  );
  if (button === undefined)
    throw new Error("Create request button was not rendered");
  button.click();
  assert.deepEqual(application.lastAcceptedContext, {
    title: "Build docs",
    priority: ["high"],
  });

  const finalState = application.agent.getState();
  assert.equal(finalState.result.count, 1);
  assert.equal(finalState.result.status, "Created: Build docs");
  const finalModel = application.web.runtime.getSurface(application.surfaceId)
    ?.dataModel as unknown as typeof finalState;
  assert.deepEqual(finalModel, finalState);
  assert.match(target.textContent ?? "", /Created: Build docs/);
  assert.match(target.textContent ?? "", /Submitted: 1/);

  const finalSurface = application.web.runtime.resolveSurface(
    application.surfaceId,
  );
  assert.equal(
    finalSurface.ok,
    true,
    "normal flow must stay within finite runtime budgets",
  );

  const unknown = application.handleServerEvent(
    actionMessage("reference.unknown", { title: "must not run" }),
  );
  assert.deepEqual(unknown, {
    accepted: false,
    reason: "EVENT_NOT_ALLOWLISTED",
  });
  assert.deepEqual(application.agent.getState(), finalState);
  assert.deepEqual(application.rejectedEventNames, ["reference.unknown"]);

  application.stream.finish();
  application.stream.reset();
});

test("the trusted handoff rejects invalid domain contexts before invoking the agent", () => {
  const { target } = dom();
  const application = createReferenceApplication(target);
  const cases = [
    { title: "   ", priority: ["normal"] },
    { title: "Build docs", priority: [] },
    { title: "Build docs", priority: ["bogus"] },
    { title: "Build docs", priority: ["high", "bogus"] },
    { title: "Build docs", priority: ["high", "urgent"] },
  ];

  for (const context of cases) {
    const stateBefore = application.agent.getState();
    const modelBefore = structuredClone(
      application.web.runtime.getSurface(application.surfaceId)?.dataModel,
    );
    const acceptedContextBefore = application.lastAcceptedContext;
    assert.deepEqual(
      application.handleServerEvent(
        actionMessage(REFERENCE_CREATE_REQUEST, context),
      ),
      { accepted: false, reason: "INVALID_EVENT_CONTEXT" },
    );
    assert.deepEqual(application.agent.getState(), stateBefore);
    assert.deepEqual(
      application.web.runtime.getSurface(application.surfaceId)?.dataModel,
      modelBefore,
    );
    assert.deepEqual(application.lastAcceptedContext, acceptedContextBefore);
    assert.match(target.textContent ?? "", /Ready for a request/);
    assert.doesNotMatch(target.textContent ?? "", /Created:/);
  }
});

test("the deterministic agent owns state and emits a producer-created update", () => {
  const agent = createReferenceAgent({ surfaceId: "s", catalogId: "catalog" });
  assert.deepEqual(agent.getState().result, {
    count: 0,
    status: "Ready for a request",
    countLabel: "Submitted: 0",
  });
  const update = agent.handleCreateRequest({
    title: "Local task",
    priority: ["urgent"],
  });
  assert.equal(update.length, 1);
  assert.ok("updateDataModel" in update[0]!);
  assert.equal(agent.getState().result.status, "Created: Local task");
});

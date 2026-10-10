import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { WebServerEventHandoff } from "@cylayo/weaver-web";
import type { A2UIComponent, JsonObject } from "@cylayo/weaver-core";
import { Window } from "happy-dom";
import {
  mountCookbookScreen,
  type CookbookScreenDefinition,
} from "./shared/harness.js";
import {
  PLACEHOLDER_PING,
  PLACEHOLDER_SURFACE_ID,
  placeholderScreen,
} from "./screens/placeholder.js";

function dom() {
  const window = new Window();
  return {
    window,
    target: window.document.createElement("main") as unknown as Element,
  };
}

function actionMessage(
  name: string,
  surfaceId: string,
  context: JsonObject = {},
): WebServerEventHandoff {
  return {
    message: {
      version: "v0.9.1",
      action: {
        name,
        surfaceId,
        sourceComponentId: "test",
        timestamp: "2030-01-01T00:00:00.000Z",
        context,
      },
    },
  };
}

function buttonLabeled(target: Element, label: string): HTMLButtonElement {
  const button = [...target.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent === label,
  );
  if (button === undefined) throw new Error(`Button "${label}" was not rendered`);
  return button;
}

test("the placeholder screen proves the producer, JSONL, ingestion, Web, and action round trip", () => {
  const { target } = dom();
  const screen = mountCookbookScreen(target, placeholderScreen);

  assert.ok(screen.web.runtime.getSurface(PLACEHOLDER_SURFACE_ID));
  const initial = screen.web.runtime.resolveSurface(PLACEHOLDER_SURFACE_ID);
  assert.equal(initial.ok, true);
  assert.equal(initial.ok && initial.value.tree.ready, true);
  assert.match(target.textContent ?? "", /Cookbook placeholder/);
  assert.match(target.textContent ?? "", /Pings: 0/);
  assert.equal(
    target.querySelector("[data-weaver-surface-attribution]")?.textContent,
    "Cookbook Agent",
  );

  buttonLabeled(target, "Ping the agent").click();
  buttonLabeled(target, "Ping the agent").click();

  assert.deepEqual(screen.getState(), { count: 2, countLabel: "Pings: 2" });
  const model = screen.web.runtime.getSurface(PLACEHOLDER_SURFACE_ID)
    ?.dataModel as unknown as ReturnType<typeof screen.getState>;
  assert.deepEqual(model, screen.getState());
  assert.match(target.textContent ?? "", /Pings: 2/);
  assert.deepEqual(screen.rejectedEventNames, []);

  const resolved = screen.web.runtime.resolveSurface(PLACEHOLDER_SURFACE_ID);
  assert.equal(
    resolved.ok,
    true,
    "normal flow must stay within finite runtime budgets",
  );

  screen.stream.finish();
  screen.stream.reset();
});

test("the harness rejects unknown events, prototype keys, and foreign surfaces without changing state", () => {
  const { target } = dom();
  const screen = mountCookbookScreen(target, placeholderScreen);
  const before = screen.getState();

  assert.deepEqual(
    screen.handleServerEvent(
      actionMessage("cookbook.unknown", PLACEHOLDER_SURFACE_ID),
    ),
    { accepted: false, reason: "EVENT_NOT_ALLOWLISTED" },
  );
  assert.deepEqual(
    screen.handleServerEvent(actionMessage("constructor", PLACEHOLDER_SURFACE_ID)),
    { accepted: false, reason: "EVENT_NOT_ALLOWLISTED" },
  );
  assert.deepEqual(
    screen.handleServerEvent(actionMessage(PLACEHOLDER_PING, "other-surface")),
    { accepted: false, reason: "SURFACE_NOT_ALLOWED" },
  );

  assert.deepEqual(screen.getState(), before);
  assert.deepEqual(screen.rejectedEventNames, ["cookbook.unknown", "constructor"]);
});

test("invalid trusted context is rejected before any state or rendering changes", () => {
  const { target } = dom();
  const definition: CookbookScreenDefinition<{ title: string; status: string }> = {
    surfaceId: "cookbook-test-save",
    attributionName: "Test Agent",
    initialState: { title: "", status: "Ready" },
    components: (): A2UIComponent[] => [
      { id: "root", component: "Column", children: ["status"] },
      { id: "status", component: "Text", text: { path: "/status" } },
    ],
    actions: {
      "cookbook.test.save": {
        transition: (state, context) => {
          const title = context.title;
          if (typeof title !== "string" || title.trim().length === 0)
            return undefined;
          return { title: title.trim(), status: `Saved: ${title.trim()}` };
        },
      },
    },
  };
  const screen = mountCookbookScreen(target, definition);
  const before = screen.getState();

  const invalidContexts: JsonObject[] = [{ title: "   " }, {}, { title: 3 }];
  for (const context of invalidContexts) {
    assert.deepEqual(
      screen.handleServerEvent(
        actionMessage("cookbook.test.save", "cookbook-test-save", context),
      ),
      { accepted: false, reason: "INVALID_EVENT_CONTEXT" },
    );
    assert.deepEqual(screen.getState(), before);
    assert.match(target.textContent ?? "", /Ready/);
    assert.doesNotMatch(target.textContent ?? "", /Saved:/);
  }

  assert.deepEqual(
    screen.handleServerEvent(
      actionMessage("cookbook.test.save", "cookbook-test-save", { title: " Docs " }),
    ),
    { accepted: true },
  );
  assert.equal(screen.getState().status, "Saved: Docs");
  assert.match(target.textContent ?? "", /Saved: Docs/);
});

test("the package depends only on Core, Web, Vite, and happy-dom", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

  assert.deepEqual(Object.keys(manifest.dependencies ?? {}).sort(), [
    "@cylayo/weaver-core",
    "@cylayo/weaver-web",
  ]);
  assert.deepEqual(Object.keys(manifest.devDependencies ?? {}).sort(), [
    "happy-dom",
    "vite",
  ]);
});

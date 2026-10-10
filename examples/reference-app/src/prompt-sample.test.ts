import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
  A2UI_V091_BASIC_CATALOG_ID,
  createA2UIV091StreamIngestion,
  type A2UIV091StreamIngestionEvent,
} from "@cylayo/weaver-core";
import { createBasicWebRuntime } from "@cylayo/weaver-web";
import { Window } from "happy-dom";
import { REFERENCE_CREATE_REQUEST, REFERENCE_SURFACE_ID } from "./application-agent.js";
import { buildReferencePrompt } from "./prompt-sample.js";

// Compiled tests run from dist/, so the source JSONL sits one level up in src/.
const CANNED_RESPONSE = readFileSync(
  new URL("../src/canned-model-response.jsonl", import.meta.url),
  "utf8",
);

function target(): Element {
  const window = new Window();
  return window.document.createElement("main") as unknown as Element;
}

/** Action names listed in the prompt's Actions section, in order. */
function listedActionNames(prompt: string): string[] {
  const section = prompt.slice(prompt.indexOf("## Actions"));
  return [...section.matchAll(/^- `([^`]+)`:/gm)].map((match) => match[1]!);
}

test("the prompt lists reference.createRequest as the only action", () => {
  const prompt = buildReferencePrompt();
  assert.deepEqual(listedActionNames(prompt), [REFERENCE_CREATE_REQUEST]);
  assert.match(prompt, /Context: \{"priority":\{"path":"\/draft\/priority"\},"title":\{"path":"\/draft\/title"\}\}\./);

  const eventNames = [...prompt.matchAll(/"name":"([^"]*)"/g)].map((match) => match[1]);
  assert.ok(eventNames.length > 0, "the validated example carries an event");
  assert.deepEqual([...new Set(eventNames)], [REFERENCE_CREATE_REQUEST]);
  assert.match(prompt, /Only these action names may appear in an event/);
});

test("the prompt is deterministic and keeps the Basic catalog id", () => {
  const first = buildReferencePrompt();
  assert.equal(buildReferencePrompt(), first);
  assert.ok(first.includes(A2UI_V091_BASIC_CATALOG_ID));
});

test("the canned model response is valid A2UI and renders in happy-dom", () => {
  const web = createBasicWebRuntime();
  assert.equal(web.ok, true);
  if (!web.ok) return;
  const ingestion = createA2UIV091StreamIngestion({ runtime: web.value.runtime });

  const events: A2UIV091StreamIngestionEvent[] = [
    ...ingestion.push(CANNED_RESPONSE),
    ...ingestion.finish(),
  ];
  assert.equal(events.length, 3);
  for (const event of events) {
    assert.equal(event.ok, true, `frame ${event.frame} must be accepted`);
  }

  const dom = target();
  const mounted = web.value.mount({ surfaceId: REFERENCE_SURFACE_ID, target: dom });
  assert.equal(mounted.ok, true);
  const resolved = web.value.runtime.resolveSurface(REFERENCE_SURFACE_ID);
  assert.equal(resolved.ok && resolved.value.tree.ready, true);
  assert.match(dom.textContent ?? "", /Model Draft Request/);
  assert.match(dom.textContent ?? "", /Create request/);
  assert.ok(dom.querySelector("button") !== null, "a button renders");
});

test("a broken model response is rejected and the prior surface stays", () => {
  const web = createBasicWebRuntime();
  assert.equal(web.ok, true);
  if (!web.ok) return;
  const ingestion = createA2UIV091StreamIngestion({ runtime: web.value.runtime });
  ingestion.push(CANNED_RESPONSE);

  const dom = target();
  web.value.mount({ surfaceId: REFERENCE_SURFACE_ID, target: dom });
  const before = web.value.runtime.getSurface(REFERENCE_SURFACE_ID);
  assert.ok(before);
  const beforeModel = structuredClone(before.dataModel);
  const textBefore = dom.textContent;
  assert.match(textBefore ?? "", /Model Draft Request/);

  // Frame 0 names a component the catalog does not declare, and would replace the
  // root. Frame 1 is truncated JSON. Neither may change the surface.
  const broken = [
    '{"version":"v0.9.1","updateComponents":{"surfaceId":"reference-request","components":[{"id":"root","component":"Hologram","text":"Broken"}]}}',
    '{"version":"v0.9.1","updateDataModel":{"surfaceId":"reference-request","value":{"draft":{"title":"x"}',
  ];
  const events = broken.flatMap((frame) => ingestion.push(`${frame}\n`));
  assert.equal(events.length, 2);
  assert.equal(events[0]!.ok, false);
  assert.equal(events[0]!.ok === false && events[0]!.error.code, "CATALOG_REGISTRY_ERROR");
  assert.equal(events[1]!.ok, false);
  assert.equal(events[1]!.ok === false && events[1]!.error.code, "INVALID_JSON");
  assert.deepEqual(ingestion.finish(), []);

  const resolved = web.value.runtime.resolveSurface(REFERENCE_SURFACE_ID);
  assert.equal(resolved.ok && resolved.value.tree.ready, true);
  assert.deepEqual(web.value.runtime.getSurface(REFERENCE_SURFACE_ID)?.dataModel, beforeModel);
  assert.equal(dom.textContent, textBefore);
  assert.doesNotMatch(dom.textContent ?? "", /Broken/);
});

test("the example declares no network, provider SDK, or LLM dependency", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const allowed = new Set(["@cylayo/weaver-core", "@cylayo/weaver-web", "happy-dom", "vite"]);
  const declared = [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ];
  assert.deepEqual(declared.filter((name) => !allowed.has(name)), []);
  assert.doesNotMatch(
    declared.join(" "),
    /openai|anthropic|llm|langchain|gemini|mistral|cohere|ollama/i,
  );

  const sourceDir = new URL("../src/", import.meta.url);
  const sources = readdirSync(sourceDir)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));
  assert.ok(sources.includes("prompt-sample.ts"));
  for (const name of sources) {
    const source = readFileSync(new URL(name, sourceDir), "utf8");
    assert.doesNotMatch(
      source,
      /\bfetch\(|XMLHttpRequest|WebSocket|node:http|node:https|EventSource/,
      `${name} must not reach the network`,
    );
  }
});

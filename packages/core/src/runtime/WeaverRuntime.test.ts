import assert from "node:assert/strict";
import { test } from "node:test";
import type { JsonObject, JsonValue } from "../protocol/index.js";
import { createWeaverRuntime } from "./WeaverRuntime.js";
import type { WeaverRuntimeEvent, WeaverRuntimeObserver } from "./types.js";

const ref = (name: string): JsonObject => ({ $ref: `common_types.json#/$defs/${name}` });
const dynamic = (literal: JsonObject): JsonObject => ({ oneOf: [literal, ref("PathBinding"), ref("FunctionCall")] });
const component = (name: string, properties: JsonObject = {}, allOf: JsonObject[] = []): JsonObject => ({
  type: "object", ...(allOf.length === 0 ? {} : { allOf }),
  properties: { id: { type: "string" }, component: { const: name }, ...properties },
  required: ["id", "component"], additionalProperties: false,
});
const fn = (name: string, returnType: string, args: JsonObject = {}): JsonObject => ({
  type: "object", properties: {
    call: { const: name },
    args: { type: "object", properties: args, required: Object.keys(args), additionalProperties: false },
    returnType: { const: returnType },
  }, required: ["call", "args"], additionalProperties: false,
});
function catalog(catalogId: string): JsonObject {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema", catalogId,
    components: {
      Text: component("Text", { text: ref("DynamicString") }),
      TextField: component("TextField", { value: ref("DynamicString"), checks: { type: "array" } }, [ref("Checkable")]),
      Button: component("Button", { action: ref("Action") }),
      Column: component("Column", { children: ref("ChildList") }),
    },
    functions: {
      format: fn("format", "string", { value: ref("DynamicString") }),
      capture: fn("capture", "any", { value: ref("DynamicString") }),
    },
    $defs: { theme: { type: "object" }, commonTypes: { $id: "common_types.json", $defs: {
      ComponentId: { type: "string" },
      ChildList: { oneOf: [
        { type: "array", items: ref("ComponentId") },
        { type: "object", properties: { path: { type: "string" }, componentId: ref("ComponentId") }, required: ["path", "componentId"], additionalProperties: false },
      ] },
      PathBinding: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
      FunctionCall: { type: "object", properties: { call: { type: "string" }, args: { type: "object" } }, required: ["call", "args"], additionalProperties: false },
      DynamicString: dynamic({ type: "string" }), DynamicNumber: dynamic({ type: "number" }),
      DynamicBoolean: dynamic({ type: "boolean" }), DynamicStringList: dynamic({ type: "array", items: { type: "string" } }),
      Checkable: {},
      Action: { oneOf: [
        { type: "object", properties: { functionCall: { type: "object" } }, required: ["functionCall"], additionalProperties: false },
        { type: "object", properties: { event: { type: "object" } }, required: ["event"], additionalProperties: false },
      ] },
    } } },
  };
}
const create = (surfaceId = "s", catalogId = "test", sendDataModel = false) => ({ version: "v0.9.1", createSurface: { surfaceId, catalogId, sendDataModel } });
const components = (values: JsonObject[], surfaceId = "s") => ({ version: "v0.9.1", updateComponents: { surfaceId, components: values } });
const data = (value: unknown, surfaceId = "s") => ({ version: "v0.9.1", updateDataModel: { surfaceId, value } });
function runtime(options: { capture?: (value: unknown) => unknown; now?: () => Date; observer?: WeaverRuntimeObserver } = {}) {
  return createWeaverRuntime({
    catalogs: [{ catalogId: "test", schema: catalog("test") }],
    functions: [
      { catalogId: "test", name: "format", effect: "pure", implementation: ({ value }) => `Hello ${value}` },
      { catalogId: "test", name: "capture", effect: "pure", implementation: ({ value }) => options.capture?.(value) ?? value },
    ],
    now: options.now,
    observer: options.observer,
  });
}

function readyRuntime(options: { observer?: WeaverRuntimeObserver; now?: () => Date } = {}) {
  const made = runtime(options); assert.equal(made.ok, true, !made.ok ? JSON.stringify(made.error) : undefined); if (!made.ok) throw new Error();
  made.value.process(create());
  made.value.process(components([
    { id: "root", component: "Column", children: ["name", "title", "submit"] },
    { id: "name", component: "TextField", value: { path: "/name" }, checks: [{ condition: { path: "/valid" }, message: "Required" }] },
    { id: "title", component: "Text", text: { call: "format", args: { value: { path: "/name" } } } },
    { id: "submit", component: "Button", action: { event: { name: "submit", context: { name: { path: "/name" } } } } },
  ]));
  made.value.process(data({ name: "Ada", valid: true }));
  return made.value;
}

test("initializes atomically and rejects invalid catalog or function configuration", () => {
  const valid = runtime();
  assert.equal(valid.ok, true, !valid.ok ? JSON.stringify(valid.error) : undefined);
  const invalid = createWeaverRuntime({ catalogs: [{ catalogId: "bad", schema: {} }] });
  assert.equal(!invalid.ok && invalid.error.code, "CATALOG_CONFIGURATION_FAILED");
  const unknownFunction = createWeaverRuntime({ catalogs: [{ catalogId: "test", schema: catalog("test") }], functions: [{ catalogId: "test", name: "missing", effect: "pure", implementation: () => null }] });
  assert.equal(!unknownFunction.ok && unknownFunction.error.code, "FUNCTION_CONFIGURATION_FAILED");
  assert.equal(createWeaverRuntime({ catalogs: [] }).ok, true);
});

test("processes messages and derives hydrated relationships, functions, and checks", () => {
  const rt = readyRuntime();
  const result = rt.resolveSurface("s");
  assert.equal(result.ok && result.value.tree.ready, true);
  if (!result.ok || result.value.tree.root === undefined) return;
  assert.equal(result.value.tree.root.relationships[0]?.kind, "list");
  const relationship = result.value.tree.root.relationships[0];
  assert.equal(relationship?.kind === "list" && relationship.children[1]?.properties.text, "Hello Ada");
  assert.equal(result.value.checks.components.find((entry) => entry.sourceComponentId === "name")?.status, "valid");
});

test("preserves progressive missing-root state", () => {
  const made = runtime(); assert.ok(made.ok); const rt = made.value;
  rt.process(create()); rt.process(components([{ id: "later", component: "Text", text: "later" }]));
  const progressive = rt.resolveSurface("s");
  assert.equal(progressive.ok && progressive.value.tree.ready, false);
  rt.process(components([{ id: "root", component: "Column", children: ["later"] }]));
  const ready = rt.resolveSurface("s");
  assert.equal(ready.ok && ready.value.tree.ready, true);
});

test("processMany preserves order, mutation units, and later processing", () => {
  const made = runtime(); assert.ok(made.ok); const rt = made.value;
  const results = rt.processMany([create(), { version: "v0.9.1", updateComponents: { surfaceId: "s", components: [] } }, data({ name: "later" })]);
  assert.deepEqual(results.map((entry) => entry.ok), [true, false, true]);
  assert.deepEqual(rt.getSurface("s")?.dataModel, { name: "later" });
});

test("expands positional templates and rejects stale write and action identities", () => {
  const made = runtime(); assert.ok(made.ok); const rt = made.value;
  rt.process(create());
  rt.process(components([
    { id: "root", component: "Column", children: { path: "/items", componentId: "item" } },
    { id: "item", component: "TextField", value: { path: "name" } },
  ]));
  rt.process(data({ items: [{ name: "a" }, { name: "b" }, { name: "c" }] }));
  const resolved = rt.resolveSurface("s");
  assert.ok(resolved.ok && resolved.value.tree.root);
  const relation = resolved.value.tree.root.relationships[0];
  assert.deepEqual(relation?.kind === "template" ? relation.children.map((child) => child.scopePath) : [], ["/items/0", "/items/1", "/items/2"]);
  rt.process(data({ items: [{ name: "a" }] }));
  assert.equal(rt.writeInput({ surfaceId: "s", sourceComponentId: "item", scopePath: "/items/2", property: "value", value: "x" }).ok, false);
  const action = rt.dispatchAction({ surfaceId: "s", sourceComponentId: "item", scopePath: "/items/2", actionProperty: "action" });
  assert.equal(!action.ok && action.error.code, "INSTANCE_NOT_FOUND");
});

test("writes current input and dispatches an event with latest data and sync metadata", () => {
  const rt = readyRuntime();
  assert.equal(rt.writeInput({ surfaceId: "s", sourceComponentId: "name", scopePath: "/", property: "value", value: "Grace" }).ok, true);
  const resolved = rt.resolveSurface("s");
  assert.ok(resolved.ok && resolved.value.tree.root);
  const relation = resolved.value.tree.root.relationships[0];
  assert.equal(relation?.kind === "list" && relation.children[0]?.properties.value, "Grace");
  const action = rt.dispatchAction({ surfaceId: "s", sourceComponentId: "submit", scopePath: "/", actionProperty: "action" });
  assert.equal(action.ok && action.value.kind === "serverEvent" && action.value.message.action.context.name, "Grace");

  const synced = runtime({ now: () => new Date("2025-01-02T00:00:00Z") }); assert.ok(synced.ok);
  synced.value.process(create("sync", "test", true));
  synced.value.process(components([{ id: "root", component: "Button", action: { event: { name: "go", context: {} } } }], "sync"));
  synced.value.process(data({ updated: true }, "sync"));
  const event = synced.value.dispatchAction({ surfaceId: "sync", sourceComponentId: "root", scopePath: "/", actionProperty: "action" });
  assert.deepEqual(event.ok && event.value.kind === "serverEvent" ? event.value.metadata?.a2uiClientDataModel.surfaces.sync : undefined, { updated: true });
});

test("subscriptions derive future mutations, report deletion, isolate throws, and skip failures", () => {
  const made = runtime(); assert.ok(made.ok); const rt = made.value; rt.process(create());
  const received: string[] = [];
  rt.subscribeSurface("s", () => { throw new Error("isolated"); });
  rt.subscribeSurface("s", (result) => received.push(result.ok ? "resolved" : result.error.code));
  rt.process(components([{ id: "root", component: "TextField", value: { path: "/name" } }]));
  rt.process(data({ name: "Ada" }));
  rt.writeInput({ surfaceId: "s", sourceComponentId: "root", scopePath: "/", property: "value", value: "Grace" });
  rt.writeInput({ surfaceId: "s", sourceComponentId: "root", scopePath: "/", property: "value", value: 2 });
  rt.process({ version: "bad" });
  rt.process({ version: "v0.9.1", deleteSurface: { surfaceId: "s" } });
  assert.deepEqual(received, ["resolved", "resolved", "resolved", "SURFACE_NOT_FOUND"]);
});

test("capabilities are ordered and defensive, resolved state is defensive, and runtimes are isolated", () => {
  const made = createWeaverRuntime({ catalogs: [{ catalogId: "catalog-a", schema: catalog("catalog-a") }, { catalogId: "catalog-b", schema: catalog("catalog-b") }] });
  assert.ok(made.ok);
  const capabilities = made.value.getClientCapabilities();
  assert.deepEqual(capabilities, { "v0.9": { supportedCatalogIds: ["catalog-a", "catalog-b"] } });
  assert.equal("inlineCatalogs" in capabilities["v0.9"], false);
  capabilities["v0.9"].supportedCatalogIds.push("bad");
  assert.deepEqual(made.value.getClientCapabilities()["v0.9"].supportedCatalogIds, ["catalog-a", "catalog-b"]);

  const a = runtime(); const b = runtime(); assert.ok(a.ok && b.ok);
  a.value.process(create("only-a"));
  assert.equal(b.value.getSurface("only-a"), undefined);
  const rt = readyRuntime(); const resolved = rt.resolveSurface("s"); assert.ok(resolved.ok);
  resolved.value.tree.root!.properties.mutated = true;
  const again = rt.resolveSurface("s");
  assert.equal(again.ok && again.value.tree.root?.properties.mutated, undefined);

  rt.process({ version: "v0.9.1", createSurface: { surfaceId: "themed", catalogId: "test", theme: { primaryColor: "#112233" } } });
  const themed = rt.resolveSurface("themed"); assert.ok(themed.ok && themed.value.theme);
  themed.value.theme.primaryColor = "#ffffff";
  const themedAgain = rt.resolveSurface("themed");
  assert.equal(themedAgain.ok && themedAgain.value.theme?.primaryColor, "#112233");
});

test("observer receives message, input, and action events in order for success and failure", () => {
  const events: WeaverRuntimeEvent[] = [];
  const rt = readyRuntime({ observer: (event) => events.push(event) });
  events.length = 0;
  rt.writeInput({ surfaceId: "s", sourceComponentId: "name", scopePath: "/", property: "value", value: "Grace" });
  rt.writeInput({ surfaceId: "s", sourceComponentId: "missing", scopePath: "/", property: "value", value: "x" });
  rt.dispatchAction({ surfaceId: "s", sourceComponentId: "submit", scopePath: "/", actionProperty: "action" });
  rt.dispatchAction({ surfaceId: "s", sourceComponentId: "missing", scopePath: "/", actionProperty: "action" });
  rt.process(data({ name: "Linus" }));
  rt.process({ version: "bad" });
  assert.deepEqual(events.map((event) => event.kind), ["input", "input", "action", "action", "message", "message"]);

  const [inputOk, inputFailed, actionOk, actionFailed, messageOk, messageFailed] = events;
  assert.ok(inputOk?.kind === "input" && inputOk.result.ok === true);
  assert.deepEqual(inputOk.request, { surfaceId: "s", sourceComponentId: "name", scopePath: "/", property: "value", value: "Grace" });
  assert.ok(inputFailed?.kind === "input" && inputFailed.result.ok === false);
  assert.ok(inputFailed.result.ok === false && inputFailed.result.error.code === "INSTANCE_NOT_FOUND");
  assert.ok(actionOk?.kind === "action" && actionOk.result.ok === true);
  assert.deepEqual(actionOk.request, { surfaceId: "s", sourceComponentId: "submit", scopePath: "/", actionProperty: "action" });
  assert.ok(actionFailed?.kind === "action" && actionFailed.result.ok === false);
  assert.ok(actionFailed.result.ok === false && actionFailed.result.error.code === "INSTANCE_NOT_FOUND");
  assert.ok(messageOk?.kind === "message" && messageOk.result.ok === true);
  assert.deepEqual(messageOk.input, data({ name: "Linus" }));
  assert.ok(messageFailed?.kind === "message" && messageFailed.result.ok === false);
  assert.deepEqual(messageFailed.input, { version: "bad" });
});

test("processMany fires one message event per item, in input order", () => {
  const events: WeaverRuntimeEvent[] = [];
  const made = runtime({ observer: (event) => events.push(event) });
  assert.ok(made.ok);
  const inputs = [create(), { version: "bad" }, data({ name: "later" })];
  const results = made.value.processMany(inputs);
  assert.deepEqual(results.map((entry) => entry.ok), [true, false, true]);
  assert.equal(events.length, inputs.length);
  events.forEach((event, index) => {
    assert.ok(event.kind === "message");
    assert.deepEqual(event.input, inputs[index]);
    assert.equal(event.result.ok, results[index]?.ok);
  });
});

test("observer payloads are defensive copies that cannot change runtime state", () => {
  const observer: WeaverRuntimeObserver = (event) => {
    if (event.kind === "message") {
      if (event.result.ok && "surface" in event.result.value)
        (event.result.value.surface.dataModel as JsonObject).name = "hacked";
      (event.input as JsonObject).version = "hacked";
    }
    if (event.kind === "input") {
      event.request.value = "hacked";
      if (event.result.ok) event.result.value.value = "hacked";
    }
    if (event.kind === "action") event.request.actionProperty = "hacked";
  };
  const rt = readyRuntime({ observer });
  assert.deepEqual(rt.getSurface("s")?.dataModel, { name: "Ada", valid: true });
  assert.equal(rt.writeInput({ surfaceId: "s", sourceComponentId: "name", scopePath: "/", property: "value", value: "Grace" }).ok, true);
  assert.deepEqual(rt.getSurface("s")?.dataModel, { name: "Grace", valid: true });
  const action = rt.dispatchAction({ surfaceId: "s", sourceComponentId: "submit", scopePath: "/", actionProperty: "action" });
  assert.equal(action.ok && action.value.kind === "serverEvent" && action.value.message.action.context.name, "Grace");
});

test("a throwing observer leaves every result identical to a run without an observer", () => {
  const now = () => new Date("2025-01-02T00:00:00Z");
  let delivered = 0;
  const throwing: WeaverRuntimeObserver = () => {
    delivered += 1;
    throw new Error("observer failure");
  };
  const script = (rt: ReturnType<typeof readyRuntime>) => [
    rt.writeInput({ surfaceId: "s", sourceComponentId: "name", scopePath: "/", property: "value", value: "Grace" }),
    rt.writeInput({ surfaceId: "s", sourceComponentId: "missing", scopePath: "/", property: "value", value: "x" }),
    rt.dispatchAction({ surfaceId: "s", sourceComponentId: "submit", scopePath: "/", actionProperty: "action" }),
    rt.dispatchAction({ surfaceId: "s", sourceComponentId: "missing", scopePath: "/", actionProperty: "action" }),
    rt.processMany([data({ name: "Linus" }), { version: "bad" }]),
    rt.resolveSurface("s"),
    rt.getSurface("s"),
  ];
  const observed = readyRuntime({ observer: throwing, now });
  const unobserved = readyRuntime({ now });
  assert.deepEqual(script(observed), script(unobserved));
  // Three setup messages, two inputs, two actions, and two processMany messages.
  assert.equal(delivered, 9);
});

test("rejected inputs that are not JSON-safe reach the observer as a marker; rejected JSON-safe values are copied", () => {
  const events: WeaverRuntimeEvent[] = [];
  const rt = readyRuntime({ observer: (event) => events.push(event) });
  events.length = 0;
  rt.process({ version: "bad", payload: undefined });
  const safe = { version: "bad", payload: { items: [1, "two", null] } };
  rt.process(safe);
  rt.writeInput({ surfaceId: "s", sourceComponentId: "name", scopePath: "/", property: "value", value: undefined as unknown as JsonValue });
  const [unsafeMessage, safeMessage, input] = events;
  assert.ok(unsafeMessage?.kind === "message" && unsafeMessage.result.ok === false);
  assert.deepEqual(unsafeMessage.input, { unserializable: true });
  assert.ok(safeMessage?.kind === "message" && safeMessage.result.ok === false);
  assert.deepEqual(safeMessage.input, safe);
  assert.notEqual(safeMessage.input, safe);
  assert.ok(input?.kind === "input" && input.result.ok === false);
  assert.deepEqual(input.request.value, { unserializable: true });
});

test("a rejected cyclic input is delivered as a marker without the observer walking the cycle", () => {
  const events: WeaverRuntimeEvent[] = [];
  const made = runtime({ observer: (event) => events.push(event) });
  assert.ok(made.ok);
  const cyclic: Record<string, unknown> = { version: "bad" };
  cyclic.self = cyclic;
  assert.equal(made.value.process(cyclic).ok, false);
  assert.equal(events.length, 1);
  assert.ok(events[0]?.kind === "message");
  assert.deepEqual(events[0].input, { unserializable: true });
});

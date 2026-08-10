import assert from "node:assert/strict";
import { test } from "node:test";
import type { WeaverActionResult } from "../../runtime/index.js";
import { createWeaverRuntime } from "../../runtime/index.js";
import { createA2UITransportSession } from "./createA2UITransportSession.js";

const schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  catalogId: "test",
  components: {
    Text: {
      type: "object",
      properties: { id: { type: "string" }, component: { const: "Text" }, text: { type: "string" } },
      required: ["id", "component", "text"],
      additionalProperties: false,
    },
  },
  $defs: { theme: { type: "object", additionalProperties: false } },
};
const create = (surfaceId: string) => ({ version: "v0.9.1", createSurface: { surfaceId, catalogId: "test" } });
const update = (surfaceId: string, text: string) => ({ version: "v0.9.1", updateComponents: { surfaceId, components: [{ id: "root", component: "Text", text }] } });
const data = (surfaceId: string, value: unknown) => ({ version: "v0.9.1", updateDataModel: { surfaceId, value } });
const remove = (surfaceId: string) => ({ version: "v0.9.1", deleteSurface: { surfaceId } });
function setup() {
  const made = createWeaverRuntime({ catalogs: [{ catalogId: "test", schema }] });
  assert.ok(made.ok);
  return { runtime: made.value, session: createA2UITransportSession({ runtime: made.value }) };
}

function action(surfaceId: string, withData = false): WeaverActionResult {
  return { ok: true, value: {
    kind: "serverEvent",
    message: { version: "v0.9.1", action: { name: "go", surfaceId, sourceComponentId: "root", timestamp: "2026-01-01T00:00:00.000Z", context: {} } },
    ...(withData ? { metadata: { a2uiClientDataModel: { version: "v0.9.1", surfaces: { [surfaceId]: { secret: true } } } } } : {}),
  } };
}

test("binds only successful creates and preserves same-owner lifecycle handling", () => {
  const { runtime, session } = setup();
  assert.equal(session.processInbound("A", create("X")).ok, true);
  assert.equal(session.getSurfaceRoute("X"), "A");
  assert.equal(session.processInbound("A", update("X", "one")).ok, true);
  const duplicate = session.processInbound("A", create("X"));
  assert.equal(!duplicate.ok && duplicate.error.code, "SURFACE_STORE_ERROR");
  assert.equal(session.getSurfaceRoute("X"), "A");

  const invalid = session.processInbound("A", { version: "v0.9.1", createSurface: { surfaceId: "Y", catalogId: "missing" } });
  assert.equal(invalid.ok, false);
  assert.equal(session.getSurfaceRoute("Y"), undefined);
  assert.equal(runtime.getSurface("Y"), undefined);
});

test("rejects every cross-route mutation before runtime state changes", () => {
  const { runtime, session } = setup();
  session.processInbound("A", create("X"));
  session.processInbound("A", update("X", "before"));
  session.processInbound("A", data("X", { count: 1 }));

  for (const input of [update("X", "after"), data("X", { count: 2 }), remove("X"), create("X")]) {
    const result = session.processInbound("B", input);
    assert.deepEqual(result, { ok: false, error: { code: "SURFACE_ROUTE_MISMATCH", surfaceId: "X" } });
  }
  assert.equal(runtime.getSurface("X")?.components.root?.text, "before");
  assert.deepEqual(runtime.getSurface("X")?.dataModel, { count: 1 });
  assert.equal(session.getSurfaceRoute("X"), "A");
});

test("unbinds successful deletes and permits another route to recreate", () => {
  const { session } = setup();
  session.processInbound("A", create("X"));
  assert.equal(session.processInbound("A", remove("X")).ok, true);
  assert.equal(session.getSurfaceRoute("X"), undefined);
  assert.equal(session.processInbound("B", create("X")).ok, true);
  assert.equal(session.getSurfaceRoute("X"), "B");
});

test("does not infer ownership from updates or preexisting runtime surfaces", () => {
  const { runtime, session } = setup();
  const missing = session.processInbound("A", update("missing", "x"));
  assert.equal(!missing.ok && missing.error.code, "SURFACE_STORE_ERROR");
  assert.equal(session.getSurfaceRoute("missing"), undefined);

  runtime.process(create("outside"));
  const unknown = session.processInbound("A", update("outside", "x"));
  assert.deepEqual(unknown, { ok: false, error: { code: "SURFACE_ROUTE_UNKNOWN", surfaceId: "outside" } });
});

test("routes actions and client data only to the surface owner with defensive output", () => {
  const { session } = setup();
  session.processInbound("A", create("X"));
  session.processInbound("B", create("Y"));
  const result = session.prepareActionDelivery(action("X", true));
  assert.ok(result.ok);
  assert.equal(result.value.routeId, "A");
  assert.deepEqual(result.value.clientDataModel?.surfaces.X, { secret: true });
  result.value.message.action.context.changed = true;
  assert.deepEqual(session.prepareActionDelivery(action("unknown")), { ok: false, error: { code: "SURFACE_ROUTE_UNKNOWN", surfaceId: "unknown" } });
  const without = session.prepareActionDelivery(action("X"));
  assert.ok(without.ok);
  assert.equal("clientDataModel" in without.value, false);
});

test("routes validation responses to their inbound source and never maps route mismatch", () => {
  const { runtime, session } = setup();
  session.processInbound("B", create("X"));
  const malformed = { version: "v0.9.1", updateComponents: { surfaceId: "X", components: [] } };
  const failure = session.processInbound("A", malformed);
  assert.equal(!failure.ok && failure.error.code, "PROTOCOL_VALIDATION_FAILED");
  const delivery = session.prepareValidationErrorDelivery("A", malformed, failure as ReturnType<typeof runtime.process>);
  assert.ok(delivery.ok);
  assert.equal(delivery.value.routeId, "A");
  assert.equal(delivery.value.message.error.code, "VALIDATION_FAILED");

  const mismatch = session.processInbound("A", update("X", "bad"));
  assert.equal(!mismatch.ok && mismatch.error.code, "SURFACE_ROUTE_MISMATCH");
});

test("validates opaque route IDs, ignores identity-like message fields, and isolates sessions", () => {
  const one = setup(); const two = setup();
  assert.equal(one.session.processInbound("", create("X")).ok, false);
  const injected = { ...create("agent-b"), routeId: "B", ownerId: "B", recipient: "B" };
  assert.equal(one.session.processInbound("A", injected).ok, false);
  assert.equal(one.session.getSurfaceRoute("agent-b"), undefined);
  one.session.processInbound("A", create("X"));
  assert.equal(two.session.getSurfaceRoute("X"), undefined);
  const capabilities = one.session.getClientCapabilities();
  capabilities["v0.9"].supportedCatalogIds.push("mutated");
  assert.deepEqual(one.session.getClientCapabilities()["v0.9"].supportedCatalogIds, ["test"]);
});

/**
 * The three scenarios on the real Weaver runtime, in node, without a DOM. The flows press buttons
 * and write inputs through the runtime's public calls, so each step takes the same path a click or
 * a drag takes in the browser, down to the app's transitions and the agent's replies.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createA2UIV091StreamIngestion, type JsonObject, type JsonValue } from "@cylayo/weaver-core";
import { createBasicWebRuntime } from "@cylayo/weaver-web";
import { dinnerComponents, dinnerData, type DinnerState } from "./agent/dinner.js";
import { hotelComponents } from "./agent/hotel.js";
import { tripComponents } from "./agent/trip.js";
import { dinnerDefinition } from "./app/dinner.js";
import { hotelDefinition } from "./app/hotel.js";
import { tripDefinition } from "./app/trip.js";
import { type ScenarioDefinition } from "./app/types.js";
import { createScenarioSession, type ScenarioSession } from "./session.js";
import { formatEur, tripSummary } from "./model.js";

const PAGE = { pageUrl: "https://cyruslayo.github.io/weaver/", baseUrl: "/weaver/" };

/** The Basic catalog components, the only ones the demo's agent may use. */
const BASIC_COMPONENTS = new Set([
  "Text", "Image", "Icon", "Row", "Column", "List", "Card", "Tabs", "Modal", "Divider",
  "Button", "TextField", "CheckBox", "ChoicePicker", "Slider", "DateTimeInput",
]);

function start<S, V extends string>(definition: ScenarioDefinition<S, V>): ScenarioSession {
  return createScenarioSession(definition, PAGE, () => undefined);
}

/** Reads a JSON pointer such as "/stays/0/name" from a value. */
function at(root: JsonValue | null, path: string): JsonValue | undefined {
  let node: JsonValue | undefined = root ?? undefined;
  for (const segment of path.split("/").filter((part) => part !== "")) {
    if (Array.isArray(node)) node = node[Number(segment)];
    else if (node !== null && node !== undefined && typeof node === "object") node = (node as JsonObject)[segment];
    else return undefined;
  }
  return node;
}

function write(session: ScenarioSession, sourceComponentId: string, scopePath: string, value: JsonValue): void {
  const result = session.runtime.writeInput({
    surfaceId: session.surfaceId,
    sourceComponentId,
    scopePath,
    property: "value",
    value,
  });
  assert.equal(result.ok, true, `write to ${sourceComponentId} failed: ${JSON.stringify(result)}`);
}

function press(session: ScenarioSession, sourceComponentId: string, scopePath = "/"): void {
  assert.equal(session.press(sourceComponentId, scopePath), true, `press ${sourceComponentId} at ${scopePath} did not dispatch`);
}

function serverEvent(surfaceId: string, name: string, context: JsonObject = {}) {
  return {
    message: {
      version: "v0.9.1" as const,
      action: {
        name,
        surfaceId,
        sourceComponentId: "test",
        timestamp: "2026-10-13T00:00:00.000Z",
        context,
      },
    },
  };
}

function lastEvent(session: ScenarioSession) {
  const event = session.events[0];
  assert.ok(event !== undefined, "expected an event");
  return event;
}

// ---- Initial replies ------------------------------------------------------------------------

const SCENARIO_STARTS: ReadonlyArray<readonly [string, () => ScenarioSession]> = [
  ["hotel", () => start(hotelDefinition)],
  ["dinner", () => start(dinnerDefinition)],
  ["trip", () => start(tripDefinition)],
];

for (const [label, begin] of SCENARIO_STARTS) {
  test(`the ${label} first reply processes with zero rejected frames, as JSONL`, () => {
    const session = begin();
    assert.equal(session.rejectedFrames, 0);
    assert.equal(session.reply.count, 3);
    assert.deepEqual(session.reply.operations, ["createSurface", "updateDataModel", "updateComponents"]);

    // The same lines, fed through a fresh runtime and a fresh ingestion, are valid A2UI too.
    const fresh = createBasicWebRuntime();
    assert.equal(fresh.ok, true);
    if (!fresh.ok) return;
    const ingestion = createA2UIV091StreamIngestion({ runtime: fresh.value.runtime });
    const jsonl = session.sentLines.slice(0, session.reply.count).map((line) => line + "\n").join("");
    const events = [...ingestion.push(jsonl), ...ingestion.finish()];
    assert.equal(events.length, 3);
    assert.ok(events.every((event) => event.ok), JSON.stringify(events));
  });
}

test("every view uses only Basic catalog components", () => {
  const views: ReadonlyArray<readonly [string, ReadonlyArray<{ component: string }>]> = [
    ["hotel list", hotelComponents("list")],
    ["hotel detail", hotelComponents("detail")],
    ["hotel done", hotelComponents("done")],
    ["dinner menu", dinnerComponents("menu")],
    ["dinner done", dinnerComponents("done")],
    ["trip plan", tripComponents("plan")],
    ["trip done", tripComponents("done")],
  ];
  for (const [label, components] of views) {
    for (const component of components) {
      assert.ok(BASIC_COMPONENTS.has(component.component), `${label} uses ${component.component}`);
    }
  }
});

// ---- Hotel ----------------------------------------------------------------------------------

test("hotel: open a stay, change nights, guests and room, then reserve", () => {
  const session = start(hotelDefinition);
  assert.equal(session.view, "list");
  press(session, "stay-open", "/stays/0");
  assert.equal(session.view, "detail");
  assert.equal(at(session.dataModel(), "/selected/name"), "Miradouro Pool House");

  press(session, "nights-plus", "/");
  assert.equal(at(session.dataModel(), "/booking/nights"), 4);
  assert.equal(at(session.dataModel(), "/booking/nightsText"), "4");
  assert.equal(at(session.dataModel(), "/totals/totalAmount"), "€1040");

  write(session, "room", "/", ["river"]);
  assert.equal(at(session.dataModel(), "/totals/extraLabel"), "River view × 4");
  assert.equal(at(session.dataModel(), "/totals/extraAmount"), "€180");
  assert.equal(at(session.dataModel(), "/totals/reserveLabel"), "Reserve for €1220");

  press(session, "guests-plus", "/");
  assert.equal(at(session.dataModel(), "/booking/guestsText"), "3");

  press(session, "reserve");
  assert.equal(session.view, "done");
  assert.equal(
    at(session.dataModel(), "/done/summary"),
    "Miradouro Pool House · 4 nights · 3 guests · River view · €1220",
  );
  assert.equal(session.mainActionSent, true);
  assert.equal(lastEvent(session).kind, "Action");
  assert.match(lastEvent(session).text, /^reserve_room \{"stay":"miradouro","nights":4,"guests":3,"room":\["river"\]\}$/);

  press(session, "done-back");
  assert.equal(session.view, "list");
  assert.equal(session.rejectedFrames, 0);
});

test("hotel: filters narrow the stays, and a filter with no match shows the note", () => {
  const session = start(hotelDefinition);
  assert.equal((at(session.dataModel(), "/stays") as JsonValue[]).length, 4);

  write(session, "filters", "/", ["pool"]);
  assert.deepEqual((at(session.dataModel(), "/stays") as JsonObject[]).map((stay) => stay.id), ["miradouro"]);
  assert.equal(at(session.dataModel(), "/listNote"), "");
  assert.equal(lastEvent(session).kind, "Input");
  assert.equal(lastEvent(session).text, '/filters = ["pool"]');

  write(session, "filters", "/", ["pool", "historic"]);
  assert.equal((at(session.dataModel(), "/stays") as JsonValue[]).length, 0);
  assert.equal(at(session.dataModel(), "/listNote"), "No stays match every filter.");

  press(session, "clear");
  assert.equal((at(session.dataModel(), "/stays") as JsonValue[]).length, 4);
  assert.equal(at(session.dataModel(), "/listNote"), "");
});

test("hotel: saving a stay toggles its label without leaving the list", () => {
  const session = start(hotelDefinition);
  // Casa Amarela is the second stay and starts saved.
  assert.equal(at(session.dataModel(), "/stays/1/saveLabel"), "♥ Saved");
  press(session, "stay-save", "/stays/1");
  assert.equal(at(session.dataModel(), "/stays/1/saveLabel"), "♡ Save");
  assert.equal(session.view, "list");
});

test("hotel: the steppers clamp at their limits, and a bad room write is refused", () => {
  const session = start(hotelDefinition);
  press(session, "stay-open", "/stays/0");

  for (let step = 0; step < 20; step += 1) press(session, "nights-plus", "/");
  assert.equal(at(session.dataModel(), "/booking/nights"), 14);
  for (let step = 0; step < 20; step += 1) press(session, "nights-minus", "/");
  assert.equal(at(session.dataModel(), "/booking/nights"), 1);

  press(session, "guests-minus", "/");
  assert.equal(at(session.dataModel(), "/booking/guests"), 1);

  write(session, "room", "/", ["sea"]);
  assert.deepEqual(at(session.dataModel(), "/booking/room"), ["city"]);
  assert.equal(lastEvent(session).kind, "Rejected");

  assert.equal(session.rejectedFrames, 0, "refusals are app decisions, not frame errors");
});

test("hotel: names outside the allowlist never reach the app", () => {
  const session = start(hotelDefinition);
  const before = JSON.stringify(session.dataModel());
  for (const name of ["constructor", "__proto__", "toString", "hasOwnProperty", "reserve_room_now", ""]) {
    session.receiveServerEvent(serverEvent("stays", name));
    assert.equal(lastEvent(session).kind, "Rejected", `${JSON.stringify(name)} must be refused`);
  }
  assert.equal(session.events.some((event) => event.kind === "Action"), false);
  assert.equal(JSON.stringify(session.dataModel()), before);
  assert.equal(session.view, "list");
});

test("hotel: an allowed name with a bad context is refused and changes nothing", () => {
  const session = start(hotelDefinition);
  const before = JSON.stringify(session.dataModel());

  session.receiveServerEvent(serverEvent("stays", "open_stay", { stay: "constructor" }));
  assert.equal(session.view, "list");
  session.receiveServerEvent(serverEvent("stays", "open_stay", { stay: 3 }));
  assert.equal(session.view, "list");
  session.receiveServerEvent(serverEvent("stays", "open_stay", { stay: "miradouro", extra: true }));
  assert.equal(session.view, "list");
  session.receiveServerEvent(serverEvent("stays", "toggle_save", {}));
  assert.equal(session.view, "list");
  session.receiveServerEvent(serverEvent("stays", "change_booking", { field: "nights", delta: 1 }));
  assert.equal(session.view, "list");
  assert.equal(JSON.stringify(session.dataModel()), before);

  session.receiveServerEvent(serverEvent("stays", "open_stay", { stay: "miradouro" }));
  assert.equal(session.view, "detail");

  session.receiveServerEvent(serverEvent("stays", "change_booking", { field: "rooms", delta: 1 }));
  session.receiveServerEvent(serverEvent("stays", "change_booking", { field: "nights", delta: 2 }));
  session.receiveServerEvent(serverEvent("stays", "change_booking", { field: "nights" }));
  assert.equal(at(session.dataModel(), "/booking/nights"), 3);
  session.receiveServerEvent(serverEvent("stays", "show_photo", { index: "1" }));
  session.receiveServerEvent(serverEvent("stays", "show_photo", { index: 5 }));
  assert.equal(at(session.dataModel(), "/detail/photoLabel"), "Photo 1 of 3");
  session.receiveServerEvent(serverEvent("stays", "show_photo", { index: 2 }));
  assert.equal(at(session.dataModel(), "/detail/photoLabel"), "Photo 3 of 3");

  // A reservation must match the booking on screen, so a stale request is refused.
  session.receiveServerEvent(serverEvent("stays", "reserve_room", { stay: "miradouro", nights: 9, guests: 2, room: ["city"] }));
  assert.equal(session.view, "detail");
  session.receiveServerEvent(serverEvent("stays", "reserve_room", { stay: "tejo", nights: 3, guests: 2, room: ["city"] }));
  assert.equal(session.view, "detail");
  assert.equal(session.mainActionSent, false);
  assert.equal(session.rejectedFrames, 0);
});

test("hotel: an action from another surface is refused", () => {
  const session = start(hotelDefinition);
  session.receiveServerEvent(serverEvent("order", "clear_filters"));
  assert.equal(lastEvent(session).kind, "Rejected");
});

// ---- Dinner ---------------------------------------------------------------------------------

test("dinner: change quantities, then place the order", () => {
  const session = start(dinnerDefinition);
  // Pizza is the first dish and starts at two.
  press(session, "dish-plus", "/menu/0");
  assert.equal(at(session.dataModel(), "/menu/0/qtyLabel"), "3");
  assert.equal(at(session.dataModel(), "/basket/items"), 8);
  assert.equal(at(session.dataModel(), "/basket/total"), "€87.50");

  // Nata is the last dish and starts at two. The third press cannot go below zero.
  press(session, "dish-minus", "/menu/5");
  press(session, "dish-minus", "/menu/5");
  press(session, "dish-minus", "/menu/5");
  assert.equal(at(session.dataModel(), "/menu/5/qtyLabel"), "0");
  assert.equal(at(session.dataModel(), "/basket/items"), 6);
  assert.equal(at(session.dataModel(), "/basket/total"), "€79.50");
  assert.equal(at(session.dataModel(), "/basket/empty"), "");

  press(session, "place");
  assert.equal(session.view, "done");
  assert.equal(at(session.dataModel(), "/done/summary"), "6 items · €79.50 · arrives in about 40 minutes");
  assert.equal(session.mainActionSent, true);
  assert.match(lastEvent(session).text, /^place_order \{"items":6,"total":79.5\}$/);

  press(session, "done-again");
  assert.equal(session.view, "menu");
  assert.equal(at(session.dataModel(), "/menu/0/qtyLabel"), "3", "the quantities survive a new order");
  assert.equal(session.rejectedFrames, 0);
});

test("dinner: an order that matches the basket is accepted, and a mismatched one is refused", () => {
  const accepted = start(dinnerDefinition);
  accepted.receiveServerEvent(serverEvent("order", "place_order", { items: 7, total: 74.5 }));
  assert.equal(accepted.view, "done");

  const refused = start(dinnerDefinition);
  refused.receiveServerEvent(serverEvent("order", "place_order", { items: 6, total: 74.5 }));
  assert.equal(refused.view, "menu");
  refused.receiveServerEvent(serverEvent("order", "place_order", { items: 7, total: 1 }));
  assert.equal(refused.view, "menu");
  assert.equal(refused.mainActionSent, false);
});

test("dinner: quantity actions with unknown dishes or a bad delta are refused", () => {
  const session = start(dinnerDefinition);
  const before = JSON.stringify(session.dataModel());
  session.receiveServerEvent(serverEvent("order", "change_qty", { dish: "constructor", delta: 1 }));
  session.receiveServerEvent(serverEvent("order", "change_qty", { dish: "pizza", delta: 2 }));
  session.receiveServerEvent(serverEvent("order", "change_qty", { dish: "pizza", delta: "1" }));
  session.receiveServerEvent(serverEvent("order", "change_qty", { dish: "pizza" }));
  assert.equal(JSON.stringify(session.dataModel()), before);
  assert.equal(lastEvent(session).kind, "Rejected");
  assert.equal(session.mainActionSent, false);
});

test("dinner: the basket data matches the pure totals", () => {
  const state: DinnerState = { done: false, qty: { pizza: 1, pasta: 0, salmon: 0, salad: 0, cake: 0, nata: 0 } };
  const data = dinnerData(state);
  assert.deepEqual(data.basket, {
    lines: [{ label: "1 × Margherita, wood-fired", amount: "€13" }],
    empty: "",
    total: formatEur(16.5),
    items: 1,
    totalValue: 16.5,
    placeLabel: "Place order · €16.50",
  });
});

// ---- Trip -----------------------------------------------------------------------------------

test("trip: toggle stops, then add the trip to the calendar", () => {
  const session = start(tripDefinition);
  assert.equal(at(session.dataModel(), "/trip/summary"), "6 of 7 stops · €39 in tickets · sample prices");

  write(session, "stop-tram-28-include", "/", false);
  assert.equal(at(session.dataModel(), "/trip/included/tram-28"), false);
  assert.equal(at(session.dataModel(), "/trip/includedCount"), 5);
  assert.equal(at(session.dataModel(), "/trip/summary"), "5 of 7 stops · €36 in tickets · sample prices");
  assert.equal(lastEvent(session).kind, "Input");
  assert.equal(lastEvent(session).text, "/trip/included/tram-28 = false");

  write(session, "stop-dinner-river-include", "/", true);
  assert.equal(at(session.dataModel(), "/trip/days/2"), "2 stops · 6 h 30 min · €55");
  assert.equal(at(session.dataModel(), "/trip/includedCount"), 6);

  press(session, "save");
  assert.equal(session.view, "done");
  assert.equal(at(session.dataModel(), "/done/summary"), "6 of 7 stops · €71 in tickets");
  assert.equal(session.mainActionSent, true);
  assert.equal(lastEvent(session).text, 'add_to_calendar {"stops":6}');

  press(session, "done-edit");
  assert.equal(session.view, "plan");
  assert.equal(session.rejectedFrames, 0);
});

test("trip: a stop write that is not a boolean is refused, and a stale stop count is refused", () => {
  const session = start(tripDefinition);
  // Whether Core or the app refuses the write, the stop stays included.
  session.runtime.writeInput({
    surfaceId: "trip",
    sourceComponentId: "stop-tram-28-include",
    scopePath: "/",
    property: "value",
    value: "yes",
  });
  assert.equal(at(session.dataModel(), "/trip/included/tram-28"), true);

  session.receiveServerEvent(serverEvent("trip", "add_to_calendar", { stops: 3 }));
  assert.equal(session.view, "plan");
  assert.equal(session.mainActionSent, false);
});

test("trip: the day summaries and the total agree with the pure model", () => {
  const session = start(tripDefinition);
  const included: Record<string, boolean> = {};
  for (const stop of ["tram-28", "alfama-view", "nata-tasting", "belem-tower", "lx-factory", "pena-palace"]) included[stop] = true;
  included["dinner-river"] = false;
  assert.equal(at(session.dataModel(), "/trip/summary"), tripSummary(included) + " · sample prices");
  assert.equal(at(session.dataModel(), "/trip/days/0"), "3 stops · 3 h 15 min · €9");
  assert.equal(at(session.dataModel(), "/trip/days/1"), "2 stops · 3 h 30 min · €10");
});

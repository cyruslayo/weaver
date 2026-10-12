import assert from "node:assert/strict";
import { test } from "node:test";
import { HOTELS, SCENARIO_SPECS, STEP_BODIES, TRIP_DAYS } from "./data.js";
import {
  actionSent,
  allStops,
  basketLines,
  bookingTotals,
  daySummary,
  dayByNumber,
  EVENT_LIMIT,
  findHotel,
  foodItemCount,
  foodSubtotal,
  foodTotal,
  formatDuration,
  formatEur,
  includedStops,
  initialDemoState,
  panelSteps,
  reduceDemo,
  stopMeta,
  tripSummary,
  tripTickets,
  visibleHotels,
  type DemoState,
} from "./model.js";

const initial = (): DemoState => initialDemoState(true);

test("formatEur drops decimals for whole amounts and keeps two decimals otherwise", () => {
  assert.equal(formatEur(0), "€0");
  assert.equal(formatEur(3), "€3");
  assert.equal(formatEur(3.5), "€3.50");
  assert.equal(formatEur(74.5), "€74.50");
  assert.equal(formatEur(73), "€73");
});

test("formatDuration reads minutes the way the artboard does", () => {
  assert.equal(formatDuration(0), "0 min");
  assert.equal(formatDuration(45), "45 min");
  assert.equal(formatDuration(60), "1 h");
  assert.equal(formatDuration(90), "1 h 30 min");
  assert.equal(formatDuration(300), "5 h");
  assert.equal(formatDuration(195), "3 h 15 min");
});

test("hotel filters require every active tag and show all stays with none active", () => {
  assert.equal(visibleHotels({}).length, HOTELS.length);
  assert.deepEqual(visibleHotels({ pool: true }).map((h) => h.id), ["miradouro"]);
  assert.deepEqual(visibleHotels({ pool: true, view: true }).map((h) => h.id), ["miradouro"]);
  assert.deepEqual(visibleHotels({ historic: true }).map((h) => h.id), ["amarela", "marques"]);
  assert.deepEqual(visibleHotels({ pool: true, historic: true }), []);
  assert.deepEqual(visibleHotels({ pool: false }).map((h) => h.id).length, HOTELS.length);
});

test("toggling a filter logs its new value and clearing logs an empty set", () => {
  let state = reduceDemo(initial(), { type: "toggleFilter", filter: "pool" });
  assert.equal(state.filters.pool, true);
  assert.deepEqual(state.events[0], { kind: "Input", text: "/filters/pool = true" });
  state = reduceDemo(state, { type: "toggleFilter", filter: "pool" });
  assert.equal(state.filters.pool, false);
  assert.equal(state.events[0]?.text, "/filters/pool = false");
  state = reduceDemo(state, { type: "clearFilters" });
  assert.deepEqual(state.filters, {});
  assert.equal(state.events[0]?.text, "/filters = {}");
});

test("saved hearts start with Casa Amarela saved and toggle with a logged value", () => {
  const state = initial();
  assert.equal(state.saved.amarela, true);
  const next = reduceDemo(state, { type: "toggleSaved", hotel: "amarela" });
  assert.equal(next.saved.amarela, false);
  assert.equal(next.events[0]?.text, "/saved/amarela = false");
});

test("booking totals add the river view supplement for every night", () => {
  const hotel = findHotel("miradouro");
  assert.deepEqual(bookingTotals(hotel, "city", 3), { basePerNight: 260, baseTotal: 780, extraTotal: 0, total: 780 });
  assert.deepEqual(bookingTotals(hotel, "river", 3), { basePerNight: 260, baseTotal: 780, extraTotal: 135, total: 915 });
});

test("nights and guests clamp to their limits and log the new value", () => {
  let state = initial();
  for (let i = 0; i < 20; i += 1) state = reduceDemo(state, { type: "changeNights", delta: 1 });
  assert.equal(state.nights, 14);
  assert.equal(state.events[0]?.text, "/booking/nights = 14");
  for (let i = 0; i < 20; i += 1) state = reduceDemo(state, { type: "changeNights", delta: -1 });
  assert.equal(state.nights, 1);
  for (let i = 0; i < 10; i += 1) state = reduceDemo(state, { type: "changeGuests", delta: 1 });
  assert.equal(state.guests, 6);
  assert.equal(state.events[0]?.text, "/booking/guests = 6");
});

test("reserving moves to done and sends reserve_room with the current booking", () => {
  let state = reduceDemo(initial(), { type: "openHotel", hotel: "miradouro" });
  assert.equal(state.hotelView, "detail");
  assert.equal(state.events[0]?.text, 'open_stay { "stay": "miradouro" }');
  state = reduceDemo(state, { type: "reserve" });
  assert.equal(state.hotelView, "done");
  assert.equal(state.events[0]?.kind, "Action");
  assert.equal(state.events[0]?.text, 'reserve_room { "stay": "miradouro", "nights": 3, "guests": 2, "room": "city" }');
  state = reduceDemo(state, { type: "backToList" });
  assert.equal(state.hotelView, "list");
});

test("the food basket totals the starting order with the delivery fee", () => {
  const state = initial();
  assert.equal(foodSubtotal(state.qty), 71);
  assert.equal(foodItemCount(state.qty), 7);
  assert.equal(foodTotal(state.qty), 74.5);
  assert.equal(formatEur(foodTotal(state.qty)), "€74.50");
  assert.deepEqual(
    basketLines(state.qty).map((line) => line.name),
    ["Margherita, wood-fired", "Penne al ragù", "Salmon, quinoa and greens", "Garden salad", "Pastéis de nata (pair)"],
  );
});

test("dish quantities never go below zero and log the stored value", () => {
  let state = initial();
  state = reduceDemo(state, { type: "setQty", dish: "cake", qty: -2 });
  assert.equal(state.qty.cake, 0);
  assert.equal(state.events[0]?.text, "/order/cake = 0");
  state = reduceDemo(state, { type: "setQty", dish: "cake", qty: 1 });
  assert.equal(state.qty.cake, 1);
  assert.equal(state.events[0]?.text, "/order/cake = 1");
});

test("placing an order logs the item count and total to two decimals", () => {
  let state = reduceDemo(initial(), { type: "pickScenario", scenario: "food" });
  state = reduceDemo(state, { type: "placeOrder" });
  assert.equal(state.foodDone, true);
  assert.equal(state.events[0]?.text, 'place_order { "items": 7, "total": 74.50 }');
  assert.equal(state.events[0]?.kind, "Action");
});

test("the trip starts with six of seven stops and the starting ticket total", () => {
  const state = initial();
  assert.equal(allStops().length, 7);
  assert.equal(includedStops(state.skip).length, 6);
  assert.equal(tripTickets(state.skip), 39);
  assert.equal(tripSummary(state.skip), "6 of 7 stops · €39 in tickets");
});

test("day summaries count included stops, duration and cost", () => {
  const state = initial();
  assert.equal(daySummary(dayByNumber(1), state.skip), "3 stops · 3 h 15 min · €9");
  assert.equal(daySummary(dayByNumber(2), state.skip), "2 stops · 3 h 30 min · €10");
  assert.equal(daySummary(dayByNumber(3), state.skip), "1 stop · 5 h · €20");
  const empty = { skip: { "tram-28": true, "alfama-view": true, "nata-tasting": true } };
  assert.equal(daySummary(dayByNumber(1), empty.skip), "0 stops · 0 min · €0");
});

test("toggling a stop changes the trip summary and logs the new inclusion", () => {
  let state = reduceDemo(initial(), { type: "pickDay", day: 3 });
  state = reduceDemo(state, { type: "toggleStop", stop: "dinner-river" });
  assert.equal(state.skip["dinner-river"], false);
  assert.equal(state.events[0]?.text, "/days/3/dinner-river/included = true");
  assert.equal(tripSummary(state.skip), "7 of 7 stops · €74 in tickets");
  state = reduceDemo(state, { type: "toggleStop", stop: "dinner-river" });
  assert.equal(state.skip["dinner-river"], true);
  assert.equal(state.events[0]?.text, "/days/3/dinner-river/included = false");
});

test("toggling a stop that is not on the selected day changes nothing", () => {
  const state = initial();
  assert.equal(reduceDemo(state, { type: "toggleStop", stop: "pena-palace" }), state);
});

test("adding the trip to the calendar logs the included stop count", () => {
  let state = reduceDemo(initial(), { type: "pickScenario", scenario: "trip" });
  state = reduceDemo(state, { type: "addToCalendar" });
  assert.equal(state.tripDone, true);
  assert.equal(state.events[0]?.text, 'add_to_calendar { "stops": 6 }');
  state = reduceDemo(state, { type: "editTrip" });
  assert.equal(state.tripDone, false);
});

test("the event log keeps only the newest entries", () => {
  let state = initial();
  for (let i = 1; i <= EVENT_LIMIT + 2; i += 1) state = reduceDemo(state, { type: "pickDay", day: (i % 3) + 1 });
  assert.equal(state.events.length, EVENT_LIMIT);
  assert.equal(state.events[0]?.text, `/selectedDay = ${((EVENT_LIMIT + 2) % 3) + 1}`);
});

test("changing scenario clears the event log but keeps the booking", () => {
  let state = reduceDemo(initial(), { type: "changeNights", delta: 1 });
  state = reduceDemo(state, { type: "pickScenario", scenario: "food" });
  assert.deepEqual(state.events, []);
  assert.equal(state.nights, 4);
  assert.equal(state.scenario, "food");
});

test("panel step four changes once the scenario action has reached the app", () => {
  const before = initial();
  assert.equal(actionSent(before), false);
  assert.equal(panelSteps(before)[3]?.body, STEP_BODIES.notSent("reserve_room"));

  const after = reduceDemo(reduceDemo(before, { type: "openHotel", hotel: "tejo" }), { type: "reserve" });
  assert.equal(actionSent(after), true);
  assert.equal(panelSteps(after)[3]?.body, STEP_BODIES.sent("reserve_room"));
  assert.equal(panelSteps(after)[0]?.body, SCENARIO_SPECS.hotel.messages + " Data only: no HTML and no code.");
});

test("reducers never mutate the previous state", () => {
  const state = initial();
  const snapshot = JSON.stringify(state);
  reduceDemo(state, { type: "setQty", dish: "pizza", qty: 9 });
  reduceDemo(state, { type: "toggleFilter", filter: "view" });
  reduceDemo(state, { type: "placeOrder" });
  assert.equal(JSON.stringify(state), snapshot);
});

test("stop meta and trip data stay consistent with the spec", () => {
  assert.equal(stopMeta(TRIP_DAYS[0]!.stops[0]!), "1 h · €3");
  assert.equal(stopMeta(TRIP_DAYS[0]!.stops[1]!), "1 h 30 min · free");
  assert.equal(TRIP_DAYS.reduce((sum, day) => sum + day.stops.length, 0), 7);
});

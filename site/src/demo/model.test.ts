import assert from "node:assert/strict";
import { test } from "node:test";
import { HOTELS, INITIAL_SKIPPED_STOPS, TRIP_DAYS } from "./data.js";
import {
  EVENT_LIMIT,
  allStops,
  basketLines,
  bookingTotals,
  daySummary,
  dayByNumber,
  findHotel,
  foodItemCount,
  foodSubtotal,
  foodTotal,
  formatDuration,
  formatEur,
  includedStops,
  logEvent,
  panelSteps,
  replyDescription,
  stopMeta,
  tripSummary,
  tripTickets,
  visibleHotels,
  type DemoEvent,
} from "./model.js";

const INITIAL_QTY = { pizza: 2, pasta: 1, salmon: 1, salad: 1, cake: 0, nata: 2 } as const;

function initialIncluded(): Record<string, boolean> {
  const included: Record<string, boolean> = {};
  for (const stop of allStops()) included[stop.id] = !INITIAL_SKIPPED_STOPS.includes(stop.id);
  return included;
}

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
  assert.equal(visibleHotels([]).length, HOTELS.length);
  assert.deepEqual(visibleHotels(["pool"]).map((hotel) => hotel.id), ["miradouro"]);
  assert.deepEqual(visibleHotels(["pool", "view"]).map((hotel) => hotel.id), ["miradouro"]);
  assert.deepEqual(visibleHotels(["historic"]).map((hotel) => hotel.id), ["amarela", "marques"]);
  assert.deepEqual(visibleHotels(["pool", "historic"]), []);
});

test("booking totals add the river view supplement for every night", () => {
  const miradouro = findHotel("miradouro");
  assert.deepEqual(bookingTotals(miradouro, "city", 3), { basePerNight: 260, baseTotal: 780, extraTotal: 0, total: 780 });
  assert.deepEqual(bookingTotals(miradouro, "river", 4), { basePerNight: 260, baseTotal: 1040, extraTotal: 180, total: 1220 });
});

test("the food basket totals the starting order with the delivery fee", () => {
  assert.equal(foodSubtotal(INITIAL_QTY), 71);
  assert.equal(foodItemCount(INITIAL_QTY), 7);
  assert.equal(foodTotal(INITIAL_QTY), 74.5);
  assert.deepEqual(
    basketLines(INITIAL_QTY).map((line) => [line.name, line.qty, line.amount]),
    [
      ["Margherita, wood-fired", 2, 26],
      ["Penne al ragù", 1, 12],
      ["Salmon, quinoa and greens", 1, 17],
      ["Garden salad", 1, 8],
      ["Pastéis de nata (pair)", 2, 8],
    ],
  );
});

test("the trip starts with six of seven stops and the starting ticket total", () => {
  const included = initialIncluded();
  assert.equal(includedStops(included).length, 6);
  assert.equal(tripTickets(included), 39);
  assert.equal(tripSummary(included), "6 of 7 stops · €39 in tickets");
});

test("day summaries count included stops, duration and cost", () => {
  const included = initialIncluded();
  assert.equal(daySummary(dayByNumber(1), included), "3 stops · 3 h 15 min · €9");
  assert.equal(daySummary(dayByNumber(3), included), "1 stop · 5 h · €20");
  assert.equal(daySummary(dayByNumber(3), { ...included, "pena-palace": false }), "0 stops · 0 min · €0");
});

test("stop meta reads duration and cost, or free", () => {
  const alfama = allStops().find((stop) => stop.id === "alfama-view");
  const belem = allStops().find((stop) => stop.id === "belem-tower");
  assert.equal(stopMeta(alfama!), "1 h 30 min · free");
  assert.equal(stopMeta(belem!), "1 h 30 min · €10");
});

test("the event log keeps only the newest entries, newest first", () => {
  let events: DemoEvent[] = [];
  for (let n = 1; n <= EVENT_LIMIT + 2; n += 1) events = logEvent(events, "Input", `/value = ${n}`);
  assert.equal(events.length, EVENT_LIMIT);
  assert.equal(events[0]?.text, `/value = ${EVENT_LIMIT + 2}`);
  assert.equal(events.at(-1)?.text, `/value = ${3}`);
});

test("step one reports the real reply, and step four changes once the action reached the app", () => {
  const stats = {
    count: 3,
    operations: ["createSurface", "updateDataModel", "updateComponents"],
    components: ["Column", "Text"],
  };
  assert.equal(replyDescription(stats), "3 messages (createSurface, updateDataModel, updateComponents) using Column, Text. Data only: no HTML and no code.");
  const before = panelSteps({ stats, action: "reserve_room", actionSent: false });
  const after = panelSteps({ stats, action: "reserve_room", actionSent: true });
  assert.equal(before.length, 4);
  assert.match(before[3]!.body, /main button sends reserve_room/);
  assert.match(after[3]!.body, /received reserve_room/);
});

test("the trip data has three days and seven stops", () => {
  assert.equal(TRIP_DAYS.length, 3);
  assert.equal(allStops().length, 7);
  assert.equal(TRIP_DAYS.reduce((sum, day) => sum + day.stops.length, 0), 7);
});

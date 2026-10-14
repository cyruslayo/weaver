/**
 * Pure helpers for the agent-app demo: totals, filters, the trip summary, the event log and the
 * "How Weaver built this" steps. No DOM and no runtime, so the node tests exercise them directly.
 */
import { DISHES, FOOD_DELIVERY_FEE, HOTELS, RIVER_VIEW_EXTRA_PER_NIGHT, TRIP_DAYS, STEP_BODIES, type DishId, type FilterId, type Hotel, type HotelId, type RoomId, type Stop, type TripDay } from "./data.js";
import type { ReplyStats } from "./a2ui.js";

/** Input: a value the page wrote. Action: an event the page sent. Rejected: refused by the app. */
export type EventKind = "Input" | "Action" | "Rejected";

export interface DemoEvent {
  kind: EventKind;
  text: string;
}

/** The side panel keeps only the newest events. */
export const EVENT_LIMIT = 4;

/** Adds an event to the front of the log and keeps the newest EVENT_LIMIT entries. */
export function logEvent(events: readonly DemoEvent[], kind: EventKind, text: string): DemoEvent[] {
  return [{ kind, text }, ...events].slice(0, EVENT_LIMIT);
}

// ---- Formatting -----------------------------------------------------------------------------

/** Formats euros: whole amounts without decimals, others with two. */
export function formatEur(amount: number): string {
  const rounded = roundCents(amount);
  return "€" + rounded.toFixed(rounded % 1 ? 2 : 0);
}

/** Rounds to whole cents, so sums of prices compare exactly. */
export function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Formats minutes as "45 min", "1 h", or "1 h 30 min". Zero is "0 min". */
export function formatDuration(minutes: number): string {
  if (!minutes) return "0 min";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourPart = hours ? hours + " h" : "";
  const minutePart = rest ? rest + " min" : "";
  return hourPart + (hours && rest ? " " : "") + minutePart;
}

// ---- Hotels ---------------------------------------------------------------------------------

/** Hotels that carry every active filter. With no filters active, all hotels show. */
export function visibleHotels(filters: readonly FilterId[]): Hotel[] {
  return HOTELS.filter((hotel) => filters.every((id) => hotel.tags.includes(id)));
}

export function findHotel(id: HotelId): Hotel {
  const hotel = HOTELS.find((candidate) => candidate.id === id);
  if (!hotel) throw new Error(`unknown hotel: ${id}`);
  return hotel;
}

/** Room upgrade price for the selected room, per night. */
export function roomExtraPerNight(room: RoomId): number {
  return room === "river" ? RIVER_VIEW_EXTRA_PER_NIGHT : 0;
}

export interface BookingTotals {
  basePerNight: number;
  baseTotal: number;
  extraTotal: number;
  total: number;
}

/** Totals for the selected hotel, room and nights. */
export function bookingTotals(hotel: Hotel, room: RoomId, nights: number): BookingTotals {
  const extraPerNight = roomExtraPerNight(room);
  const baseTotal = hotel.price * nights;
  const extraTotal = extraPerNight * nights;
  return {
    basePerNight: hotel.price,
    baseTotal,
    extraTotal,
    total: (hotel.price + extraPerNight) * nights,
  };
}

export function roomName(room: RoomId): string {
  return room === "river" ? "River view" : "City view";
}

// ---- Food -----------------------------------------------------------------------------------

export type DishQuantities = Readonly<Record<DishId, number>>;

export interface BasketLine {
  id: DishId;
  name: string;
  qty: number;
  amount: number;
}

export function basketLines(qty: DishQuantities): BasketLine[] {
  return DISHES.filter((dish) => qty[dish.id] > 0).map((dish) => ({
    id: dish.id,
    name: dish.name,
    qty: qty[dish.id],
    amount: dish.price * qty[dish.id],
  }));
}

export function foodSubtotal(qty: DishQuantities): number {
  return basketLines(qty).reduce((sum, line) => sum + line.amount, 0);
}

export function foodItemCount(qty: DishQuantities): number {
  return basketLines(qty).reduce((sum, line) => sum + line.qty, 0);
}

/** Subtotal plus the delivery fee, rounded to cents. */
export function foodTotal(qty: DishQuantities): number {
  return roundCents(foodSubtotal(qty) + FOOD_DELIVERY_FEE);
}

// ---- Trip -----------------------------------------------------------------------------------

/** Inclusion per stop id. A missing stop counts as not included. */
export type StopInclusion = Readonly<Record<string, boolean>>;

export function allStops(): Stop[] {
  return TRIP_DAYS.flatMap((day) => day.stops);
}

export function includedStops(included: StopInclusion): Stop[] {
  return allStops().filter((stop) => included[stop.id] === true);
}

export function tripTickets(included: StopInclusion): number {
  return includedStops(included).reduce((sum, stop) => sum + stop.cost, 0);
}

/** For example "6 of 7 stops · €73 in tickets". */
export function tripSummary(included: StopInclusion): string {
  return (
    includedStops(included).length +
    " of " +
    allStops().length +
    " stops · " +
    formatEur(tripTickets(included)) +
    " in tickets"
  );
}

export function dayByNumber(n: number): TripDay {
  const day = TRIP_DAYS.find((candidate) => candidate.n === n);
  if (!day) throw new Error(`unknown trip day: ${n}`);
  return day;
}

/** For example "2 stops · 2 h 30 min · €9" or "1 stop · 1 h · €3". */
export function daySummary(day: TripDay, included: StopInclusion): string {
  const kept = day.stops.filter((stop) => included[stop.id] === true);
  const minutes = kept.reduce((sum, stop) => sum + stop.min, 0);
  const cost = kept.reduce((sum, stop) => sum + stop.cost, 0);
  return kept.length + (kept.length === 1 ? " stop · " : " stops · ") + formatDuration(minutes) + " · " + formatEur(cost);
}

/** Line under a stop's time: for example "1 h 30 min · €10", or "1 h · free". */
export function stopMeta(stop: Stop): string {
  return formatDuration(stop.min) + " · " + (stop.cost ? formatEur(stop.cost) : "free");
}

// ---- Panel ----------------------------------------------------------------------------------

export interface PanelStep {
  n: number;
  title: string;
  body: string;
}

/** The step-one line: the real message count, the lifecycle messages and the component types. */
export function replyDescription(stats: ReplyStats): string {
  if (stats.count === 0) return "No A2UI has been sent yet.";
  return (
    stats.count +
    " messages (" +
    stats.operations.join(", ") +
    ") using " +
    stats.components.join(", ") +
    ". Data only: no HTML and no code."
  );
}

/** The four steps of the "How Weaver built this" panel for the current scenario. */
export function panelSteps(input: { stats: ReplyStats; action: string; actionSent: boolean }): PanelStep[] {
  return [
    { n: 1, title: "The agent replied with A2UI", body: replyDescription(input.stats) },
    { n: 2, title: "Weaver checked every message", body: STEP_BODIES.checked },
    { n: 3, title: "Your components drew it", body: STEP_BODIES.drawn },
    {
      n: 4,
      title: "Actions came back to your code",
      body: input.actionSent ? STEP_BODIES.sent(input.action) : STEP_BODIES.notSent(input.action),
    },
  ];
}

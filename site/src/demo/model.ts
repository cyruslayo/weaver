/**
 * Pure state and logic for the agent-app demo: totals, filters, the trip summary, event text
 * and the state transitions. No DOM access, so the node tests can exercise it directly.
 */
import {
  DISHES,
  FILTERS,
  FOOD_DELIVERY_FEE,
  HOTELS,
  INITIAL_SKIPPED_STOPS,
  MAX_GUESTS,
  MAX_NIGHTS,
  MIN_GUESTS,
  MIN_NIGHTS,
  RIVER_VIEW_EXTRA_PER_NIGHT,
  SCENARIO_SPECS,
  STEP_BODIES,
  TRIP_DAYS,
  type DishId,
  type FilterId,
  type Hotel,
  type HotelId,
  type HotelView,
  type RoomId,
  type ScenarioId,
  type Stop,
  type TripDay,
} from "./data.js";

export type EventKind = "Input" | "Action";

export interface DemoEvent {
  kind: EventKind;
  text: string;
}

/** The side panel keeps only the newest events. */
export const EVENT_LIMIT = 4;

export interface DemoState {
  scenario: ScenarioId;
  panelOpen: boolean;
  hotelView: HotelView;
  hotelId: HotelId;
  photo: number;
  filters: Partial<Record<FilterId, boolean>>;
  saved: Partial<Record<HotelId, boolean>>;
  nights: number;
  guests: number;
  room: RoomId;
  qty: Record<DishId, number>;
  foodDone: boolean;
  /** Selected trip day, 1 to 3. */
  day: number;
  skip: Partial<Record<string, boolean>>;
  tripDone: boolean;
  events: readonly DemoEvent[];
}

export function initialDemoState(panelOpen: boolean): DemoState {
  const skip: Partial<Record<string, boolean>> = {};
  for (const id of INITIAL_SKIPPED_STOPS) skip[id] = true;
  return {
    scenario: "hotel",
    panelOpen,
    hotelView: "list",
    hotelId: "miradouro",
    photo: 0,
    filters: {},
    saved: { amarela: true },
    nights: 3,
    guests: 2,
    room: "city",
    qty: { pizza: 2, pasta: 1, salmon: 1, salad: 1, cake: 0, nata: 2 },
    foodDone: false,
    day: 1,
    skip,
    tripDone: false,
    events: [],
  };
}

// ---- Formatting -----------------------------------------------------------------------------

/** Formats euros: whole amounts without decimals, others with two. */
export function formatEur(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return "€" + rounded.toFixed(rounded % 1 ? 2 : 0);
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

export function activeFilterIds(filters: DemoState["filters"]): FilterId[] {
  return FILTERS.map((filter) => filter.id).filter((id) => filters[id] === true);
}

/** Hotels that carry every active filter. With no filters active, all hotels show. */
export function visibleHotels(filters: DemoState["filters"]): Hotel[] {
  const active = activeFilterIds(filters);
  return HOTELS.filter((hotel) => active.every((id) => hotel.tags.includes(id)));
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

export function clampNights(nights: number): number {
  return Math.min(MAX_NIGHTS, Math.max(MIN_NIGHTS, nights));
}

export function clampGuests(guests: number): number {
  return Math.min(MAX_GUESTS, Math.max(MIN_GUESTS, guests));
}

// ---- Food -----------------------------------------------------------------------------------

export interface BasketLine {
  id: DishId;
  name: string;
  qty: number;
  amount: number;
}

export function basketLines(qty: DemoState["qty"]): BasketLine[] {
  return DISHES.filter((dish) => qty[dish.id] > 0).map((dish) => ({
    id: dish.id,
    name: dish.name,
    qty: qty[dish.id],
    amount: dish.price * qty[dish.id],
  }));
}

export function foodSubtotal(qty: DemoState["qty"]): number {
  return basketLines(qty).reduce((sum, line) => sum + line.amount, 0);
}

export function foodItemCount(qty: DemoState["qty"]): number {
  return basketLines(qty).reduce((sum, line) => sum + line.qty, 0);
}

/** Subtotal plus the delivery fee. */
export function foodTotal(qty: DemoState["qty"]): number {
  return foodSubtotal(qty) + FOOD_DELIVERY_FEE;
}

// ---- Trip -----------------------------------------------------------------------------------

export function allStops(): Stop[] {
  return TRIP_DAYS.flatMap((day) => day.stops);
}

export function includedStops(skip: DemoState["skip"]): Stop[] {
  return allStops().filter((stop) => !skip[stop.id]);
}

export function tripTickets(skip: DemoState["skip"]): number {
  return includedStops(skip).reduce((sum, stop) => sum + stop.cost, 0);
}

/** For example "6 of 7 stops · €73 in tickets". */
export function tripSummary(skip: DemoState["skip"]): string {
  return (
    includedStops(skip).length +
    " of " +
    allStops().length +
    " stops · " +
    formatEur(tripTickets(skip)) +
    " in tickets"
  );
}

export function dayByNumber(n: number): TripDay {
  const day = TRIP_DAYS.find((candidate) => candidate.n === n);
  if (!day) throw new Error(`unknown trip day: ${n}`);
  return day;
}

/** For example "Day 1 · Old town". */
export function dayLabel(day: TripDay): string {
  return day.label + " · " + day.name;
}

/** For example "2 stops · 2 h 30 min · €9" or "1 stop · 1 h · €3". */
export function daySummary(day: TripDay, skip: DemoState["skip"]): string {
  const included = day.stops.filter((stop) => !skip[stop.id]);
  const minutes = included.reduce((sum, stop) => sum + stop.min, 0);
  const cost = included.reduce((sum, stop) => sum + stop.cost, 0);
  return (
    included.length +
    (included.length === 1 ? " stop · " : " stops · ") +
    formatDuration(minutes) +
    " · " +
    formatEur(cost)
  );
}

/** Line under a stop's duration: for example "1 h 30 min · €10", or "1 h · free". */
export function stopMeta(stop: Stop): string {
  return formatDuration(stop.min) + " · " + (stop.cost ? formatEur(stop.cost) : "free");
}

// ---- Events ---------------------------------------------------------------------------------

/** Adds an event to the front of the log and keeps the newest EVENT_LIMIT entries. */
export function logEvent(state: DemoState, kind: EventKind, text: string): DemoState {
  return { ...state, events: [{ kind, text }, ...state.events].slice(0, EVENT_LIMIT) };
}

/** True when the scenario's action has already been sent to the app in this run. */
export function actionSent(state: DemoState): boolean {
  const action = SCENARIO_SPECS[state.scenario].action;
  return state.events.some((event) => event.kind === "Action" && event.text.startsWith(action));
}

export interface PanelStep {
  n: number;
  title: string;
  body: string;
}

/** The four steps of the "How Weaver built this" panel for the current scenario. */
export function panelSteps(state: DemoState): PanelStep[] {
  const spec = SCENARIO_SPECS[state.scenario];
  return [
    { n: 1, title: "The agent replied with A2UI", body: spec.messages + " Data only: no HTML and no code." },
    { n: 2, title: "Weaver checked every message", body: STEP_BODIES.checked },
    { n: 3, title: "Your components drew it", body: STEP_BODIES.drawn },
    {
      n: 4,
      title: "Actions came back to your code",
      body: actionSent(state) ? STEP_BODIES.sent(spec.action) : STEP_BODIES.notSent(spec.action),
    },
  ];
}

// ---- Transitions ----------------------------------------------------------------------------

export type DemoAction =
  | { type: "pickScenario"; scenario: ScenarioId }
  | { type: "togglePanel" }
  | { type: "toggleFilter"; filter: FilterId }
  | { type: "clearFilters" }
  | { type: "toggleSaved"; hotel: HotelId }
  | { type: "openHotel"; hotel: HotelId }
  | { type: "backToList" }
  | { type: "pickPhoto"; index: number }
  | { type: "changeNights"; delta: number }
  | { type: "changeGuests"; delta: number }
  | { type: "pickRoom"; room: RoomId }
  | { type: "reserve" }
  | { type: "setQty"; dish: DishId; qty: number }
  | { type: "placeOrder" }
  | { type: "newOrder" }
  | { type: "pickDay"; day: number }
  | { type: "toggleStop"; stop: string }
  | { type: "addToCalendar" }
  | { type: "editTrip" };

/** Applies one user action. Pure: returns a new state and never mutates the old one. */
export function reduceDemo(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "pickScenario":
      return { ...state, scenario: action.scenario, events: [] };
    case "togglePanel":
      return { ...state, panelOpen: !state.panelOpen };
    case "toggleFilter": {
      const next = !state.filters[action.filter];
      const filters = { ...state.filters, [action.filter]: next };
      return logEvent({ ...state, filters }, "Input", `/filters/${action.filter} = ${next}`);
    }
    case "clearFilters":
      return logEvent({ ...state, filters: {} }, "Input", "/filters = {}");
    case "toggleSaved": {
      const next = !state.saved[action.hotel];
      const saved = { ...state.saved, [action.hotel]: next };
      return logEvent({ ...state, saved }, "Input", `/saved/${action.hotel} = ${next}`);
    }
    case "openHotel":
      return logEvent(
        { ...state, hotelId: action.hotel, hotelView: "detail", photo: 0 },
        "Action",
        `open_stay { "stay": "${action.hotel}" }`,
      );
    case "backToList":
      return { ...state, hotelView: "list" };
    case "pickPhoto":
      return { ...state, photo: action.index };
    case "changeNights": {
      const nights = clampNights(state.nights + action.delta);
      return logEvent({ ...state, nights }, "Input", `/booking/nights = ${nights}`);
    }
    case "changeGuests": {
      const guests = clampGuests(state.guests + action.delta);
      return logEvent({ ...state, guests }, "Input", `/booking/guests = ${guests}`);
    }
    case "pickRoom":
      return logEvent({ ...state, room: action.room }, "Input", `/booking/room = "${action.room}"`);
    case "reserve": {
      const hotel = findHotel(state.hotelId);
      const text = `reserve_room { "stay": "${hotel.id}", "nights": ${state.nights}, "guests": ${state.guests}, "room": "${state.room}" }`;
      return logEvent({ ...state, hotelView: "done" }, "Action", text);
    }
    case "setQty": {
      const qty = { ...state.qty, [action.dish]: Math.max(0, action.qty) };
      return logEvent({ ...state, qty }, "Input", `/order/${action.dish} = ${qty[action.dish]}`);
    }
    case "placeOrder": {
      const items = foodItemCount(state.qty);
      const total = foodTotal(state.qty).toFixed(2);
      return logEvent({ ...state, foodDone: true }, "Action", `place_order { "items": ${items}, "total": ${total} }`);
    }
    case "newOrder":
      return { ...state, foodDone: false };
    case "pickDay":
      return logEvent({ ...state, day: action.day }, "Input", `/selectedDay = ${action.day}`);
    case "toggleStop": {
      const day = dayByNumber(state.day);
      const stop = day.stops.find((candidate) => candidate.id === action.stop);
      if (!stop) return state;
      const includedNow = !state.skip[stop.id];
      const skip = { ...state.skip, [stop.id]: includedNow };
      return logEvent({ ...state, skip }, "Input", `/days/${state.day}/${stop.id}/included = ${!includedNow}`);
    }
    case "addToCalendar":
      return logEvent(
        { ...state, tripDone: true },
        "Action",
        `add_to_calendar { "stops": ${includedStops(state.skip).length} }`,
      );
    case "editTrip":
      return { ...state, tripDone: false };
  }
}

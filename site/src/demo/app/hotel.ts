/**
 * The hotel app: the state, the only inputs and actions it accepts, and what each one does.
 * Totals and the filtered list come from model.ts, so the numbers are the app's, not the agent's.
 */
import { HOTELS, FILTERS, MAX_GUESTS, MAX_NIGHTS, MIN_GUESTS, MIN_NIGHTS, type FilterId, type HotelId, type RoomId } from "../data.js";
import { HOTEL_SURFACE_ID, hotelComponents, hotelData, hotelView, type HotelState, type HotelView } from "../agent/hotel.js";
import { findHotel } from "../model.js";
import { accept, refuse, type ScenarioDefinition } from "./types.js";
import { hasExactKeys, isIntegerInRange, isOneOf, isSingleChoice, isStringList } from "./validate.js";

const HOTEL_IDS: readonly HotelId[] = HOTELS.map((hotel) => hotel.id);
const FILTER_IDS: readonly FilterId[] = FILTERS.map((filter) => filter.id);
const ROOMS: readonly RoomId[] = ["city", "river"];
const BOOKING_FIELDS: readonly ("nights" | "guests")[] = ["nights", "guests"];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const hotelDefinition: ScenarioDefinition<HotelState, HotelView> = {
  id: "hotel",
  surfaceId: HOTEL_SURFACE_ID,
  mainAction: "reserve_room",
  initial: () => ({
    view: "list",
    filters: [],
    saved: ["amarela"],
    stayId: "miradouro",
    photo: 0,
    nights: 3,
    guests: 2,
    room: "city",
  }),
  view: hotelView,
  components: hotelComponents,
  data: hotelData,
  inputs: {
    "/filters": (state, value) => {
      if (state.view !== "list") return refuse("the filters only apply on the stays list");
      if (!isStringList(value) || !value.every((id) => isOneOf(id, FILTER_IDS))) {
        return refuse("filters must be a list of known filter ids");
      }
      // The chips keep their own order, and a repeated id counts once.
      return accept({ ...state, filters: FILTER_IDS.filter((id) => value.includes(id)) });
    },
    "/booking/room": (state, value) => {
      if (state.view !== "detail") return refuse("the room is only set on a stay");
      if (!isSingleChoice(value, ROOMS)) return refuse("the room must be one of the listed rooms");
      return accept({ ...state, room: value[0] });
    },
  },
  actions: {
    clear_filters: (state, context) => {
      if (state.view !== "list") return refuse("filters are cleared on the stays list");
      if (!hasExactKeys(context, [])) return refuse("clear_filters takes no context");
      return accept({ ...state, filters: [] });
    },
    toggle_save: (state, context) => {
      if (state.view !== "list") return refuse("stays are saved from the list");
      if (!hasExactKeys(context, ["stay"])) return refuse("toggle_save takes a stay");
      const stay = context.stay;
      if (!isOneOf(stay, HOTEL_IDS)) return refuse("unknown stay");
      const saved = state.saved.includes(stay) ? state.saved.filter((id) => id !== stay) : [...state.saved, stay];
      return accept({ ...state, saved });
    },
    open_stay: (state, context) => {
      if (state.view !== "list") return refuse("a stay opens from the list");
      if (!hasExactKeys(context, ["stay"])) return refuse("open_stay takes a stay");
      const stay = context.stay;
      if (!isOneOf(stay, HOTEL_IDS)) return refuse("unknown stay");
      return accept({ ...state, view: "detail", stayId: stay, photo: 0 });
    },
    show_photo: (state, context) => {
      if (state.view !== "detail") return refuse("photos are shown on a stay");
      if (!hasExactKeys(context, ["index"])) return refuse("show_photo takes an index");
      const count = findHotel(state.stayId).photos.length;
      const index = context.index;
      if (!isIntegerInRange(index, 0, count - 1)) return refuse(`index must be a photo from 0 to ${count - 1}`);
      return accept({ ...state, photo: index });
    },
    back_to_stays: (state, context) => {
      if (state.view === "list") return refuse("already on the stays list");
      if (!hasExactKeys(context, [])) return refuse("back_to_stays takes no context");
      return accept({ ...state, view: "list" });
    },
    change_booking: (state, context) => {
      if (state.view !== "detail") return refuse("the booking is changed on a stay");
      if (!hasExactKeys(context, ["field", "delta"])) return refuse("change_booking takes a field and a delta");
      const field = context.field;
      const delta = context.delta;
      if (!isOneOf(field, BOOKING_FIELDS)) return refuse("unknown booking field");
      if (delta !== 1 && delta !== -1) return refuse("delta must be 1 or -1");
      // The buttons clamp at the limits, so pressing past one leaves the value where it is.
      if (field === "nights") return accept({ ...state, nights: clamp(state.nights + delta, MIN_NIGHTS, MAX_NIGHTS) });
      return accept({ ...state, guests: clamp(state.guests + delta, MIN_GUESTS, MAX_GUESTS) });
    },
    reserve_room: (state, context) => {
      if (state.view !== "detail") return refuse("a room is reserved from a stay");
      if (!hasExactKeys(context, ["stay", "nights", "guests", "room"])) return refuse("reserve_room takes a stay, nights, guests and a room");
      const { stay, nights, guests, room } = context;
      if (stay !== state.stayId) return refuse("the stay does not match the one on screen");
      if (!isIntegerInRange(nights, MIN_NIGHTS, MAX_NIGHTS) || nights !== state.nights) return refuse("the nights do not match the booking");
      if (!isIntegerInRange(guests, MIN_GUESTS, MAX_GUESTS) || guests !== state.guests) return refuse("the guests do not match the booking");
      if (!isSingleChoice(room, ROOMS) || room[0] !== state.room) return refuse("the room does not match the booking");
      return accept({ ...state, view: "done" });
    },
  },
};

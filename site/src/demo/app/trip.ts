/**
 * The trip app: which stops are included, and the calendar entry. The write for each stop is its own
 * allowlisted input, so a path that is not a known stop is refused.
 */
import type { JsonValue } from "@cylayo/weaver-core";
import { INITIAL_SKIPPED_STOPS } from "../data.js";
import { TRIP_SURFACE_ID, tripComponents, tripData, tripView, type TripState, type TripView } from "../agent/trip.js";
import { allStops, includedStops } from "../model.js";
import { accept, refuse, type ScenarioDefinition, type Transition } from "./types.js";
import { hasExactKeys } from "./validate.js";

function stopInclusionInput(stopId: string): (state: TripState, value: JsonValue) => Transition<TripState> {
  return (state, value) => {
    if (state.done) return refuse("the trip is already in the calendar");
    if (typeof value !== "boolean") return refuse("a stop is included as true or false");
    return accept({ ...state, included: { ...state.included, [stopId]: value } });
  };
}

const stopInputs: Record<string, (state: TripState, value: JsonValue) => Transition<TripState>> = {};
for (const stop of allStops()) stopInputs[`/trip/included/${stop.id}`] = stopInclusionInput(stop.id);

export const tripDefinition: ScenarioDefinition<TripState, TripView> = {
  id: "trip",
  surfaceId: TRIP_SURFACE_ID,
  mainAction: "add_to_calendar",
  initial: () => {
    const included: Record<string, boolean> = {};
    for (const stop of allStops()) included[stop.id] = !INITIAL_SKIPPED_STOPS.includes(stop.id);
    return { done: false, included };
  },
  view: tripView,
  components: tripComponents,
  data: tripData,
  inputs: stopInputs,
  actions: {
    add_to_calendar: (state, context) => {
      if (state.done) return refuse("the trip is already in the calendar");
      if (!hasExactKeys(context, ["stops"])) return refuse("add_to_calendar takes a stop count");
      const kept = includedStops(state.included).length;
      const stops = context.stops;
      if (typeof stops !== "number" || stops !== kept) return refuse("the stop count does not match the plan");
      if (kept === 0) return refuse("pick at least one stop");
      return accept({ ...state, done: true });
    },
    edit_trip: (state, context) => {
      if (!state.done) return refuse("the plan is already open");
      if (!hasExactKeys(context, [])) return refuse("edit_trip takes no context");
      return accept({ ...state, done: false });
    },
  },
};

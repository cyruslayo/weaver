/**
 * The trip agent: a deterministic stand-in for a model. It describes the three-day plan (Tabs of
 * stop Cards with CheckBoxes) and the saved screen with Basic catalog components.
 */
import type { A2UIComponent, JsonObject } from "@cylayo/weaver-core";
import { TRIP_DAYS, type Stop } from "../data.js";
import { imageSource } from "../images.js";
import { allStops, daySummary, includedStops, stopMeta, tripSummary, type StopInclusion } from "../model.js";
import { bind, heading } from "../a2ui.js";

export const TRIP_SURFACE_ID = "trip";

export type TripView = "plan" | "done";

export interface TripState {
  /** True once the trip is added to the calendar. */
  done: boolean;
  included: StopInclusion;
}

export function tripView(state: TripState): TripView {
  return state.done ? "done" : "plan";
}

/**
 * A component id from a data id. A2UI v1.0 ids are identifiers, so a hyphen becomes an underscore.
 * The data paths keep the original stop ids, which are JSON Pointer segments and may contain hyphens.
 */
function componentKey(id: string): string {
  return id.replace(/-/g, "_");
}

/** The data every view reads. The host sends it after each change. */
export function tripData(state: TripState): JsonObject {
  const kept = includedStops(state.included);
  const included: Record<string, boolean> = {};
  for (const stop of allStops()) included[stop.id] = state.included[stop.id] === true;
  return {
    trip: {
      summary: tripSummary(state.included) + " · sample prices",
      included,
      includedCount: kept.length,
      days: TRIP_DAYS.map((day) => daySummary(day, state.included)),
    },
    done: {
      summary: tripSummary(state.included),
      photos: kept.map((stop) => ({ url: imageSource(stop.img), alt: stop.alt })),
    },
  };
}

export function tripComponents(view: TripView): A2UIComponent[] {
  return view === "plan" ? planComponents() : doneComponents();
}

function stopComponents(stop: Stop): A2UIComponent[] {
  const id = (suffix: string): string => `stop_${componentKey(stop.id)}_${suffix}`;
  return [
    { id: id("card"), component: "Card", child: id("body") },
    { id: id("body"), component: "Column", children: [id("photo"), id("meta"), id("title"), id("blurb"), id("include")] },
    {
      id: id("photo"),
      component: "Image",
      url: imageSource(stop.img),
      description: stop.alt,
      fit: "cover",
      variant: "largeFeature",
    },
    { id: id("meta"), component: "Text", variant: "caption", text: `${stop.time} · ${stopMeta(stop)}` },
    { id: id("title"), component: "Text", text: heading(3, stop.title) },
    { id: id("blurb"), component: "Text", text: stop.blurb },
    {
      id: id("include"),
      component: "CheckBox",
      label: `Include ${stop.title}`,
      value: bind(`/trip/included/${stop.id}`),
    },
  ];
}

function dayComponents(dayIndex: number): A2UIComponent[] {
  const day = TRIP_DAYS[dayIndex];
  if (day === undefined) return [];
  const dayId = `day_${day.n}`;
  return [
    {
      id: dayId,
      component: "Column",
      children: [`${dayId}_title`, `${dayId}_summary`, ...day.stops.map((stop) => `stop_${componentKey(stop.id)}_card`)],
    },
    { id: `${dayId}_title`, component: "Text", text: heading(3, `${day.label} · ${day.name}`) },
    { id: `${dayId}_summary`, component: "Text", variant: "caption", text: bind(`/trip/days/${dayIndex}`) },
    ...day.stops.flatMap(stopComponents),
  ];
}

function planComponents(): A2UIComponent[] {
  return [
    { id: "root", component: "Column", children: ["trip_title", "trip_summary", "days", "save"] },
    { id: "trip_title", component: "Text", text: heading(2, "Three days in Lisbon") },
    { id: "trip_summary", component: "Text", variant: "caption", text: bind("/trip/summary") },
    {
      id: "days",
      component: "Tabs",
      tabs: TRIP_DAYS.map((day) => ({ title: day.label, child: `day_${day.n}` })),
    },
    ...TRIP_DAYS.flatMap((_, index) => dayComponents(index)),
    {
      id: "save",
      component: "Button",
      variant: "primary",
      child: "save_label",
      action: { event: { name: "add_to_calendar", context: { stops: bind("/trip/includedCount") } } },
    },
    { id: "save_label", component: "Text", text: "Add trip to calendar" },
  ];
}

function doneComponents(): A2UIComponent[] {
  return [
    { id: "root", component: "Column", children: ["done_title", "done_summary", "done_photos", "done_edit"] },
    { id: "done_title", component: "Text", text: heading(2, "Trip added to your calendar") },
    { id: "done_summary", component: "Text", variant: "caption", text: bind("/done/summary") },
    { id: "done_photos", component: "List", direction: "horizontal", children: { componentId: "done_photo", path: "/done/photos" } },
    {
      id: "done_photo",
      component: "Image",
      url: bind("url"),
      description: bind("alt"),
      fit: "cover",
      variant: "smallFeature",
    },
    {
      id: "done_edit",
      component: "Button",
      child: "edit_label",
      action: { event: { name: "edit_trip", context: {} } },
    },
    { id: "edit_label", component: "Text", text: "Edit the plan" },
  ];
}

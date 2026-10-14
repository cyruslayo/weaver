/**
 * The trip agent: a deterministic stand-in for a model. It describes the three-day plan (Tabs of
 * stop Cards with CheckBoxes) and the saved screen with Basic catalog components.
 */
import type { A2UIComponent, JsonObject } from "@cylayo/weaver-core";
import { TRIP_DAYS, type Stop } from "../data.js";
import { imageSource } from "../images.js";
import { allStops, daySummary, includedStops, stopMeta, tripSummary, type StopInclusion } from "../model.js";

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
  const id = (suffix: string): string => `stop-${stop.id}-${suffix}`;
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
    { id: id("title"), component: "Text", variant: "h3", text: stop.title },
    { id: id("blurb"), component: "Text", text: stop.blurb },
    {
      id: id("include"),
      component: "CheckBox",
      label: `Include ${stop.title}`,
      value: { path: `/trip/included/${stop.id}` },
    },
  ];
}

function dayComponents(dayIndex: number): A2UIComponent[] {
  const day = TRIP_DAYS[dayIndex];
  if (day === undefined) return [];
  const dayId = `day-${day.n}`;
  return [
    {
      id: dayId,
      component: "Column",
      children: [`${dayId}-title`, `${dayId}-summary`, ...day.stops.map((stop) => `stop-${stop.id}-card`)],
    },
    { id: `${dayId}-title`, component: "Text", variant: "h3", text: `${day.label} · ${day.name}` },
    { id: `${dayId}-summary`, component: "Text", variant: "caption", text: { path: `/trip/days/${dayIndex}` } },
    ...day.stops.flatMap(stopComponents),
  ];
}

function planComponents(): A2UIComponent[] {
  return [
    { id: "root", component: "Column", children: ["trip-title", "trip-summary", "days", "save"] },
    { id: "trip-title", component: "Text", variant: "h2", text: "Three days in Lisbon" },
    { id: "trip-summary", component: "Text", variant: "caption", text: { path: "/trip/summary" } },
    {
      id: "days",
      component: "Tabs",
      tabs: TRIP_DAYS.map((day) => ({ title: day.label, child: `day-${day.n}` })),
    },
    ...TRIP_DAYS.flatMap((_, index) => dayComponents(index)),
    {
      id: "save",
      component: "Button",
      variant: "primary",
      child: "save-label",
      action: { event: { name: "add_to_calendar", context: { stops: { path: "/trip/includedCount" } } } },
    },
    { id: "save-label", component: "Text", text: "Add trip to calendar" },
  ];
}

function doneComponents(): A2UIComponent[] {
  return [
    { id: "root", component: "Column", children: ["done-title", "done-summary", "done-photos", "done-edit"] },
    { id: "done-title", component: "Text", variant: "h2", text: "Trip added to your calendar" },
    { id: "done-summary", component: "Text", variant: "caption", text: { path: "/done/summary" } },
    { id: "done-photos", component: "List", direction: "horizontal", children: { path: "/done/photos", componentId: "done-photo" } },
    {
      id: "done-photo",
      component: "Image",
      url: { path: "url" },
      description: { path: "alt" },
      fit: "cover",
      variant: "smallFeature",
    },
    {
      id: "done-edit",
      component: "Button",
      child: "edit-label",
      action: { event: { name: "edit_trip", context: {} } },
    },
    { id: "edit-label", component: "Text", text: "Edit the plan" },
  ];
}

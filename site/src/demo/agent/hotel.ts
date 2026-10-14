/**
 * The hotel agent: a deterministic stand-in for a model. Given the app state it describes the
 * screen with A2UI v0.9.1 components from the Basic catalog, and the data those components read.
 * It calls no model and it sends no code. Every message is produced through the producer.
 */
import type { A2UIComponent, JsonObject } from "@cylayo/weaver-core";
import { FILTERS, PHOTO_ALT, RIVER_VIEW_EXTRA_PER_NIGHT, type FilterId, type Hotel, type HotelId, type ImageKey, type RoomId } from "../data.js";
import { imageSource } from "../images.js";
import { bookingTotals, findHotel, formatEur, roomName, visibleHotels } from "../model.js";

export const HOTEL_SURFACE_ID = "stays";

export type HotelView = "list" | "detail" | "done";

export interface HotelState {
  view: HotelView;
  /** Active filters, in the order the chips show them. */
  filters: readonly FilterId[];
  saved: readonly HotelId[];
  /** The stay on screen in the detail and done views. */
  stayId: HotelId;
  /** Index of the photo shown large. */
  photo: number;
  nights: number;
  guests: number;
  room: RoomId;
}

export function hotelView(state: HotelState): HotelView {
  return state.view;
}

type Photo = {
  url: string;
  alt: string;
};

function photoAt(hotel: Hotel, index: number): Photo {
  const key: ImageKey = hotel.photos[index] ?? hotel.photos[0] ?? "tejo";
  return { url: imageSource(key), alt: PHOTO_ALT[key] ?? hotel.name };
}

function stayItem(state: HotelState, hotel: Hotel): JsonObject {
  const saved = state.saved.includes(hotel.id);
  const lead = photoAt(hotel, 0);
  return {
    id: hotel.id,
    name: hotel.name,
    line: `${hotel.area} · ★ ${hotel.rating} · ${hotel.tagLine}`,
    price: `${formatEur(hotel.price)} a night`,
    saveLabel: saved ? "♥ Saved" : "♡ Save",
    url: lead.url,
    alt: lead.alt,
  };
}

/** The data every view reads. The host sends it after each change, so the screen matches app state. */
export function hotelData(state: HotelState): JsonObject {
  const hotel = findHotel(state.stayId);
  const shown = visibleHotels(state.filters);
  const totals = bookingTotals(hotel, state.room, state.nights);
  const river = state.room === "river";
  const photos = hotel.photos.map((_, index) => photoAt(hotel, index));
  return {
    filters: [...state.filters],
    listNote: shown.length === 0 ? "No stays match every filter." : "",
    stays: shown.map((candidate) => stayItem(state, candidate)),
    selected: {
      id: hotel.id,
      name: hotel.name,
      line: `${hotel.area} · ★ ${hotel.rating} · ${formatEur(hotel.price)} a night`,
      amenities: hotel.amenities.join(" · "),
    },
    detail: {
      main: photoAt(hotel, state.photo),
      thumbs: photos,
      photoLabel: `Photo ${state.photo + 1} of ${photos.length}`,
    },
    booking: {
      nights: state.nights,
      guests: state.guests,
      room: [state.room],
      nightsText: String(state.nights),
      guestsText: String(state.guests),
    },
    totals: {
      baseLabel: `${formatEur(totals.basePerNight)} × ${state.nights} nights`,
      baseAmount: formatEur(totals.baseTotal),
      extraLabel: river ? `River view × ${state.nights}` : "",
      extraAmount: river ? formatEur(totals.extraTotal) : "",
      totalAmount: formatEur(totals.total),
      reserveLabel: `Reserve for ${formatEur(totals.total)}`,
    },
    done: {
      photo: photoAt(hotel, 0),
      summary: `${hotel.name} · ${state.nights} nights · ${state.guests} guests · ${roomName(state.room)} · ${formatEur(totals.total)}`,
    },
  };
}

/** The components for one view. The root Column lists the view's top-level components. */
export function hotelComponents(view: HotelView): A2UIComponent[] {
  if (view === "list") return listComponents();
  if (view === "detail") return detailComponents();
  return doneComponents();
}

function listComponents(): A2UIComponent[] {
  return [
    { id: "root", component: "Column", children: ["list-title", "list-sub", "filters", "list-note", "stays"] },
    { id: "list-title", component: "Text", variant: "h2", text: "Modern stays in Lisbon" },
    { id: "list-sub", component: "Text", variant: "caption", text: "12–15 May · 2 guests · sample data" },
    {
      id: "filters",
      component: "ChoicePicker",
      label: "Filters",
      variant: "multipleSelection",
      displayStyle: "chips",
      options: FILTERS.map((filter) => ({ label: filter.label, value: filter.id })),
      value: { path: "/filters" },
    },
    { id: "list-note", component: "Row", justify: "spaceBetween", children: ["list-note-text", "clear"] },
    { id: "list-note-text", component: "Text", text: { path: "/listNote" } },
    {
      id: "clear",
      component: "Button",
      child: "clear-label",
      action: { event: { name: "clear_filters", context: {} } },
    },
    { id: "clear-label", component: "Text", text: "Clear filters" },
    { id: "stays", component: "List", children: { path: "/stays", componentId: "stay-card" } },
    { id: "stay-card", component: "Card", child: "stay-body" },
    {
      id: "stay-body",
      component: "Column",
      children: ["stay-photo", "stay-name", "stay-line", "stay-price", "stay-actions"],
    },
    {
      id: "stay-photo",
      component: "Image",
      url: { path: "url" },
      description: { path: "alt" },
      fit: "cover",
      variant: "largeFeature",
    },
    { id: "stay-name", component: "Text", variant: "h3", text: { path: "name" } },
    { id: "stay-line", component: "Text", variant: "caption", text: { path: "line" } },
    { id: "stay-price", component: "Text", text: { path: "price" } },
    { id: "stay-actions", component: "Row", justify: "spaceBetween", children: ["stay-save", "stay-open"] },
    {
      id: "stay-save",
      component: "Button",
      variant: "borderless",
      child: "stay-save-label",
      action: { event: { name: "toggle_save", context: { stay: { path: "id" } } } },
    },
    { id: "stay-save-label", component: "Text", text: { path: "saveLabel" } },
    {
      id: "stay-open",
      component: "Button",
      variant: "primary",
      child: "stay-open-label",
      action: { event: { name: "open_stay", context: { stay: { path: "id" } } } },
    },
    { id: "stay-open-label", component: "Text", text: "View rooms" },
  ];
}

function thumbComponents(): A2UIComponent[] {
  // Every stay has three photos, so the detail view has three thumbnail buttons.
  return [0, 1, 2].flatMap((index): A2UIComponent[] => [
    {
      id: `thumb-${index}`,
      component: "Button",
      variant: "borderless",
      child: `thumb-${index}-img`,
      action: { event: { name: "show_photo", context: { index } } },
    },
    {
      id: `thumb-${index}-img`,
      component: "Image",
      url: { path: `/detail/thumbs/${index}/url` },
      description: { path: `/detail/thumbs/${index}/alt` },
      fit: "cover",
      variant: "smallFeature",
    },
  ]);
}

/**
 * A row with a label and − / + buttons. Each button sends change_booking with its field and a
 * delta of one. The app clamps the result to the field's range.
 */
function stepperComponents(field: "nights" | "guests", label: string): A2UIComponent[] {
  return [
    { id: `${field}-row`, component: "Row", justify: "spaceBetween", children: [`${field}-label`, `${field}-stepper`] },
    { id: `${field}-label`, component: "Text", text: label },
    { id: `${field}-stepper`, component: "Row", children: [`${field}-minus`, `${field}-value`, `${field}-plus`] },
    {
      id: `${field}-minus`,
      component: "Button",
      child: `${field}-minus-label`,
      action: { event: { name: "change_booking", context: { field, delta: -1 } } },
    },
    { id: `${field}-minus-label`, component: "Text", text: "−" },
    { id: `${field}-value`, component: "Text", variant: "h3", text: { path: `/booking/${field}Text` } },
    {
      id: `${field}-plus`,
      component: "Button",
      child: `${field}-plus-label`,
      action: { event: { name: "change_booking", context: { field, delta: 1 } } },
    },
    { id: `${field}-plus-label`, component: "Text", text: "+" },
  ];
}

function detailComponents(): A2UIComponent[] {
  return [
    { id: "root", component: "Column", children: ["back", "detail"] },
    {
      id: "back",
      component: "Button",
      variant: "borderless",
      child: "back-label",
      action: { event: { name: "back_to_stays", context: {} } },
    },
    { id: "back-label", component: "Text", text: "← Back to stays" },
    { id: "detail", component: "Row", children: ["gallery", "info"] },
    { id: "gallery", component: "Column", children: ["main-photo", "thumbs", "photo-label"] },
    {
      id: "main-photo",
      component: "Image",
      url: { path: "/detail/main/url" },
      description: { path: "/detail/main/alt" },
      fit: "cover",
      variant: "largeFeature",
    },
    { id: "thumbs", component: "Row", children: ["thumb-0", "thumb-1", "thumb-2"] },
    ...thumbComponents(),
    ...stepperComponents("nights", "Nights"),
    ...stepperComponents("guests", "Guests"),
    { id: "photo-label", component: "Text", variant: "caption", text: { path: "/detail/photoLabel" } },
    { id: "info", component: "Column", children: ["name", "line", "amenities", "booking"] },
    { id: "name", component: "Text", variant: "h2", text: { path: "/selected/name" } },
    { id: "line", component: "Text", variant: "caption", text: { path: "/selected/line" } },
    { id: "amenities", component: "Text", text: { path: "/selected/amenities" } },
    { id: "booking", component: "Card", child: "booking-body" },
    {
      id: "booking-body",
      component: "Column",
      children: ["nights-row", "guests-row", "room", "totals", "reserve"],
    },
    {
      id: "room",
      component: "ChoicePicker",
      label: "Room",
      variant: "mutuallyExclusive",
      options: [
        { label: "City view · included", value: "city" },
        { label: `River view · +${formatEur(RIVER_VIEW_EXTRA_PER_NIGHT)} a night`, value: "river" },
      ],
      value: { path: "/booking/room" },
    },
    { id: "totals", component: "Column", children: ["base-row", "extra-row", "total-row"] },
    { id: "base-row", component: "Row", justify: "spaceBetween", children: ["base-label", "base-amount"] },
    { id: "base-label", component: "Text", variant: "caption", text: { path: "/totals/baseLabel" } },
    { id: "base-amount", component: "Text", text: { path: "/totals/baseAmount" } },
    { id: "extra-row", component: "Row", justify: "spaceBetween", children: ["extra-label", "extra-amount"] },
    { id: "extra-label", component: "Text", variant: "caption", text: { path: "/totals/extraLabel" } },
    { id: "extra-amount", component: "Text", text: { path: "/totals/extraAmount" } },
    { id: "total-row", component: "Row", justify: "spaceBetween", children: ["total-label", "total-amount"] },
    { id: "total-label", component: "Text", variant: "h3", text: "Total" },
    { id: "total-amount", component: "Text", variant: "h3", text: { path: "/totals/totalAmount" } },
    {
      id: "reserve",
      component: "Button",
      variant: "primary",
      child: "reserve-label",
      action: {
        event: {
          name: "reserve_room",
          context: {
            stay: { path: "/selected/id" },
            nights: { path: "/booking/nights" },
            guests: { path: "/booking/guests" },
            room: { path: "/booking/room" },
          },
        },
      },
    },
    { id: "reserve-label", component: "Text", text: { path: "/totals/reserveLabel" } },
  ];
}

function doneComponents(): A2UIComponent[] {
  return [
    { id: "root", component: "Column", children: ["done-photo", "done-title", "done-summary", "done-note", "done-back"] },
    {
      id: "done-photo",
      component: "Image",
      url: { path: "/done/photo/url" },
      description: { path: "/done/photo/alt" },
      fit: "cover",
      variant: "largeFeature",
    },
    { id: "done-title", component: "Text", variant: "h2", text: "Booking requested" },
    { id: "done-summary", component: "Text", variant: "caption", text: { path: "/done/summary" } },
    { id: "done-note", component: "Text", text: "We’ll email you as soon as the hotel confirms." },
    {
      id: "done-back",
      component: "Button",
      child: "done-back-label",
      action: { event: { name: "back_to_stays", context: {} } },
    },
    { id: "done-back-label", component: "Text", text: "Back to stays" },
  ];
}

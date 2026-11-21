/**
 * The hotel agent: a deterministic stand-in for a model. Given the app state it describes the
 * screen with A2UI v1.0 components from the Basic catalog, and the data those components read.
 * It calls no model and it sends no code. Every message is produced through the producer.
 */
import type { A2UIComponent, JsonObject } from "@cylayo/weaver-core";
import { FILTERS, PHOTO_ALT, RIVER_VIEW_EXTRA_PER_NIGHT, type FilterId, type Hotel, type HotelId, type ImageKey, type RoomId } from "../data.js";
import { imageSource } from "../images.js";
import { bookingTotals, findHotel, formatEur, roomName, visibleHotels } from "../model.js";
import { bind, heading } from "../a2ui.js";

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
    title: heading(3, hotel.name),
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
      title: heading(2, hotel.name),
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
      nightsTitle: heading(3, String(state.nights)),
      guestsTitle: heading(3, String(state.guests)),
    },
    totals: {
      baseLabel: `${formatEur(totals.basePerNight)} × ${state.nights} nights`,
      baseAmount: formatEur(totals.baseTotal),
      extraLabel: river ? `River view × ${state.nights}` : "",
      extraAmount: river ? formatEur(totals.extraTotal) : "",
      totalAmount: formatEur(totals.total),
      totalTitle: heading(3, formatEur(totals.total)),
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
    { id: "root", component: "Column", children: ["list_title", "list_sub", "filters", "list_note", "stays"] },
    { id: "list_title", component: "Text", text: heading(2, "Modern stays in Lisbon") },
    { id: "list_sub", component: "Text", variant: "caption", text: "12–15 May · 2 guests · sample data" },
    {
      id: "filters",
      component: "ChoicePicker",
      label: "Filters",
      variant: "multipleSelection",
      displayStyle: "chips",
      options: FILTERS.map((filter) => ({ label: filter.label, value: filter.id })),
      value: bind("/filters"),
    },
    { id: "list_note", component: "Row", justify: "spaceBetween", children: ["list_note_text", "clear"] },
    { id: "list_note_text", component: "Text", text: bind("/listNote") },
    {
      id: "clear",
      component: "Button",
      child: "clear_label",
      action: { event: { name: "clear_filters", context: {} } },
    },
    { id: "clear_label", component: "Text", text: "Clear filters" },
    { id: "stays", component: "List", children: { componentId: "stay_card", path: "/stays" } },
    { id: "stay_card", component: "Card", child: "stay_body" },
    {
      id: "stay_body",
      component: "Column",
      children: ["stay_photo", "stay_name", "stay_line", "stay_price", "stay_actions"],
    },
    {
      id: "stay_photo",
      component: "Image",
      url: bind("url"),
      description: bind("alt"),
      fit: "cover",
      variant: "largeFeature",
    },
    { id: "stay_name", component: "Text", text: bind("title") },
    { id: "stay_line", component: "Text", variant: "caption", text: bind("line") },
    { id: "stay_price", component: "Text", text: bind("price") },
    { id: "stay_actions", component: "Row", justify: "spaceBetween", children: ["stay_save", "stay_open"] },
    {
      id: "stay_save",
      component: "Button",
      variant: "borderless",
      child: "stay_save_label",
      action: { event: { name: "toggle_save", context: { stay: bind("id") } } },
    },
    { id: "stay_save_label", component: "Text", text: bind("saveLabel") },
    {
      id: "stay_open",
      component: "Button",
      variant: "primary",
      child: "stay_open_label",
      action: { event: { name: "open_stay", context: { stay: bind("id") } } },
    },
    { id: "stay_open_label", component: "Text", text: "View rooms" },
  ];
}

function thumbComponents(): A2UIComponent[] {
  // Every stay has three photos, so the detail view has three thumbnail buttons.
  return [0, 1, 2].flatMap((index): A2UIComponent[] => [
    {
      id: `thumb_${index}`,
      component: "Button",
      variant: "borderless",
      child: `thumb_${index}_img`,
      action: { event: { name: "show_photo", context: { index } } },
    },
    {
      id: `thumb_${index}_img`,
      component: "Image",
      url: bind(`/detail/thumbs/${index}/url`),
      description: bind(`/detail/thumbs/${index}/alt`),
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
    { id: `${field}_row`, component: "Row", justify: "spaceBetween", children: [`${field}_label`, `${field}_stepper`] },
    { id: `${field}_label`, component: "Text", text: label },
    { id: `${field}_stepper`, component: "Row", children: [`${field}_minus`, `${field}_value`, `${field}_plus`] },
    {
      id: `${field}_minus`,
      component: "Button",
      child: `${field}_minus_label`,
      action: { event: { name: "change_booking", context: { field, delta: -1 } } },
    },
    { id: `${field}_minus_label`, component: "Text", text: "−" },
    { id: `${field}_value`, component: "Text", text: bind(`/booking/${field}Title`) },
    {
      id: `${field}_plus`,
      component: "Button",
      child: `${field}_plus_label`,
      action: { event: { name: "change_booking", context: { field, delta: 1 } } },
    },
    { id: `${field}_plus_label`, component: "Text", text: "+" },
  ];
}

function detailComponents(): A2UIComponent[] {
  return [
    { id: "root", component: "Column", children: ["back", "detail"] },
    {
      id: "back",
      component: "Button",
      variant: "borderless",
      child: "back_label",
      action: { event: { name: "back_to_stays", context: {} } },
    },
    { id: "back_label", component: "Text", text: "← Back to stays" },
    { id: "detail", component: "Row", children: ["gallery", "info"] },
    { id: "gallery", component: "Column", children: ["main_photo", "thumbs", "photo_label"] },
    {
      id: "main_photo",
      component: "Image",
      url: bind("/detail/main/url"),
      description: bind("/detail/main/alt"),
      fit: "cover",
      variant: "largeFeature",
    },
    { id: "thumbs", component: "Row", children: ["thumb_0", "thumb_1", "thumb_2"] },
    ...thumbComponents(),
    ...stepperComponents("nights", "Nights"),
    ...stepperComponents("guests", "Guests"),
    { id: "photo_label", component: "Text", variant: "caption", text: bind("/detail/photoLabel") },
    { id: "info", component: "Column", children: ["name", "line", "amenities", "booking"] },
    { id: "name", component: "Text", text: bind("/selected/title") },
    { id: "line", component: "Text", variant: "caption", text: bind("/selected/line") },
    { id: "amenities", component: "Text", text: bind("/selected/amenities") },
    { id: "booking", component: "Card", child: "booking_body" },
    {
      id: "booking_body",
      component: "Column",
      children: ["nights_row", "guests_row", "room", "totals", "reserve"],
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
      value: bind("/booking/room"),
    },
    { id: "totals", component: "Column", children: ["base_row", "extra_row", "total_row"] },
    { id: "base_row", component: "Row", justify: "spaceBetween", children: ["base_label", "base_amount"] },
    { id: "base_label", component: "Text", variant: "caption", text: bind("/totals/baseLabel") },
    { id: "base_amount", component: "Text", text: bind("/totals/baseAmount") },
    { id: "extra_row", component: "Row", justify: "spaceBetween", children: ["extra_label", "extra_amount"] },
    { id: "extra_label", component: "Text", variant: "caption", text: bind("/totals/extraLabel") },
    { id: "extra_amount", component: "Text", text: bind("/totals/extraAmount") },
    { id: "total_row", component: "Row", justify: "spaceBetween", children: ["total_label", "total_amount"] },
    { id: "total_label", component: "Text", text: heading(3, "Total") },
    { id: "total_amount", component: "Text", text: bind("/totals/totalTitle") },
    {
      id: "reserve",
      component: "Button",
      variant: "primary",
      child: "reserve_label",
      action: {
        event: {
          name: "reserve_room",
          context: {
            stay: bind("/selected/id"),
            nights: bind("/booking/nights"),
            guests: bind("/booking/guests"),
            room: bind("/booking/room"),
          },
        },
      },
    },
    { id: "reserve_label", component: "Text", text: bind("/totals/reserveLabel") },
  ];
}

function doneComponents(): A2UIComponent[] {
  return [
    { id: "root", component: "Column", children: ["done_photo", "done_title", "done_summary", "done_note", "done_back"] },
    {
      id: "done_photo",
      component: "Image",
      url: bind("/done/photo/url"),
      description: bind("/done/photo/alt"),
      fit: "cover",
      variant: "largeFeature",
    },
    { id: "done_title", component: "Text", text: heading(2, "Booking requested") },
    { id: "done_summary", component: "Text", variant: "caption", text: bind("/done/summary") },
    { id: "done_note", component: "Text", text: "We’ll email you as soon as the hotel confirms." },
    {
      id: "done_back",
      component: "Button",
      child: "done_back_label",
      action: { event: { name: "back_to_stays", context: {} } },
    },
    { id: "done_back_label", component: "Text", text: "Back to stays" },
  ];
}

/**
 * Static content for the agent-app demo, copied from the design spec (Demo.dc.html).
 *
 * TODO(weaver-runtime): this demo mirrors the mocked agent app. A follow-up PR should run it on
 * the real Weaver runtime (createBasicWebRuntime and the reference app's A2UI messages) instead.
 */

export type ScenarioId = "hotel" | "food" | "trip";
export type HotelView = "list" | "detail" | "done";
export type FilterId = "pool" | "view" | "historic" | "design";
export type HotelId = "miradouro" | "amarela" | "tejo" | "marques";
export type DishId = "pizza" | "pasta" | "salmon" | "salad" | "cake" | "nata";
export type RoomId = "city" | "river";

/** Photo keys. Each one maps to a file in public/images (see IMAGE_FILES). */
export type ImageKey =
  | "tejo"
  | "azulejo"
  | "ribeira"
  | "lobby"
  | "bed"
  | "bath"
  | "lounge"
  | "pizza"
  | "pasta"
  | "salmon"
  | "salad"
  | "cake"
  | "nata"
  | "tram"
  | "belem"
  | "pena"
  | "alfama"
  | "lx";

/** Photo file names, without the .jpg extension. Credits are in public/images/CREDITS.md. */
export const IMAGE_FILES: Readonly<Record<ImageKey, string>> = {
  tejo: "hotel-tejo",
  azulejo: "hotel-azulejo",
  ribeira: "hotel-ribeira",
  lobby: "room-lobby",
  bed: "room-bed",
  bath: "room-bath",
  lounge: "room-lounge",
  pizza: "food-pizza",
  pasta: "food-pasta",
  salmon: "food-salmon",
  salad: "food-salad",
  cake: "food-cake",
  nata: "food-nata",
  tram: "trip-tram",
  belem: "trip-belem",
  pena: "trip-pena",
  alfama: "trip-alfama",
  lx: "trip-lx",
};

/** Intrinsic pixel sizes of the photo files, used for width and height attributes. */
export const IMAGE_SIZE: Readonly<Record<ImageKey, { width: number; height: number }>> = {
  tejo: { width: 960, height: 640 },
  azulejo: { width: 960, height: 640 },
  ribeira: { width: 960, height: 640 },
  lobby: { width: 960, height: 640 },
  bed: { width: 960, height: 640 },
  bath: { width: 960, height: 640 },
  lounge: { width: 960, height: 640 },
  pizza: { width: 640, height: 640 },
  pasta: { width: 640, height: 640 },
  salmon: { width: 640, height: 640 },
  salad: { width: 640, height: 640 },
  cake: { width: 640, height: 640 },
  nata: { width: 640, height: 640 },
  tram: { width: 960, height: 640 },
  belem: { width: 960, height: 640 },
  pena: { width: 960, height: 640 },
  alfama: { width: 960, height: 640 },
  lx: { width: 960, height: 640 },
};

/** Alt text for the hotel and room photos. */
export const PHOTO_ALT: Readonly<Partial<Record<ImageKey, string>>> = {
  tejo: "Infinity pool with loungers by the sea",
  azulejo: "Yellow façade with wrought-iron balconies",
  ribeira: "Bedroom window looking straight out to sea",
  lobby: "Dark marble reception desk with warm lighting",
  bed: "Bedroom with a stone wall and a round mirror",
  bath: "Freestanding bathtub beside a plant",
  lounge: "Suite with armchairs and a writing desk",
};

export const SCENARIOS: ReadonlyArray<{ id: ScenarioId; label: string; prompt: string }> = [
  { id: "hotel", label: "Book a hotel in Lisbon", prompt: "Find me a hotel in Lisbon with a modern design" },
  { id: "food", label: "Order dinner for four", prompt: "Order dinner for four from somewhere nearby" },
  { id: "trip", label: "Plan three days in Lisbon", prompt: "Plan three days in Lisbon for me" },
];

export const FILTERS: ReadonlyArray<{ id: FilterId; label: string }> = [
  { id: "pool", label: "Pool" },
  { id: "view", label: "Sea view" },
  { id: "historic", label: "Historic" },
  { id: "design", label: "Design" },
];

export interface Hotel {
  id: HotelId;
  name: string;
  area: string;
  rating: string;
  price: number;
  tags: readonly FilterId[];
  tagLine: string;
  photos: readonly ImageKey[];
  amenities: readonly string[];
}

export const HOTELS: readonly Hotel[] = [
  {
    id: "miradouro",
    name: "Miradouro Pool House",
    area: "Graça",
    rating: "4.9",
    price: 260,
    tags: ["pool", "view", "design"],
    tagLine: "Infinity pool",
    photos: ["tejo", "bed", "bath"],
    amenities: ["Infinity pool", "Sea view", "Breakfast"],
  },
  {
    id: "amarela",
    name: "Casa Amarela",
    area: "Chiado",
    rating: "4.7",
    price: 180,
    tags: ["historic"],
    tagLine: "1890s townhouse",
    photos: ["azulejo", "lounge", "bed"],
    amenities: ["Historic building", "Balconies", "Free Wi-Fi"],
  },
  {
    id: "tejo",
    name: "Tejo Sea Rooms",
    area: "Cais do Sodré",
    rating: "4.8",
    price: 220,
    tags: ["view", "design"],
    tagLine: "Every room faces the sea",
    photos: ["ribeira", "bath", "lounge"],
    amenities: ["Sea view", "Late checkout", "Rain shower"],
  },
  {
    id: "marques",
    name: "Marquês Suites",
    area: "Avenida",
    rating: "4.6",
    price: 205,
    tags: ["design", "historic"],
    tagLine: "Marble lobby bar",
    photos: ["lobby", "lounge", "bath"],
    amenities: ["Lobby bar", "Suites", "Gym"],
  },
];

export interface Dish {
  id: DishId;
  name: string;
  price: number;
  alt: string;
}

export const DISHES: readonly Dish[] = [
  { id: "pizza", name: "Margherita, wood-fired", price: 13, alt: "Sliced pizza with cherry tomatoes and rosemary" },
  { id: "pasta", name: "Penne al ragù", price: 12, alt: "Penne with meat sauce and grated cheese" },
  { id: "salmon", name: "Salmon, quinoa and greens", price: 17, alt: "Salmon fillet on quinoa with broccoli" },
  { id: "salad", name: "Garden salad", price: 8, alt: "Green salad in a wooden bowl" },
  { id: "cake", name: "Chocolate cake", price: 6, alt: "Chocolate layer cake with a slice cut" },
  { id: "nata", name: "Pastéis de nata (pair)", price: 4, alt: "Custard tarts on a plate" },
];

export interface Stop {
  id: string;
  img: ImageKey;
  alt: string;
  time: string;
  title: string;
  blurb: string;
  /** Duration in minutes. */
  min: number;
  /** Ticket cost in euros. */
  cost: number;
}

export interface TripDay {
  n: number;
  label: string;
  name: string;
  stops: readonly Stop[];
}

export const TRIP_DAYS: readonly TripDay[] = [
  {
    n: 1,
    label: "Day 1",
    name: "Old town",
    stops: [
      { id: "tram-28", img: "tram", alt: "Yellow tram on a street of historic buildings", time: "09:30", title: "Tram 28 through the old town", blurb: "Ride the yellow tram up through Graça and Alfama.", min: 60, cost: 3 },
      { id: "alfama-view", img: "alfama", alt: "Red rooftops of Alfama with a church dome", time: "11:00", title: "Alfama viewpoints", blurb: "Look over the red rooftops toward the river.", min: 90, cost: 0 },
      { id: "nata-tasting", img: "nata", alt: "Custard tarts on a plate", time: "15:30", title: "Pastéis de nata tasting", blurb: "Custard tarts, warm from the oven.", min: 45, cost: 6 },
    ],
  },
  {
    n: 2,
    label: "Day 2",
    name: "Belém and LX",
    stops: [
      { id: "belem-tower", img: "belem", alt: "Belém Tower at the water’s edge", time: "10:00", title: "Belém Tower", blurb: "The riverside tower at the mouth of the Tagus.", min: 90, cost: 10 },
      { id: "lx-factory", img: "lx", alt: "Street of shops and cafés under a bridge", time: "14:00", title: "LX Factory", blurb: "Shops, cafés and a bookshop under the bridge.", min: 120, cost: 0 },
    ],
  },
  {
    n: 3,
    label: "Day 3",
    name: "Sintra",
    stops: [
      { id: "pena-palace", img: "pena", alt: "Red and yellow Pena Palace on a hilltop", time: "09:00", title: "Pena Palace, Sintra", blurb: "Train to Sintra, then the hilltop palace and gardens.", min: 300, cost: 20 },
      { id: "dinner-river", img: "salmon", alt: "Salmon fillet on quinoa with broccoli", time: "19:30", title: "Dinner by the river", blurb: "Back in Lisbon for a slow last dinner.", min: 90, cost: 35 },
    ],
  },
];

/** Stop ids skipped when the demo starts. */
export const INITIAL_SKIPPED_STOPS: readonly string[] = ["dinner-river"];

export const FOOD_DELIVERY_FEE = 3.5;
export const RIVER_VIEW_EXTRA_PER_NIGHT = 45;
export const MIN_NIGHTS = 1;
export const MAX_NIGHTS = 14;
export const MIN_GUESTS = 1;
export const MAX_GUESTS = 6;

export interface ScenarioSpec {
  /** Describes the A2UI messages the agent sent, for step 1. */
  messages: string;
  /** The action name the main button sends to the app. */
  action: string;
  /** The formatted A2UI sample shown under "See the A2UI the agent sent". */
  a2ui: string;
  a2uiFile: string;
}

export const SCENARIO_SPECS: Readonly<Record<ScenarioId, ScenarioSpec>> = {
  hotel: {
    messages: "3 messages describing a List of Cards, each with an Image, Text and Buttons, plus a ChoicePicker for the room.",
    action: "reserve_room",
    a2uiFile: "hotel.jsonl · formatted",
    a2ui: '{"version":"v0.9.1","updateComponents":{"surfaceId":"stays","components":[\n  {"id":"root","component":"Column","children":["title","filters","results"]},\n  {"id":"results","component":"List","children":{"componentId":"stay","path":"/stays"}},\n  {"id":"stay","component":"Card","child":"stay-body"},\n  {"id":"photo","component":"Image","url":{"path":"photo"},"description":{"path":"alt"}},\n  {"id":"room","component":"ChoicePicker", …},\n  {"id":"reserve","component":"Button","child":"reserve-label",\n   "action":{"event":{"name":"reserve_room","context":{"stay":{"path":"/selected/id"},"nights":{"path":"/booking/nights"}}}}},\n  …]}}',
  },
  food: {
    messages: "3 messages describing a List of dishes with Images, prices and your own Stepper component.",
    action: "place_order",
    a2uiFile: "food.jsonl · formatted",
    a2ui: '{"version":"v0.9.1","updateComponents":{"surfaceId":"order","components":[\n  {"id":"root","component":"Row","children":["menu","basket"]},\n  {"id":"menu","component":"List","children":{"componentId":"dish","path":"/menu"}},\n  {"id":"dish-photo","component":"Image","url":{"path":"photo"}},\n  {"id":"dish-qty","component":"Stepper","value":{"path":"qty"}},\n  {"id":"place","component":"Button","child":"place-label",\n   "action":{"event":{"name":"place_order","context":{"items":{"path":"/order"}}}}},\n  …]}}',
  },
  trip: {
    messages: "3 messages describing Tabs for the days and a List of stops with Images and CheckBoxes.",
    action: "add_to_calendar",
    a2uiFile: "trip.jsonl · formatted",
    a2ui: '{"version":"v0.9.1","updateComponents":{"surfaceId":"trip","components":[\n  {"id":"root","component":"Column","children":["title","days","save"]},\n  {"id":"days","component":"Tabs", …},\n  {"id":"stops","component":"List","children":{"componentId":"stop","path":"/days/0/stops"}},\n  {"id":"stop-photo","component":"Image","url":{"path":"photo"}},\n  {"id":"include","component":"CheckBox","value":{"path":"included"}},\n  {"id":"save","component":"Button","child":"save-label",\n   "action":{"event":{"name":"add_to_calendar","context":{"plan":{"path":"/days"}}}}},\n  …]}}',
  },
};

/** Copy for the "How Weaver built this" panel. */
export const STEP_BODIES = {
  checked: "Each one was checked against the components you registered. Anything else is turned away with a clear error.",
  drawn: "Each A2UI component maps to one you registered, so the screen matches your app’s design. Photos load only from addresses your media policy allows.",
  notSent: (action: string): string =>
    "Each change updates the interface’s data inside Weaver. The main button sends " + action + " to your code, which decides what happens next.",
  sent: (action: string): string =>
    "Your code just received " + action + " with everything on screen attached. It decides what happens next: payment, an email, anything.",
} as const;

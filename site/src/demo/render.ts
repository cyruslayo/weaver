/**
 * DOM for the agent-app demo. Nodes are built with createElement, createElementNS and
 * textContent only: nothing here uses innerHTML or evaluates text.
 *
 * The whole demo re-renders from DemoState after each action (the state is small). Keyboard
 * focus is restored by data-focus key, and the "See the A2UI" disclosure keeps its own open flag
 * so a re-render does not collapse it.
 */
import {
  DISHES,
  FILTERS,
  IMAGE_FILES,
  IMAGE_SIZE,
  MAX_GUESTS,
  MAX_NIGHTS,
  MIN_GUESTS,
  MIN_NIGHTS,
  PHOTO_ALT,
  SCENARIOS,
  SCENARIO_SPECS,
  type Dish,
  type Hotel,
  type ImageKey,
  type RoomId,
  type Stop,
  type TripDay,
} from "./data.js";
import {
  basketLines,
  bookingTotals,
  dayByNumber,
  dayLabel,
  daySummary,
  findHotel,
  foodItemCount,
  foodTotal,
  formatEur,
  includedStops,
  initialDemoState,
  panelSteps,
  reduceDemo,
  roomName,
  stopMeta,
  tripSummary,
  visibleHotels,
  type DemoAction,
  type DemoEvent,
  type DemoState,
} from "./model.js";

type Child = Node | string | false | null | undefined;

interface Options {
  className?: string;
  text?: string;
  attrs?: Record<string, string>;
  /** Boolean attributes such as "disabled" or "checked". */
  flags?: readonly string[];
  focusKey?: string;
  on?: Record<string, (event: Event) => void>;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: Options = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs ?? {})) node.setAttribute(name, value);
  for (const name of options.flags ?? []) node.setAttribute(name, "");
  if (options.focusKey) node.dataset.focus = options.focusKey;
  for (const [type, handler] of Object.entries(options.on ?? {})) node.addEventListener(type, handler);
  for (const child of children) {
    if (child === false || child === null || child === undefined) continue;
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

const SVG_NS = "http://www.w3.org/2000/svg";

const ICON = {
  arrowRight: ["M5 12h14", "M13 6l6 6-6 6"],
  arrowLeft: ["M19 12H5", "M11 6l-6 6 6 6"],
  check: ["M5 12l5 5L20 7"],
  layers: ["M12 3l9 5-9 5-9-5z", "M3 13l9 5 9-5"],
  heart: ["M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"],
  star: ["M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.3L12 17.5 6.4 20.4l1.1-6.3L3 9.7l6.2-.9z"],
  send: ["M12 19V5M6 11l6-6 6 6"],
  chevronDown: ["M6 9l6 6 6-6"],
} as const;

interface IconOptions {
  size: number;
  strokeWidth?: number;
  filled?: boolean;
}

/** A decorative inline icon. Filled icons use currentColor and no stroke. */
function icon(paths: readonly string[], options: IconOptions): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(options.size));
  svg.setAttribute("height", String(options.size));
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  if (options.filled) {
    svg.setAttribute("fill", "currentColor");
  } else {
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", String(options.strokeWidth ?? 2));
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
  }
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

/** Image URLs are resolved against the site base so the Pages subpath works. */
function imageUrl(baseUrl: string, key: ImageKey): string {
  return `${baseUrl}images/${IMAGE_FILES[key]}.jpg`;
}

function photo(baseUrl: string, key: ImageKey, alt: string, className: string): HTMLImageElement {
  const size = IMAGE_SIZE[key];
  return el("img", {
    className: "d-img " + className,
    attrs: {
      src: imageUrl(baseUrl, key),
      alt,
      loading: "lazy",
      decoding: "async",
      width: String(size.width),
      height: String(size.height),
    },
  });
}

/** Shared pieces of a demo view, built from the state and the dispatcher. */
interface Ctx {
  state: DemoState;
  ui: { a2uiOpen: boolean };
  baseUrl: string;
  dispatch: (action: DemoAction, focusKey?: string) => void;
  setA2uiOpen: (open: boolean) => void;
}

function chipClass(on: boolean): string {
  return on ? "d-chip is-on" : "d-chip";
}

// ---- Header: window bar and chips ----------------------------------------------------------

function windowBar(ctx: Ctx): HTMLElement {
  const toggle = el(
    "button",
    {
      className: chipClass(!ctx.state.panelOpen),
      attrs: {
        type: "button",
        "aria-expanded": String(ctx.state.panelOpen),
        "aria-controls": "d-panel",
      },
      focusKey: "panel-toggle",
      on: { click: () => ctx.dispatch({ type: "togglePanel" }, "panel-toggle") },
    },
    ctx.state.panelOpen ? "Hide how it works" : "How it works",
  );
  return el(
    "div",
    { className: "d-bar" },
    el("span", { className: "d-dot", attrs: { "aria-hidden": "true" } }),
    el("span", { className: "d-dot", attrs: { "aria-hidden": "true" } }),
    el("span", { className: "d-dot", attrs: { "aria-hidden": "true" } }),
    el("span", { className: "d-appname", text: "Your app" }),
    el("span", { className: "wv-badge wv-badge-muted", text: "rendered by Weaver" }),
    el("span", { className: "d-spacer" }),
    toggle,
  );
}

function scenarioChips(ctx: Ctx): HTMLElement {
  const chips = SCENARIOS.map((scenario) => {
    const on = scenario.id === ctx.state.scenario;
    return el(
      "button",
      {
        className: chipClass(on),
        attrs: { type: "button", "aria-pressed": String(on) },
        focusKey: "scenario-" + scenario.id,
        on: {
          click: () => ctx.dispatch({ type: "pickScenario", scenario: scenario.id }, "scenario-" + scenario.id),
        },
      },
      scenario.label,
    );
  });
  return el(
    "div",
    { className: "d-chips" },
    el("span", { className: "d-chips-label", text: "Try a request" }),
    ...chips,
  );
}

function agentRow(): HTMLElement {
  return el(
    "div",
    { className: "d-agent" },
    el("span", { className: "d-avatar" }, icon(ICON.layers, { size: 15, strokeWidth: 2 })),
    el("span", { className: "d-agent-name", text: "Agent" }),
    el("span", { className: "d-agent-note", text: "replied with an interface. Try it." }),
  );
}

function composer(): HTMLElement {
  return el(
    "div",
    { className: "d-composer" },
    el("label", { className: "d-sr", text: "Message your agent", attrs: { for: "d-composer-input" } }),
    el("input", {
      className: "d-composer-input",
      attrs: { id: "d-composer-input", type: "text", placeholder: "Try one of the requests above" },
      flags: ["disabled"],
    }),
    el(
      "button",
      {
        className: "d-send",
        attrs: { type: "button", "aria-label": "Send (not available in this demo)" },
        flags: ["disabled"],
      },
      icon(ICON.send, { size: 16, strokeWidth: 2 }),
    ),
  );
}

// ---- Hotel ---------------------------------------------------------------------------------

function hotelList(ctx: Ctx): HTMLElement[] {
  const { state, dispatch } = ctx;
  const shown = visibleHotels(state.filters);
  const filterChipsNodes = FILTERS.map((filter) => {
    const on = state.filters[filter.id] === true;
    return el(
      "button",
      {
        className: chipClass(on),
        attrs: { type: "button", "aria-pressed": String(on) },
        focusKey: "filter-" + filter.id,
        on: { click: () => dispatch({ type: "toggleFilter", filter: filter.id }, "filter-" + filter.id) },
      },
      filter.label,
    );
  });

  const header = el(
    "div",
    { className: "d-head-row" },
    el(
      "div",
      {},
      el("h3", { className: "d-title", text: "Modern stays in Lisbon" }),
      el("p", { className: "d-sub", text: "12–15 May · 2 guests · sample data" }),
    ),
    el("div", { className: "d-filters", attrs: { role: "group", "aria-label": "Filters" } }, ...filterChipsNodes),
  );

  const nodes: HTMLElement[] = [header];
  if (shown.length === 0) {
    nodes.push(
      el(
        "div",
        { className: "d-empty-box" },
        el("p", { className: "d-empty-text", text: "No stays match every filter." }),
        el(
          "button",
          {
            className: "d-pill d-quiet",
            attrs: { type: "button" },
            focusKey: "clear-filters",
            on: { click: () => dispatch({ type: "clearFilters" }, "clear-filters") },
          },
          "Clear filters",
        ),
      ),
    );
  }
  nodes.push(el("div", { className: "d-hotels" }, ...shown.map((hotel) => hotelCard(ctx, hotel))));
  return nodes;
}

function hotelCard(ctx: Ctx, hotel: Hotel): HTMLElement {
  const saved = ctx.state.saved[hotel.id] === true;
  const leadKey = hotel.photos[0] ?? "tejo";
  const heart = icon(ICON.heart, { size: 18, strokeWidth: 2, filled: saved });
  return el(
    "article",
    { className: "d-card" },
    el(
      "div",
      { className: "d-photo" },
      photo(ctx.baseUrl, leadKey, PHOTO_ALT[leadKey] ?? hotel.name, "d-ar-43 d-radius-14"),
      el(
        "button",
        {
          className: "d-save",
          attrs: {
            type: "button",
            "aria-pressed": String(saved),
            "aria-label": (saved ? "Remove " : "Save ") + hotel.name,
          },
          focusKey: "save-" + hotel.id,
          on: { click: () => ctx.dispatch({ type: "toggleSaved", hotel: hotel.id }, "save-" + hotel.id) },
        },
        heart,
      ),
      el("span", { className: "d-tagline", text: hotel.tagLine }),
    ),
    el(
      "div",
      { className: "d-card-row" },
      el(
        "div",
        { className: "d-minw" },
        el("p", { className: "d-name", text: hotel.name }),
        el("p", { className: "d-area", text: hotel.area }),
      ),
      el(
        "span",
        { className: "d-rating" },
        icon(ICON.star, { size: 13, filled: true }),
        hotel.rating,
      ),
    ),
    el(
      "div",
      { className: "d-card-row" },
      el("span", { className: "d-price" }, el("strong", { text: formatEur(hotel.price) }), " ", el("span", { className: "d-muted", text: "a night" })),
      el(
        "button",
        {
          className: "d-pill d-primary d-small",
          attrs: { type: "button" },
          focusKey: "open-" + hotel.id,
          on: { click: () => ctx.dispatch({ type: "openHotel", hotel: hotel.id }, "hotel-back") },
        },
        "View rooms",
      ),
    ),
  );
}

function stepper(
  label: string,
  value: number,
  min: number,
  max: number,
  dec: () => void,
  inc: () => void,
  keyPrefix: string,
  decLabel: string,
  incLabel: string,
): HTMLElement {
  return el(
    "div",
    { className: "d-stepper-row" },
    el("span", { className: "d-row-label", text: label }),
    el(
      "div",
      { className: "d-stepper" },
      el(
        "button",
        {
          className: "d-step",
          attrs: { type: "button", "aria-label": decLabel },
          flags: value <= min ? ["disabled"] : [],
          focusKey: keyPrefix + "-dec",
          on: { click: dec },
        },
        "−",
      ),
      el("span", { className: "d-count", text: String(value) }),
      el(
        "button",
        {
          className: "d-step",
          attrs: { type: "button", "aria-label": incLabel },
          flags: value >= max ? ["disabled"] : [],
          focusKey: keyPrefix + "-inc",
          on: { click: inc },
        },
        "+",
      ),
    ),
  );
}

function hotelDetail(ctx: Ctx): HTMLElement[] {
  const { state, dispatch } = ctx;
  const hotel = findHotel(state.hotelId);
  const totals = bookingTotals(hotel, state.room, state.nights);
  const mainKey = hotel.photos[state.photo] ?? hotel.photos[0] ?? "tejo";
  const thumbs = hotel.photos.map((key, index) => {
    const on = index === state.photo;
    return el(
      "button",
      {
        className: "d-thumb" + (on ? " is-on" : ""),
        attrs: {
          type: "button",
          "aria-label": "Show photo " + (index + 1),
          "aria-pressed": String(on),
        },
        focusKey: "photo-" + index,
        on: { click: () => dispatch({ type: "pickPhoto", index }, "photo-" + index) },
      },
      photo(ctx.baseUrl, key, PHOTO_ALT[key] ?? hotel.name, "d-ar-32 d-radius-10"),
    );
  });

  const roomRadio = (room: RoomId, label: string, note: string): HTMLElement => {
    const checked = state.room === room;
    return el(
      "label",
      { className: "d-radio" },
      el("input", {
        attrs: { type: "radio", name: "d-room" },
        flags: checked ? ["checked"] : [],
        focusKey: "room-" + room,
        on: { change: () => dispatch({ type: "pickRoom", room }, "room-" + room) },
      }),
      el("span", { className: "d-radio-name", text: label }),
      el("span", { className: "d-muted", text: note }),
    );
  };

  const amenities = hotel.amenities.map((label) => el("span", { className: "d-amenity", text: label }));

  const totalsBlock = el(
    "div",
    { className: "d-totals" },
    el(
      "div",
      { className: "d-line" },
      el("span", { className: "d-muted", text: `${formatEur(totals.basePerNight)} × ${state.nights} nights` }),
      el("span", { text: formatEur(totals.baseTotal) }),
    ),
    state.room === "river"
      ? el(
          "div",
          { className: "d-line" },
          el("span", { className: "d-muted", text: `River view × ${state.nights}` }),
          el("span", { text: formatEur(totals.extraTotal) }),
        )
      : null,
    el(
      "div",
      { className: "d-line d-line-total" },
      el("span", { text: "Total" }),
      el("span", { text: formatEur(totals.total) }),
    ),
  );

  const back = el(
    "div",
    {},
    el(
      "button",
      {
        className: "d-pill d-ghost d-small",
        attrs: { type: "button" },
        focusKey: "hotel-back",
        on: { click: () => dispatch({ type: "backToList" }, "open-" + hotel.id) },
      },
      icon(ICON.arrowLeft, { size: 14, strokeWidth: 2 }),
      "Back to stays",
    ),
  );

  const booking = el(
    "div",
    { className: "d-booking" },
    stepper(
      "Nights",
      state.nights,
      MIN_NIGHTS,
      MAX_NIGHTS,
      () => dispatch({ type: "changeNights", delta: -1 }, "nights-dec"),
      () => dispatch({ type: "changeNights", delta: 1 }, "nights-inc"),
      "nights",
      "Fewer nights",
      "More nights",
    ),
    stepper(
      "Guests",
      state.guests,
      MIN_GUESTS,
      MAX_GUESTS,
      () => dispatch({ type: "changeGuests", delta: -1 }, "guests-dec"),
      () => dispatch({ type: "changeGuests", delta: 1 }, "guests-inc"),
      "guests",
      "Fewer guests",
      "More guests",
    ),
    el(
      "fieldset",
      { className: "d-room-set" },
      el("legend", { className: "d-room-legend", text: "Room" }),
      roomRadio("city", "City view", "included"),
      roomRadio("river", "River view", "+€45 a night"),
    ),
    totalsBlock,
    el(
      "button",
      {
        className: "d-pill d-primary d-block",
        attrs: { type: "button" },
        focusKey: "reserve",
        on: { click: () => dispatch({ type: "reserve" }, "done-heading") },
      },
      `Reserve for ${formatEur(totals.total)}`,
    ),
  );

  return [
    back,
    el(
      "div",
      { className: "d-detail" },
      el(
        "div",
        { className: "d-gallery" },
        photo(ctx.baseUrl, mainKey, PHOTO_ALT[mainKey] ?? hotel.name, "d-ar-32 d-radius-16"),
        el("div", { className: "d-thumbs" }, ...thumbs),
      ),
      el(
        "div",
        { className: "d-info" },
        el(
          "div",
          {},
          el("h3", { className: "d-title", text: hotel.name }),
          el("p", { className: "d-sub", text: `${hotel.area} · ★ ${hotel.rating} · ${formatEur(hotel.price)} a night` }),
        ),
        el("div", { className: "d-amenities" }, ...amenities),
        booking,
      ),
    ),
  ];
}

function hotelDone(ctx: Ctx): HTMLElement[] {
  const { state } = ctx;
  const hotel = findHotel(state.hotelId);
  const totals = bookingTotals(hotel, state.room, state.nights);
  return [
    el(
      "div",
      { className: "d-done-row" },
      photo(ctx.baseUrl, hotel.photos[0] ?? "tejo", PHOTO_ALT[hotel.photos[0] ?? "tejo"] ?? hotel.name, "d-ar-43 d-radius-16 d-done-photo"),
      el(
        "div",
        { className: "d-done-col" },
        el("span", { className: "d-check-badge" }, icon(ICON.check, { size: 22, strokeWidth: 2.5 })),
        el("h3", {
          className: "d-title d-tabfocus",
          attrs: { tabindex: "-1" },
          focusKey: "done-heading",
          text: "Booking requested",
        }),
        el("p", {
          className: "d-muted",
          text: `${hotel.name} · ${state.nights} nights · ${state.guests} guests · ${roomName(state.room)} · ${formatEur(totals.total)}`,
        }),
        el("p", { text: "We’ll email you as soon as the hotel confirms." }),
        el(
          "div",
          {},
          el(
            "button",
            {
              className: "d-pill d-quiet",
              attrs: { type: "button" },
              focusKey: "done-back",
              on: { click: () => ctx.dispatch({ type: "backToList" }, "open-" + hotel.id) },
            },
            "Back to stays",
          ),
        ),
      ),
    ),
  ];
}

// ---- Food ----------------------------------------------------------------------------------

function dishCard(ctx: Ctx, dish: Dish): HTMLElement {
  const qty = ctx.state.qty[dish.id];
  return el(
    "div",
    { className: "d-dish" },
    photo(ctx.baseUrl, dish.id, dish.alt, "d-ar-11 d-radius-14"),
    el(
      "div",
      {},
      el("p", { className: "d-dish-name", text: dish.name }),
      el("p", { className: "d-muted d-dish-price", text: formatEur(dish.price) }),
    ),
    el(
      "div",
      { className: "d-dish-stepper" },
      el(
        "button",
        {
          className: "d-step",
          attrs: { type: "button", "aria-label": "Remove one " + dish.name },
          flags: qty === 0 ? ["disabled"] : [],
          focusKey: "dish-dec-" + dish.id,
          on: { click: () => ctx.dispatch({ type: "setQty", dish: dish.id, qty: qty - 1 }, "dish-dec-" + dish.id) },
        },
        "−",
      ),
      el("span", { className: "d-count", text: String(qty), attrs: { "aria-live": "off" } }),
      el(
        "button",
        {
          className: "d-step",
          attrs: { type: "button", "aria-label": "Add one " + dish.name },
          focusKey: "dish-inc-" + dish.id,
          on: { click: () => ctx.dispatch({ type: "setQty", dish: dish.id, qty: qty + 1 }, "dish-inc-" + dish.id) },
        },
        "+",
      ),
    ),
  );
}

function foodMenu(ctx: Ctx): HTMLElement[] {
  const { state } = ctx;
  const lines = basketLines(state.qty);
  const empty = lines.length === 0;
  const basket = el(
    "div",
    { className: "d-basket" },
    el("p", { className: "d-basket-title", text: "Your order" }),
    empty ? el("p", { className: "d-muted", text: "Add dishes to start an order." }) : null,
    ...lines.map((line) =>
      el(
        "div",
        { className: "d-line" },
        el("span", { text: `${line.qty} × ${line.name}` }),
        el("span", { text: formatEur(line.amount) }),
      ),
    ),
    el(
      "div",
      { className: "d-totals" },
      el("div", { className: "d-line" }, el("span", { className: "d-muted", text: "Delivery" }), el("span", { text: formatEur(3.5) })),
      el(
        "div",
        { className: "d-line d-line-total" },
        el("span", { text: "Total" }),
        el("span", { text: formatEur(foodTotal(state.qty)) }),
      ),
    ),
    el(
      "button",
      {
        className: "d-pill d-primary d-block",
        attrs: { type: "button" },
        flags: empty ? ["disabled"] : [],
        focusKey: "place-order",
        on: { click: () => ctx.dispatch({ type: "placeOrder" }, "order-done-heading") },
      },
      `Place order · ${formatEur(foodTotal(state.qty))}`,
    ),
  );
  return [
    el(
      "div",
      {},
      el("h3", { className: "d-title", text: "Dinner for four from Tasca Nova" }),
      el("p", { className: "d-sub", text: "Delivers in about 40 minutes · sample menu and prices" }),
    ),
    el(
      "div",
      { className: "d-food" },
      el("div", { className: "d-dishes" }, ...DISHES.map((dish) => dishCard(ctx, dish))),
      basket,
    ),
  ];
}

function foodDone(ctx: Ctx): HTMLElement[] {
  const { state } = ctx;
  const lines = basketLines(state.qty);
  return [
    el(
      "div",
      { className: "d-done-col d-start" },
      el("span", { className: "d-check-badge" }, icon(ICON.check, { size: 22, strokeWidth: 2.5 })),
      el("h3", {
        className: "d-title d-tabfocus",
        attrs: { tabindex: "-1" },
        focusKey: "order-done-heading",
        text: "Order placed",
      }),
      el("p", {
        className: "d-muted",
        text: `${foodItemCount(state.qty)} items · ${formatEur(foodTotal(state.qty))} · arrives in about 40 minutes`,
      }),
      el(
        "div",
        { className: "d-thumb-row" },
        ...lines.map((line) => {
          const dish = DISHES.find((candidate) => candidate.id === line.id);
          return photo(ctx.baseUrl, line.id, dish?.alt ?? line.name, "d-thumb-72 d-radius-12");
        }),
      ),
      el(
        "button",
        {
          className: "d-pill d-quiet",
          attrs: { type: "button" },
          focusKey: "new-order",
          on: { click: () => ctx.dispatch({ type: "newOrder" }, "scenario-food") },
        },
        "Start a new order",
      ),
    ),
  ];
}

// ---- Trip ----------------------------------------------------------------------------------

function stopRow(ctx: Ctx, stop: Stop): HTMLElement {
  const included = !ctx.state.skip[stop.id];
  const checkboxId = "d-stop-" + stop.id;
  return el(
    "li",
    { className: "d-stop" + (included ? "" : " is-skipped") },
    photo(ctx.baseUrl, stop.img, stop.alt, "d-stop-photo d-radius-12"),
    el(
      "div",
      { className: "d-stop-text" },
      el("span", { className: "d-meta", text: `${stop.time} · ${stopMeta(stop)}` }),
      el("span", { className: "d-stop-title", text: stop.title }),
      el("span", { className: "d-muted d-stop-blurb", text: stop.blurb }),
    ),
    el(
      "label",
      { className: "d-include", attrs: { for: checkboxId } },
      el("input", {
        attrs: { id: checkboxId, type: "checkbox" },
        flags: included ? ["checked"] : [],
        focusKey: "stop-" + stop.id,
        on: { change: () => ctx.dispatch({ type: "toggleStop", stop: stop.id }, "stop-" + stop.id) },
      }),
      "Include",
      el("span", { className: "d-sr", text: " " + stop.title }),
    ),
  );
}

function tripPlan(ctx: Ctx): HTMLElement[] {
  const { state, dispatch } = ctx;
  const day = dayByNumber(state.day);
  const tabs = el(
    "div",
    {
      className: "d-days",
      attrs: { role: "tablist", "aria-label": "Days" },
      on: {
        keydown: (event) => {
          const key = (event as KeyboardEvent).key;
          const step = key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0;
          if (step === 0) return;
          event.preventDefault();
          const next = ((state.day - 1 + step + 3) % 3) + 1;
          dispatch({ type: "pickDay", day: next }, "day-" + next);
        },
      },
    },
    ...[1, 2, 3].map((n) => {
      const on = n === state.day;
      const dayData = dayByNumber(n);
      return el(
        "button",
        {
          className: "d-day-tab" + (on ? " is-on" : ""),
          attrs: {
            type: "button",
            role: "tab",
            "aria-selected": String(on),
            tabindex: on ? "0" : "-1",
            "aria-label": dayData.label + " · " + dayData.name,
          },
          focusKey: "day-" + n,
          on: {
            click: () => dispatch({ type: "pickDay", day: n }, "day-" + n),
          },
        },
        dayData.label,
      );
    }),
  );

  const stopList = el("ol", { className: "d-stops" }, ...day.stops.map((stop) => stopRow(ctx, stop)));

  return [
    el(
      "div",
      { className: "d-head-row" },
      el(
        "div",
        {},
        el("h3", { className: "d-title", text: "Three days in Lisbon" }),
        el("p", { className: "d-sub", text: `${tripSummary(state.skip)} · sample prices` }),
      ),
      tabs,
    ),
    stopList,
    el(
      "div",
      { className: "d-trip-foot" },
      el(
        "span",
        { className: "d-day-summary" },
        el("strong", { text: dayLabel(day) }),
        " ",
        el("span", { className: "d-muted", text: daySummary(day, state.skip) }),
      ),
      el(
        "button",
        {
          className: "d-pill d-primary",
          attrs: { type: "button" },
          focusKey: "add-calendar",
          on: { click: () => dispatch({ type: "addToCalendar" }, "trip-done-heading") },
        },
        "Add trip to calendar",
      ),
    ),
  ];
}

function tripDone(ctx: Ctx): HTMLElement[] {
  const { state } = ctx;
  const included = includedStops(state.skip);
  return [
    el(
      "div",
      { className: "d-done-col d-start" },
      el("span", { className: "d-check-badge" }, icon(ICON.check, { size: 22, strokeWidth: 2.5 })),
      el("h3", {
        className: "d-title d-tabfocus",
        attrs: { tabindex: "-1" },
        focusKey: "trip-done-heading",
        text: "Trip added to your calendar",
      }),
      el("p", { className: "d-muted", text: tripSummary(state.skip) }),
      el(
        "div",
        { className: "d-grid-thumbs" },
        ...included.map((stop) => photo(ctx.baseUrl, stop.img, stop.alt, "d-ar-43 d-radius-12")),
      ),
      el(
        "button",
        {
          className: "d-pill d-quiet",
          attrs: { type: "button" },
          focusKey: "edit-trip",
          on: { click: () => ctx.dispatch({ type: "editTrip" }, "add-calendar") },
        },
        "Edit the plan",
      ),
    ),
  ];
}

// ---- Surface -------------------------------------------------------------------------------

function surfaceBody(ctx: Ctx): HTMLElement[] {
  const { state } = ctx;
  if (state.scenario === "hotel") {
    if (state.hotelView === "list") return hotelList(ctx);
    if (state.hotelView === "detail") return hotelDetail(ctx);
    return hotelDone(ctx);
  }
  if (state.scenario === "food") return state.foodDone ? foodDone(ctx) : foodMenu(ctx);
  return state.tripDone ? tripDone(ctx) : tripPlan(ctx);
}

function surface(ctx: Ctx): HTMLElement {
  return el(
    "div",
    { className: "d-surface", attrs: { "data-theme": "light" } },
    ...surfaceBody(ctx),
  );
}

function chat(ctx: Ctx): HTMLElement {
  const scenario = SCENARIOS.find((candidate) => candidate.id === ctx.state.scenario);
  return el(
    "div",
    { className: "d-chat" },
    scenarioChips(ctx),
    el("p", { className: "d-prompt", text: scenario?.prompt ?? "" }),
    agentRow(),
    surface(ctx),
    composer(),
  );
}

// ---- Side panel ----------------------------------------------------------------------------

function eventRow(event: DemoEvent): HTMLElement {
  const action = event.kind === "Action";
  return el(
    "div",
    { className: "d-event" },
    el("span", { className: "d-kind " + (action ? "d-kind-action" : "d-kind-input"), text: event.kind }),
    el("span", { className: "d-mono d-event-text", text: event.text }),
  );
}

function sidePanel(ctx: Ctx): HTMLElement {
  const { state, ui } = ctx;
  const spec = SCENARIO_SPECS[state.scenario];
  const steps = panelSteps(state).map((step) =>
    el(
      "li",
      { className: "d-step-item" },
      el("span", { className: "d-step-n", text: String(step.n) }),
      el(
        "span",
        { className: "d-step-text" },
        el("span", { className: "d-step-title", text: step.title }),
        el("span", { className: "d-step-body", text: step.body }),
      ),
    ),
  );
  const events = state.events.length
    ? state.events.map((event) => eventRow(event))
    : [el("p", { className: "d-empty-note", text: "Use the interface. Every change and button press shows up here." })];

  const details = el(
    "details",
    {
      className: "d-details",
      attrs: ui.a2uiOpen ? { open: "" } : {},
      on: {
        toggle: (event) => ctx.setA2uiOpen((event.currentTarget as HTMLDetailsElement).open),
      },
    },
    el(
      "summary",
      {},
      el("span", { text: "See the A2UI the agent sent" }),
      icon(ICON.chevronDown, { size: 16, strokeWidth: 2 }),
    ),
    el(
      "figure",
      { className: "wv-code" },
      el("figcaption", { className: "wv-code-head" }, el("span", { text: spec.a2uiFile })),
      el("pre", {}, el("code", { text: spec.a2ui })),
    ),
  );

  return el(
    "aside",
    { className: "d-panel", attrs: { id: "d-panel", "aria-label": "How Weaver built this" } },
    el("p", { className: "d-panel-title", text: "How Weaver built this" }),
    el("ol", { className: "d-steps" }, ...steps),
    el(
      "div",
      { className: "d-events" },
      el("p", { className: "d-events-title", text: "What your app received" }),
      ...events,
    ),
    details,
  );
}

// ---- Root ----------------------------------------------------------------------------------

export interface MountOptions {
  /** Site base URL with a trailing slash, for example "/" or "/weaver/". */
  baseUrl: string;
}

/**
 * Mounts the demo into root and keeps it in sync with user input. Calling this once per page is
 * enough. Returns nothing: the demo owns the subtree of root.
 */
export function mountDemo(root: HTMLElement, options: MountOptions): void {
  const panelOpen = !window.matchMedia("(max-width: 760px)").matches;
  let state = initialDemoState(panelOpen);
  const ui = { a2uiOpen: false };

  function build(): HTMLElement {
    const ctx: Ctx = {
      state,
      ui,
      baseUrl: options.baseUrl,
      dispatch,
      setA2uiOpen: (open: boolean) => {
        ui.a2uiOpen = open;
      },
    };
    const body = el(
      "div",
      { className: "d-body" },
      chat(ctx),
      state.panelOpen ? sidePanel(ctx) : null,
    );
    return el(
      "div",
      { className: "d-root" },
      el(
        "div",
        { className: "d-window" },
        windowBar(ctx),
        body,
      ),
      el(
        "p",
        { className: "d-credit" },
        "Sample data. Photos from Unsplash by Yuliya Pankevich, Thomas Peham, David Kuvaev, Dylan Calluy, Marie Dehayes, Jared Rice, Antonio Araujo, Ivan Torres, Ben Lei, Ella Olsson, Mads Eneqvist, BraggsDiner, Magdalena Raczka, Aayush Gupta, Liam McKay, Lukas Bato, Maxence Bouniort and Julia Solonina.",
      ),
    );
  }

  function render(focusKey?: string): void {
    const active = document.activeElement;
    const keyToFocus =
      focusKey ?? (active instanceof HTMLElement && root.contains(active) ? active.dataset.focus : undefined);
    root.replaceChildren(build());
    if (keyToFocus) {
      const target = root.querySelector<HTMLElement>(`[data-focus="${CSS.escape(keyToFocus)}"]`);
      target?.focus({ preventScroll: true });
    }
  }

  function dispatch(action: DemoAction, focusKey?: string): void {
    state = reduceDemo(state, action);
    render(focusKey);
  }

  render();
}

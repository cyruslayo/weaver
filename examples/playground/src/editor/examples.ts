/**
 * Built-in Playground examples. Each one is JSONL text: one A2UI v0.9.1 message per
 * line, using only the Basic Catalog. Every example except `broken-output` must
 * process with zero rejected frames, and a test enforces that. `broken-output` is the
 * Support form with frame 3 cut off mid-JSON, so the Errors tab has a real rejection
 * to show.
 */

export const PLAYGROUND_CATALOG_ID = "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json";
export const PLAYGROUND_SURFACE_ID = "main";

export interface PlaygroundExample {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  /** True only for the example that is meant to produce a rejected frame. */
  readonly broken: boolean;
  readonly jsonl: string;
}

const CREATE_SURFACE = `{"version":"v0.9.1","createSurface":{"surfaceId":"main","catalogId":"${PLAYGROUND_CATALOG_ID}"}}`;

const HOTEL_BOOKING: string = [
  CREATE_SURFACE,
  `{"version":"v0.9.1","updateDataModel":{"surfaceId":"main","value":{"hotels":[{"name":"Hotel Tejo","city":"Lisbon","price":"€180 a night","photo":"samples/hotel-tejo.jpg"},{"name":"Azulejo House","city":"Porto","price":"€140 a night","photo":"samples/hotel-azulejo.jpg"},{"name":"Ribeira Rooms","city":"Lisbon","price":"€210 a night","photo":"samples/hotel-ribeira.jpg"}]}}}`,
  `{"version":"v0.9.1","updateComponents":{"surfaceId":"main","components":[{"id":"root","component":"Column","children":["heading","hotel-list"]},{"id":"heading","component":"Text","variant":"h2","text":"Stays for your trip"},{"id":"hotel-list","component":"List","children":{"componentId":"hotel-card","path":"/hotels"}},{"id":"hotel-card","component":"Card","child":"hotel-body"},{"id":"hotel-body","component":"Column","children":["hotel-photo","hotel-name","hotel-city","hotel-price","hotel-book"]}]}}`,
  `{"version":"v0.9.1","updateComponents":{"surfaceId":"main","components":[{"id":"hotel-photo","component":"Image","url":{"path":"photo"},"description":{"path":"name"},"variant":"mediumFeature"},{"id":"hotel-name","component":"Text","variant":"h3","text":{"path":"name"}},{"id":"hotel-city","component":"Text","text":{"path":"city"}},{"id":"hotel-price","component":"Text","text":{"path":"price"}},{"id":"hotel-book","component":"Button","variant":"primary","child":"hotel-book-label","action":{"event":{"name":"hotel.book","context":{"hotel":{"path":"name"},"price":{"path":"price"}}}}},{"id":"hotel-book-label","component":"Text","text":"Book this stay"}]}}`,
].join("\n");

const SUPPORT_FORM_DATA = `{"version":"v0.9.1","updateDataModel":{"surfaceId":"main","value":{"form":{"name":"Ada","topic":["billing"],"agree":false}}}}`;
const SUPPORT_FORM_FIELDS = `{"version":"v0.9.1","updateComponents":{"surfaceId":"main","components":[{"id":"name","component":"TextField","label":"Your name","value":{"path":"/form/name"}},{"id":"topic","component":"ChoicePicker","label":"Topic","variant":"mutuallyExclusive","options":[{"label":"Billing","value":"billing"},{"label":"Bug report","value":"bug"},{"label":"Other","value":"other"}],"value":{"path":"/form/topic"}},{"id":"agree","component":"CheckBox","label":"I agree to be contacted","value":{"path":"/form/agree"}}]}}`;
const SUPPORT_FORM_LAYOUT = `{"version":"v0.9.1","updateComponents":{"surfaceId":"main","components":[{"id":"root","component":"Column","children":["title","name","topic","agree","submit"]},{"id":"title","component":"Text","variant":"h2","text":"Contact support"},{"id":"submit","component":"Button","variant":"primary","child":"submit-label","action":{"event":{"name":"support.submit","context":{"name":{"path":"/form/name"},"topic":{"path":"/form/topic"},"agree":{"path":"/form/agree"}}}}},{"id":"submit-label","component":"Text","text":"Send request"}]}}`;

const SUPPORT_FORM: string = [CREATE_SURFACE, SUPPORT_FORM_DATA, SUPPORT_FORM_FIELDS, SUPPORT_FORM_LAYOUT].join("\n");

/** The same Support form with frame 3 cut off mid-JSON. Only frame 3 must be rejected. */
const BROKEN_OUTPUT: string = [
  CREATE_SURFACE,
  SUPPORT_FORM_DATA,
  SUPPORT_FORM_FIELDS.slice(0, 120),
  SUPPORT_FORM_LAYOUT,
].join("\n");

const ORDER_SUMMARY: string = [
  CREATE_SURFACE,
  `{"version":"v0.9.1","updateDataModel":{"surfaceId":"main","value":{"bill":{"nights":"3 nights","room":"€540.00","fees":"€32.40","tax":"€57.24","total":"€629.64","split":"Split between 2"}}}}`,
  `{"version":"v0.9.1","updateComponents":{"surfaceId":"main","components":[{"id":"root","component":"Column","children":["title","stay","divider","room-row","fees-row","tax-row","divider-2","total-row","split","pay"]},{"id":"title","component":"Text","variant":"h2","text":"Order summary"},{"id":"stay","component":"Text","text":{"path":"/bill/nights"}},{"id":"divider","component":"Divider"},{"id":"room-row","component":"Row","children":["room-label","room-value"]},{"id":"room-label","component":"Text","text":"Room"},{"id":"room-value","component":"Text","text":{"path":"/bill/room"}},{"id":"fees-row","component":"Row","children":["fees-label","fees-value"]},{"id":"fees-label","component":"Text","text":"Fees"},{"id":"fees-value","component":"Text","text":{"path":"/bill/fees"}}]}}`,
  `{"version":"v0.9.1","updateComponents":{"surfaceId":"main","components":[{"id":"tax-row","component":"Row","children":["tax-label","tax-value"]},{"id":"tax-label","component":"Text","text":"Tax"},{"id":"tax-value","component":"Text","text":{"path":"/bill/tax"}},{"id":"divider-2","component":"Divider"},{"id":"total-row","component":"Row","children":["total-label","total-value"]},{"id":"total-label","component":"Text","variant":"h3","text":"Total"},{"id":"total-value","component":"Text","variant":"h3","text":{"path":"/bill/total"}},{"id":"split","component":"Text","text":{"path":"/bill/split"}},{"id":"pay","component":"Button","variant":"primary","child":"pay-label","action":{"event":{"name":"bill.pay","context":{"total":{"path":"/bill/total"},"split":{"path":"/bill/split"}}}}},{"id":"pay-label","component":"Text","text":"Pay the bill"}]}}`,
].join("\n");

export const PLAYGROUND_EXAMPLES: readonly PlaygroundExample[] = [
  {
    id: "hotel-booking",
    title: "Hotel booking",
    summary: "A List template of Cards with Images and a Button that carries context.",
    broken: false,
    jsonl: HOTEL_BOOKING,
  },
  {
    id: "support-form",
    title: "Support form",
    summary: "TextField, ChoicePicker and CheckBox bound to the data model, with a Button.",
    broken: false,
    jsonl: SUPPORT_FORM,
  },
  {
    id: "order-summary",
    title: "Order summary",
    summary: "Rows, a Divider and a Button showing a small bill bound to the data model.",
    broken: false,
    jsonl: ORDER_SUMMARY,
  },
  {
    id: "broken-output",
    title: "Broken output",
    summary: "The Support form with frame 3 cut off mid-JSON, to show a rejected frame.",
    broken: true,
    jsonl: BROKEN_OUTPUT,
  },
];

export const DEFAULT_EXAMPLE_ID = "hotel-booking";

export function findExample(id: string): PlaygroundExample | undefined {
  return PLAYGROUND_EXAMPLES.find((example) => example.id === id);
}

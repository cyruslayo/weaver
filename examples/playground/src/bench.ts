import type { A2UIAgentMessage } from "@cylayo/weaver-core";

/**
 * The component bench: one surface that exercises the A2UI v1.0 Basic components
 * the Playground's own renderers must cover. It is plain data, so a test can
 * process it through a v1.0 runtime without a DOM. components.ts mounts it.
 *
 * Every component id is a UAX #31 identifier (letters, digits and underscores here),
 * because v1.0 rejects ids such as `user-card`.
 */
export const BENCH_SURFACE_ID = "main";

const MEDIA_POLICY_NOTE = "Media is denied by default, so this Video and its poster do not load in the bench.";

export function benchMessages(catalogId: string): A2UIAgentMessage[] {
  return [
    {
      version: "1.0",
      createSurface: { surfaceId: BENCH_SURFACE_ID, catalogId, sendDataModel: true },
    },
    {
      version: "1.0",
      updateDataModel: {
        surfaceId: BENCH_SURFACE_ID,
        value: {
          form: { name: "Ada", ready: false, volume: 5, mode: ["careful"] },
          ui: { icon: "home" },
        },
      },
    },
    {
      version: "1.0",
      updateComponents: {
        surfaceId: BENCH_SURFACE_ID,
        components: [
          { id: "root", component: "Tabs", tabs: [
            { title: "Overview", child: "overview" },
            { title: "Form", child: "form" },
            { title: "Event", child: "event" },
            { title: "Modal", child: "modal" },
          ] },
          // Markdown headings, the caption and body variants, inline Markdown and a bound Icon.
          { id: "overview", component: "Column", children: ["title", "subtitle", "markdown", "caption", "bound_icon", "greeting", "weight_demo", "media_note", "clip"] },
          { id: "title", component: "Text", text: "# Weaver Basic Tabs playground" },
          { id: "subtitle", component: "Text", text: "## Basic v1.0 components" },
          { id: "markdown", component: "Text", text: "Safe **strong**, *emphasis*, and `inline code`." },
          { id: "caption", component: "Text", variant: "caption", text: "A caption variant, shown smaller." },
          { id: "bound_icon", component: "Icon", name: { "@path": "/ui/icon" } },
          { id: "greeting", component: "Text", text: { "@path": "/form/name" } },
          { id: "weight_demo", component: "Row", children: ["weight_card_one", "weight_card_two"] },
          { id: "weight_card_one", component: "Card", child: "weight_text_one", weight: 1 },
          { id: "weight_text_one", component: "Text", text: "Weight 1" },
          { id: "weight_card_two", component: "Card", child: "weight_text_two", weight: 2 },
          { id: "weight_text_two", component: "Text", text: "Weight 2" },
          { id: "media_note", component: "Text", variant: "caption", text: MEDIA_POLICY_NOTE },
          // Video with a poster. Both URLs are denied by the default media policy.
          { id: "clip", component: "Video", url: "https://example.test/clip.mp4", posterUrl: "https://example.test/poster.jpg" },
          // Form controls: placeholder, @checks with a regex, Slider steps, ChoicePicker.
          { id: "form", component: "Column", children: ["name", "ready", "volume", "choice"] },
          {
            id: "name",
            component: "TextField",
            label: "Name (letters and spaces)",
            placeholder: "Type your name",
            value: { "@path": "/form/name" },
            "@checks": [
              {
                condition: { "@call": "regex", args: { value: { "@path": "/form/name" }, pattern: "^[A-Za-z ]+$" } },
                message: "Use letters and spaces only.",
              },
            ],
          },
          { id: "ready", component: "CheckBox", label: "Ready", value: { "@path": "/form/ready" } },
          { id: "volume", component: "Slider", label: "Volume", min: 0, max: 10, steps: 5, value: { "@path": "/form/volume" } },
          {
            id: "choice",
            component: "ChoicePicker",
            label: "Mode",
            displayStyle: "chips",
            value: { "@path": "/form/mode" },
            options: [
              { label: "Fast", value: "fast" },
              { label: "Careful", value: "careful" },
            ],
          },
          // Buttons in every variant. The labelled one carries @accessibility.
          { id: "event", component: "Column", children: ["button_default", "button_primary", "button_borderless"] },
          {
            id: "button_default",
            component: "Button",
            variant: "default",
            child: "button_default_text",
            action: { event: { name: "playground.default", context: {} } },
          },
          { id: "button_default_text", component: "Text", text: "Default action" },
          {
            id: "button_primary",
            component: "Button",
            variant: "primary",
            child: "button_primary_text",
            action: { event: { name: "playground.submit", context: { name: { "@path": "/form/name" } } } },
            "@accessibility": { label: "Submit the name", description: "Sends the name typed in the Form tab." },
          },
          { id: "button_primary_text", component: "Text", text: "Primary action" },
          {
            id: "button_borderless",
            component: "Button",
            variant: "borderless",
            child: "button_borderless_text",
            action: { event: { name: "playground.borderless", context: {} } },
          },
          { id: "button_borderless_text", component: "Text", text: "Borderless action" },
          // A Modal whose trigger opens locally. Its action must never fire.
          { id: "modal", component: "Modal", trigger: "modal_trigger", content: "modal_card" },
          {
            id: "modal_trigger",
            component: "Button",
            child: "modal_trigger_text",
            action: { event: { name: "must.not.fire", context: {} } },
          },
          { id: "modal_trigger_text", component: "Text", text: "Open local Modal" },
          { id: "modal_card", component: "Card", child: "modal_content" },
          { id: "modal_content", component: "Column", children: ["modal_title", "modal_name", "modal_action"] },
          { id: "modal_title", component: "Text", text: "## Mount-local Modal" },
          { id: "modal_name", component: "TextField", label: "Name", value: { "@path": "/form/name" } },
          {
            id: "modal_action",
            component: "Button",
            child: "modal_action_text",
            action: { event: { name: "playground.modal", context: { name: { "@path": "/form/name" } } } },
          },
          { id: "modal_action_text", component: "Text", text: "Run content action" },
        ],
      },
    },
  ] as A2UIAgentMessage[];
}

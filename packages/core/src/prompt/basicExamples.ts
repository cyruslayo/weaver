import { A2UI_V10_BASIC_CATALOG_ID } from "../basic-catalog/index.js";
import { createA2UIV10Producer } from "../protocol/index.js";
import type { A2UIV10PromptExample } from "./types.js";

const producer = createA2UIV10Producer();

/**
 * Canonical examples for the Basic catalog. They are built with the v1.0
 * producer, and `generateA2UIV10Prompt()` validates each one before it can
 * appear in a prompt. Pass them as `examples` to teach the model the shapes.
 */
/**
 * Freezes a value and everything reachable from it, so a host that imports the
 * shared examples cannot change them for every later prompt. Runs once, at load.
 */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const A2UI_V10_BASIC_PROMPT_EXAMPLES: readonly A2UIV10PromptExample[] =
  deepFreeze([
    {
      title: "Simple card",
      messages: [
        producer.createSurface({
          surfaceId: "notice",
          catalogId: A2UI_V10_BASIC_CATALOG_ID,
        }),
        producer.updateComponents({
          surfaceId: "notice",
          components: [
            { id: "root", component: "Card", child: "message" },
            {
              id: "message",
              component: "Text",
              text: "## Your order has shipped.",
            },
          ],
        }),
      ],
    },
    {
      title: "Form with a bound field and a button action",
      messages: [
        producer.createSurface({
          surfaceId: "signup",
          catalogId: A2UI_V10_BASIC_CATALOG_ID,
        }),
        producer.updateDataModel({
          surfaceId: "signup",
          path: "/form/name",
          value: "",
        }),
        producer.updateComponents({
          surfaceId: "signup",
          components: [
            { id: "root", component: "Column", children: ["name_field", "submit"] },
            {
              id: "name_field",
              component: "TextField",
              label: "Name",
              value: { "@path": "/form/name" },
            },
            {
              id: "submit",
              component: "Button",
              variant: "primary",
              child: "submit_label",
              action: {
                event: {
                  name: "submit_signup",
                  context: { name: { "@path": "/form/name" } },
                },
              },
            },
            { id: "submit_label", component: "Text", text: "Sign up" },
          ],
        }),
      ],
    },
    {
      title: "Edit mode: change one value with updateDataModel",
      messages: [
        producer.createSurface({
          surfaceId: "order",
          catalogId: A2UI_V10_BASIC_CATALOG_ID,
        }),
        producer.updateComponents({
          surfaceId: "order",
          components: [
            { id: "root", component: "Text", text: { "@path": "/status" } },
          ],
        }),
        producer.updateDataModel({
          surfaceId: "order",
          path: "/status",
          value: "Packed",
        }),
        // The edit: only this updateDataModel is sent for the change.
        producer.updateDataModel({
          surfaceId: "order",
          path: "/status",
          value: "Shipped",
        }),
      ],
    },
  ]);

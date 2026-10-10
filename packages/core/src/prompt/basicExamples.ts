import { A2UI_V091_BASIC_CATALOG_ID } from "../basic-catalog/index.js";
import { createA2UIV091Producer } from "../protocol/index.js";
import type { A2UIPromptExample } from "./types.js";

const producer = createA2UIV091Producer();

/**
 * Canonical examples for the Basic catalog. They are built with the v0.9.1
 * producer, and `generateA2UIV091Prompt()` validates each one before it can
 * appear in a prompt. Pass them as `examples` to teach the model the shapes.
 */
export const A2UI_V091_BASIC_PROMPT_EXAMPLES: readonly A2UIPromptExample[] =
  Object.freeze([
    {
      title: "Simple card",
      messages: [
        producer.createSurface({
          surfaceId: "notice",
          catalogId: A2UI_V091_BASIC_CATALOG_ID,
        }),
        producer.updateComponents({
          surfaceId: "notice",
          components: [
            { id: "root", component: "Card", child: "message" },
            {
              id: "message",
              component: "Text",
              text: "Your order has shipped.",
              variant: "h3",
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
          catalogId: A2UI_V091_BASIC_CATALOG_ID,
        }),
        producer.updateDataModel({
          surfaceId: "signup",
          path: "/form/name",
          value: "",
        }),
        producer.updateComponents({
          surfaceId: "signup",
          components: [
            { id: "root", component: "Column", children: ["name-field", "submit"] },
            {
              id: "name-field",
              component: "TextField",
              label: "Name",
              value: { path: "/form/name" },
            },
            {
              id: "submit",
              component: "Button",
              variant: "primary",
              child: "submit-label",
              action: {
                event: {
                  name: "submit_signup",
                  context: { name: { path: "/form/name" } },
                },
              },
            },
            { id: "submit-label", component: "Text", text: "Sign up" },
          ],
        }),
      ],
    },
    {
      title: "Edit mode: change one value with updateDataModel",
      messages: [
        producer.createSurface({
          surfaceId: "order",
          catalogId: A2UI_V091_BASIC_CATALOG_ID,
        }),
        producer.updateComponents({
          surfaceId: "order",
          components: [
            { id: "root", component: "Text", text: { path: "/status" } },
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

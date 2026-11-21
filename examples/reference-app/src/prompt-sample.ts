import {
  createBasicCatalogV10Registration,
  createA2UIV10Producer,
  generateA2UIV10Prompt,
  type A2UIV10PromptAction,
  type A2UIV10PromptExample,
} from "@cylayo/weaver-core";
import {
  REFERENCE_CREATE_REQUEST,
  REFERENCE_PRIORITIES,
  REFERENCE_SURFACE_ID,
} from "./application-agent.js";

/** The app's single trusted action. Its context matches the Submit button's bindings. */
export const REFERENCE_PROMPT_ACTION: A2UIV10PromptAction = {
  name: REFERENCE_CREATE_REQUEST,
  description: `Create a reference request. title is the request title text. priority is a one-element list holding one of ${REFERENCE_PRIORITIES.join(", ")}.`,
  context: {
    title: { "@path": "/draft/title" },
    priority: { "@path": "/draft/priority" },
  },
};

const producer = createA2UIV10Producer();

/** A worked example that the generator validates through a scratch runtime before it reaches the prompt. */
const REFERENCE_PROMPT_EXAMPLE: A2UIV10PromptExample = {
  title: "Request form with a bound title and priority",
  messages: [
    producer.createSurface({
      surfaceId: REFERENCE_SURFACE_ID,
      catalogId: createBasicCatalogV10Registration().catalogId,
      sendDataModel: true,
    }),
    producer.updateDataModel({
      surfaceId: REFERENCE_SURFACE_ID,
      value: { draft: { title: "", priority: ["normal"] } },
    }),
    producer.updateComponents({
      surfaceId: REFERENCE_SURFACE_ID,
      components: [
        { id: "root", component: "Column", children: ["title", "priority", "submit"] },
        {
          id: "title",
          component: "TextField",
          label: "Request title",
          value: { "@path": "/draft/title" },
        },
        {
          id: "priority",
          component: "ChoicePicker",
          label: "Priority",
          variant: "mutuallyExclusive",
          displayStyle: "chips",
          options: [
            { label: "Normal", value: "normal" },
            { label: "High", value: "high" },
            { label: "Urgent", value: "urgent" },
          ],
          value: { "@path": "/draft/priority" },
        },
        {
          id: "submit",
          component: "Button",
          variant: "primary",
          child: "submitLabel",
          action: {
            event: {
              name: REFERENCE_CREATE_REQUEST,
              context: {
                title: { "@path": "/draft/title" },
                priority: { "@path": "/draft/priority" },
              },
            },
          },
        },
        { id: "submitLabel", component: "Text", text: "Create request" },
      ],
    }),
  ],
};

/**
 * Builds the system prompt for the reference app: the Basic catalog, the one
 * trusted action, and one validated example. It is deterministic and calls no
 * model. Throws only if generation fails, which the tests guard against.
 */
export function buildReferencePrompt(): string {
  const result = generateA2UIV10Prompt({
    catalogs: [createBasicCatalogV10Registration()],
    actions: [REFERENCE_PROMPT_ACTION],
    examples: [REFERENCE_PROMPT_EXAMPLE],
  });
  if (!result.ok) {
    throw new Error(`Reference prompt generation failed: ${result.error.code}`);
  }
  return result.value.text;
}

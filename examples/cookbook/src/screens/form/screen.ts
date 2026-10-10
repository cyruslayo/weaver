import {
  A2UI_V091_BASIC_CATALOG_ID,
  createBasicCatalogFunctionImplementations,
  createBasicCatalogV091Registration,
  generateA2UIV091Prompt,
  type A2UIComponent,
  type BasicRegexMatcher,
  type JsonObject,
} from "@cylayo/weaver-core";
import type { CookbookScreenDefinition } from "../../shared/harness.js";

export const FORM_SURFACE_ID = "cookbook-form";
export const FORM_SUBMIT = "cookbook.form.submit";
export const FORM_ORDER_REF_PATTERN = "^[A-Z]{2}-[0-9]{4}$";
export const FORM_CATEGORIES = ["billing", "technical", "account", "other"] as const;
export const FORM_SUMMARY_MAX = 80;

/**
 * Empty values start as "" or []. Basic `required` and `email` checks fail on
 * them, so the first render already shows those messages and the submit button
 * starts disabled. Basic checks have no "touched" state, so this is the
 * expected behaviour, not a bug.
 */
export interface FormState {
  name: string;
  email: string;
  summary: string;
  orderRef: string;
  urgent: boolean;
  category: string[];
  dueDate: string;
  nextTicket: number;
  result: string;
  resultText: string;
  errors: string[];
  errorText: string;
}

interface Submission {
  name: string;
  email: string;
  summary: string;
  orderRef: string;
  urgent: boolean;
  category: string[];
  dueDate: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Trusted matcher for `validationRegexp`. It never runs the agent's text as a
 * JavaScript RegExp. It accepts only the screen's own pattern, which is checked
 * by hand, and fails for anything else.
 */
export const formRegexMatcher: BasicRegexMatcher = ({ value, pattern }) => {
  if (pattern === FORM_ORDER_REF_PATTERN) return isOrderRef(value);
  throw new Error("Unsupported form regex pattern");
};

function isOrderRef(value: string): boolean {
  if (value.length !== 7 || value.charAt(2) !== "-") return false;
  const letters = [0, 1].every((index) => value.charAt(index) >= "A" && value.charAt(index) <= "Z");
  const digits = [3, 4, 5, 6].every((index) => value.charAt(index) >= "0" && value.charAt(index) <= "9");
  return letters && digits;
}

/** Client checks use the Basic opt-in functions. The UI only disables and explains. The agent re-checks. */
export const formFunctions = createBasicCatalogFunctionImplementations({
  catalogId: A2UI_V091_BASIC_CATALOG_ID,
  regexMatcher: formRegexMatcher,
});

const check = (call: string, args: JsonObject, message: string): JsonObject => ({
  condition: { call, args, returnType: "boolean" },
  message,
});

const requiredCheck = (path: string, message: string): JsonObject =>
  check("required", { value: { path } }, message);

const CHOICE_OPTIONS = FORM_CATEGORIES.map((value) => ({
  label: value[0]!.toUpperCase() + value.slice(1),
  value,
}));

function formComponents(): A2UIComponent[] {
  const submitChecks: JsonObject[] = [
    requiredCheck("/name", "Fix the fields above to submit."),
    check("email", { value: { path: "/email" } }, "Fix the fields above to submit."),
    requiredCheck("/summary", "Fix the fields above to submit."),
    check("length", { value: { path: "/summary" }, max: FORM_SUMMARY_MAX }, "Fix the fields above to submit."),
    requiredCheck("/orderRef", "Fix the fields above to submit."),
    check("regex", { value: { path: "/orderRef" }, pattern: FORM_ORDER_REF_PATTERN }, "Fix the fields above to submit."),
    requiredCheck("/category", "Fix the fields above to submit."),
  ];
  return [
    { id: "root", component: "Column", children: ["card"] },
    { id: "card", component: "Card", child: "content" },
    {
      id: "content",
      component: "Column",
      children: ["heading", "intro", "name", "email", "summary", "orderRef", "urgent", "category", "dueDate", "submit", "result", "errors"],
    },
    { id: "heading", component: "Text", variant: "h1", text: "Support request" },
    { id: "intro", component: "Text", text: "Describe the problem. The agent checks the request and returns a ticket number or the errors." },
    {
      id: "name",
      component: "TextField",
      label: "Name",
      value: { path: "/name" },
      checks: [requiredCheck("/name", "Enter your name.")],
    },
    {
      id: "email",
      component: "TextField",
      label: "Email",
      value: { path: "/email" },
      checks: [check("email", { value: { path: "/email" } }, "Enter a valid email address.")],
    },
    {
      id: "summary",
      component: "TextField",
      label: "Summary",
      value: { path: "/summary" },
      checks: [
        requiredCheck("/summary", "Summarise the problem."),
        check("length", { value: { path: "/summary" }, max: FORM_SUMMARY_MAX }, `Summary must be ${FORM_SUMMARY_MAX} characters or fewer.`),
      ],
    },
    {
      id: "orderRef",
      component: "TextField",
      label: "Order reference",
      value: { path: "/orderRef" },
      validationRegexp: FORM_ORDER_REF_PATTERN,
    },
    { id: "urgent", component: "CheckBox", label: "Urgent", value: { path: "/urgent" } },
    {
      id: "category",
      component: "ChoicePicker",
      label: "Category",
      variant: "mutuallyExclusive",
      options: CHOICE_OPTIONS,
      value: { path: "/category" },
      checks: [requiredCheck("/category", "Choose a category.")],
    },
    { id: "dueDate", component: "DateTimeInput", label: "Due date", value: { path: "/dueDate" }, enableDate: true },
    {
      id: "submit",
      component: "Button",
      variant: "primary",
      child: "submitLabel",
      checks: submitChecks,
      action: {
        event: {
          name: FORM_SUBMIT,
          context: {
            name: { path: "/name" },
            email: { path: "/email" },
            summary: { path: "/summary" },
            orderRef: { path: "/orderRef" },
            urgent: { path: "/urgent" },
            category: { path: "/category" },
            dueDate: { path: "/dueDate" },
          },
        },
      },
    },
    { id: "submitLabel", component: "Text", text: "Submit request" },
    { id: "result", component: "Text", text: { path: "/resultText" } },
    { id: "errors", component: "Text", text: { path: "/errorText" } },
  ];
}

function readSubmission(context: JsonObject): Submission | undefined {
  const { name, email, summary, orderRef, urgent, category, dueDate } = context;
  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof summary !== "string" ||
    typeof orderRef !== "string" ||
    typeof urgent !== "boolean" ||
    typeof dueDate !== "string" ||
    !Array.isArray(category) ||
    !category.every((item) => typeof item === "string")
  ) {
    return undefined;
  }
  return { name, email, summary, orderRef, urgent, category: [...category], dueDate };
}

/** The agent's own validation. The client checks are not trusted. */
export function validateSubmission(submission: Submission): string[] {
  const errors: string[] = [];
  const name = submission.name.trim();
  if (name.length === 0) errors.push("Enter your name.");

  const email = submission.email.trim();
  if (email.length === 0 || !EMAIL_PATTERN.test(email)) errors.push("Enter a valid email address.");

  const summary = submission.summary.trim();
  if (summary.length === 0) errors.push("Summarise the problem.");
  else if (summary.length > FORM_SUMMARY_MAX)
    errors.push(`Summary must be ${FORM_SUMMARY_MAX} characters or fewer.`);

  if (submission.orderRef.length === 0) errors.push("Enter an order reference.");
  else if (!isOrderRef(submission.orderRef)) errors.push("Order reference must look like AB-1234.");

  const categoryValid =
    submission.category.length === 1 &&
    (FORM_CATEGORIES as readonly string[]).includes(submission.category[0]!);
  if (!categoryValid) errors.push("Choose a category.");

  if (submission.dueDate.length > 0 && !DATE_PATTERN.test(submission.dueDate))
    errors.push("Due date must be a date.");
  return errors;
}

/**
 * Accepted: the agent sets `/result` to a ticket number and clears `/errors`.
 * Rejected: it sets `/errors` and clears `/result`. Both paths keep the typed
 * values so the user can correct them. Neither path changes the component tree.
 */
function submit(state: FormState, context: JsonObject): FormState | undefined {
  const submission = readSubmission(context);
  if (submission === undefined) return undefined;
  const values = {
    ...state,
    name: submission.name,
    email: submission.email,
    summary: submission.summary,
    orderRef: submission.orderRef,
    urgent: submission.urgent,
    category: submission.category,
    dueDate: submission.dueDate,
  };
  const errors = validateSubmission(submission);
  if (errors.length > 0) {
    return { ...values, result: "", resultText: "", errors, errorText: errors.join(" ") };
  }
  const ticket = `SR-${state.nextTicket}`;
  return {
    ...values,
    nextTicket: state.nextTicket + 1,
    result: ticket,
    resultText: `Ticket ${ticket} created.`,
    errors: [],
    errorText: "",
  };
}

export const formScreen: CookbookScreenDefinition<FormState> = {
  surfaceId: FORM_SURFACE_ID,
  attributionName: "Support Agent",
  initialState: {
    name: "",
    email: "",
    summary: "",
    orderRef: "",
    urgent: false,
    category: [],
    dueDate: "",
    nextTicket: 1001,
    result: "",
    resultText: "",
    errors: [],
    errorText: "",
  },
  components: formComponents,
  actions: { [FORM_SUBMIT]: { transition: submit } },
  web: { functions: formFunctions, regexMatcher: formRegexMatcher },
};

/** The generated prompt for this screen. The test pins prompt.txt to this output. */
export function formPrompt(): string {
  const result = generateA2UIV091Prompt({
    catalogs: [createBasicCatalogV091Registration()],
    functions: formFunctions,
    actions: [
      {
        name: FORM_SUBMIT,
        description:
          "Submit the support request form. Carries name, email, summary, orderRef, urgent, category and dueDate.",
      },
    ],
  });
  if (!result.ok) throw new Error(`Form prompt generation failed: ${result.error.code}`);
  return result.value.text;
}

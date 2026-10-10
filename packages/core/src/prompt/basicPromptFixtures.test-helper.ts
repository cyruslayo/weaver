import { A2UI_V091_BASIC_CATALOG_ID, createBasicCatalogV091Registration } from "../basic-catalog/index.js";
import { createBasicCatalogFunctionImplementations } from "../basic-functions/index.js";
import type { FunctionRegistration } from "../functions/index.js";
import { A2UI_V091_BASIC_PROMPT_EXAMPLES } from "./basicExamples.js";
import type { A2UIV091PromptConfig } from "./types.js";

/** The fixture file name for each mode, in the prompt fixtures folder. */
export const BASIC_PROMPT_FIXTURE_FILES = {
  create: "basic-catalog.create.prompt.txt",
  edit: "basic-catalog.edit.prompt.txt",
} as const;

export type BasicPromptFixtureMode = keyof typeof BASIC_PROMPT_FIXTURE_FILES;

/**
 * The configs the golden prompt fixtures are generated from. This is the single
 * definition shared by `scripts/generate-prompt-fixtures.mjs` and the Core test.
 *
 * `openUrl` is supplied by the caller. Core cannot import `@cylayo/weaver-web`,
 * where the real openUrl lives, so the script passes the real registration and
 * the test passes a stand-in with the same catalog id, name and effect. The prompt
 * lists functions by name, arguments and return type, never by implementation, so
 * both produce the same text.
 *
 * The sample Basic functions are the opt-in set from `createBasicCatalogFunctionImplementations`.
 * Their `regex` implementation is never called while generating a prompt.
 */
export function basicPromptFixtureConfigs(
  openUrl: readonly FunctionRegistration[],
): Readonly<Record<BasicPromptFixtureMode, A2UIV091PromptConfig>> {
  const catalogId = A2UI_V091_BASIC_CATALOG_ID;
  const functions: FunctionRegistration[] = [
    ...createBasicCatalogFunctionImplementations({
      catalogId,
      regexMatcher: () => {
        throw new Error("The prompt fixture never evaluates regex.");
      },
    }),
    ...openUrl,
  ];
  const shared: Omit<A2UIV091PromptConfig, "mode"> = {
    catalogs: [createBasicCatalogV091Registration()],
    functions,
    actions: [
      {
        name: "submit_signup",
        description: "Submit the sign-up form. Carries the name entered in the form.",
        context: { name: { path: "/form/name" } },
      },
    ],
    examples: A2UI_V091_BASIC_PROMPT_EXAMPLES,
  };
  return {
    create: { ...shared, mode: "create" },
    edit: { ...shared, mode: "edit" },
  };
}

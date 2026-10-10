import type { CatalogRegistryError } from "../catalog/index.js";

/**
 * Typed failures from `generateA2UIV091Prompt()`. The generator never returns
 * a partial prompt: every failure is one of these values.
 */
export type A2UIPromptGenerationError =
  | {
      code: "CATALOG_INVALID";
      message: string;
      catalogId?: string;
      /** The CatalogRegistry error that rejected the catalog, when there is one. */
      cause?: CatalogRegistryError;
    }
  | {
      code: "ACTION_NAME_INVALID";
      message: string;
      actionName: string;
      reason: "empty" | "duplicate";
    }
  | {
      code: "PROMPT_TOO_LARGE";
      message: string;
      characters: number;
      maxCharacters: number;
    }
  | {
      /** Reserved here; the example shape checks are implemented in WVR-012. */
      code: "EXAMPLE_INVALID";
      message: string;
      exampleTitle?: string;
      exampleIndex?: number;
    };

export type A2UIPromptGenerationErrorCode = A2UIPromptGenerationError["code"];

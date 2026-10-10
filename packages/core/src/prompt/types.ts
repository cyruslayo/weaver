import type { CatalogRegistration } from "../catalog/index.js";
import type { FunctionRegistration } from "../functions/index.js";
import type { JsonObject } from "../protocol/index.js";
import type { A2UIPromptGenerationError } from "./errors.js";

/** A host-declared client action the model may emit as an event name. */
export interface A2UIPromptAction {
  name: string;
  description: string;
  /** The context keys the action carries. Values are copied and key-sorted. */
  context?: JsonObject;
}

/**
 * An example conversation rendered as a JSONL block. Each example must pass
 * the strict pipeline in a fresh runtime, or generation returns EXAMPLE_INVALID.
 */
export interface A2UIPromptExample {
  title: string;
  messages: readonly unknown[];
}

export type A2UIPromptMode = "create" | "edit";

export interface A2UIV091PromptConfig {
  catalogs: readonly CatalogRegistration[];
  /** Listed only when the catalog declares the function AND it is registered here. */
  functions?: readonly FunctionRegistration[];
  actions?: readonly A2UIPromptAction[];
  examples?: readonly A2UIPromptExample[];
  /** Defaults to "create". "edit" adds the incremental-update section. */
  mode?: A2UIPromptMode;
  /** Defaults to 24_000 characters. Output above this returns PROMPT_TOO_LARGE. */
  maxCharacters?: number;
}

export type A2UIPromptSectionId =
  | "envelope"
  | "components"
  | "functions"
  | "actions"
  | "edit"
  | "examples";

export interface A2UIPromptSection {
  id: A2UIPromptSectionId;
  title: string;
  /** The section's Markdown, including its heading. */
  text: string;
}

export type A2UIV091PromptResult =
  | {
      ok: true;
      value: { text: string; sections: readonly A2UIPromptSection[] };
    }
  | { ok: false; error: A2UIPromptGenerationError };

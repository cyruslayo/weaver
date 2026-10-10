import type { CatalogRegistration } from "../catalog/index.js";
import type { FunctionRegistration } from "../functions/index.js";
import type { JsonObject } from "../protocol/index.js";
import type { A2UIV091PromptGenerationError } from "./errors.js";

/** A host-declared client action the model may emit as an event name. */
export interface A2UIV091PromptAction {
  name: string;
  description: string;
  /** The context keys the action carries. Values are copied and key-sorted. */
  context?: JsonObject;
}

/**
 * An example conversation rendered as a JSONL block. Each example must pass
 * the strict pipeline in a fresh runtime, or generation returns EXAMPLE_INVALID.
 */
export interface A2UIV091PromptExample {
  title: string;
  messages: readonly unknown[];
}

export type A2UIV091PromptMode = "create" | "edit";

export interface A2UIV091PromptConfig {
  catalogs: readonly CatalogRegistration[];
  /** Listed only when the catalog declares the function AND it is registered here. */
  functions?: readonly FunctionRegistration[];
  actions?: readonly A2UIV091PromptAction[];
  examples?: readonly A2UIV091PromptExample[];
  /** Defaults to "create". "edit" adds the incremental-update section. */
  mode?: A2UIV091PromptMode;
  /** Defaults to 24_000 characters. Output above this returns PROMPT_TOO_LARGE. */
  maxCharacters?: number;
}

export type A2UIV091PromptSectionId =
  | "envelope"
  | "components"
  | "functions"
  | "actions"
  | "edit"
  | "examples";

export interface A2UIV091PromptSection {
  id: A2UIV091PromptSectionId;
  title: string;
  /** The section's Markdown, including its heading. */
  text: string;
}

export type A2UIV091PromptResult =
  | {
      ok: true;
      value: { text: string; sections: readonly A2UIV091PromptSection[] };
    }
  | { ok: false; error: A2UIV091PromptGenerationError };

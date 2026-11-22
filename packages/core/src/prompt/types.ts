import type { CatalogRegistration } from "../catalog/index.js";
import type { FunctionRegistration } from "../functions/index.js";
import type { JsonObject } from "../protocol/index.js";
import type { A2UIV10PromptGenerationError } from "./errors.js";

/** A host-declared client action the model may emit as an event name. */
export interface A2UIV10PromptAction {
  name: string;
  description: string;
  /** The context keys the action carries. Values are copied and key-sorted. */
  context?: JsonObject;
}

/**
 * An example conversation rendered as a JSONL block. Each example must pass
 * the strict pipeline in a fresh runtime, or generation returns EXAMPLE_INVALID.
 */
export interface A2UIV10PromptExample {
  title: string;
  messages: readonly unknown[];
}

export type A2UIV10PromptMode = "create" | "edit";

export interface A2UIV10PromptConfig {
  catalogs: readonly CatalogRegistration[];
  /**
   * The default catalog of the surfaces the model creates. Its components and calls need no catalog property.
   * Without it, every component sets "@catalogId" and every function call sets "catalogId". Must be a registered catalog.
   */
  defaultCatalogId?: string;
  /** Listed only when the catalog declares the function AND it is registered here. */
  functions?: readonly FunctionRegistration[];
  actions?: readonly A2UIV10PromptAction[];
  examples?: readonly A2UIV10PromptExample[];
  /** Defaults to "create". "edit" adds the incremental-update section. */
  mode?: A2UIV10PromptMode;
  /** Defaults to 24_000 characters. Output above this returns PROMPT_TOO_LARGE. */
  maxCharacters?: number;
}

export type A2UIV10PromptSectionId =
  | "envelope"
  | "instructions"
  | "components"
  | "functions"
  | "actions"
  | "edit"
  | "examples";

export interface A2UIV10PromptSection {
  id: A2UIV10PromptSectionId;
  title: string;
  /** The section's Markdown, including its heading. */
  text: string;
}

export type A2UIV10PromptResult =
  | {
      ok: true;
      value: { text: string; sections: readonly A2UIV10PromptSection[] };
    }
  | { ok: false; error: A2UIV10PromptGenerationError };

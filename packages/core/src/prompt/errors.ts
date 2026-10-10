import type { CatalogRegistryError } from "../catalog/index.js";
import type { MessageProcessorError } from "../message-processor/index.js";
import type {
  WeaverResolvedSurface,
  WeaverRuntimeConfigurationError,
  WeaverSurfaceResolutionError,
} from "../runtime/index.js";

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
  | A2UIPromptExampleInvalidError;

/**
 * A surface that resolves without a returned error but is not complete: no
 * root, a dangling reference, or a property or instance issue.
 */
export interface A2UIPromptSurfaceNotReadyCause {
  code: "SURFACE_NOT_READY";
  surfaceId: string;
  treeReady: boolean;
  checksReady: boolean;
  issues: WeaverResolvedSurface["issues"];
}

interface A2UIPromptExampleInvalidBase {
  code: "EXAMPLE_INVALID";
  message: string;
  /** Position of the example in `config.examples`. */
  exampleIndex: number;
  exampleTitle: string;
}

/**
 * An example failed the strict pipeline in a fresh scratch runtime. `stage`
 * says which step rejected it, so a host knows where to look.
 */
export type A2UIPromptExampleInvalidError = A2UIPromptExampleInvalidBase &
  (
    | {
        /** The scratch runtime could not be created from the prompt config. */
        stage: "runtime";
        cause: WeaverRuntimeConfigurationError;
      }
    | {
        /** The message at `messageIndex` was rejected by the message processor. */
        stage: "process";
        messageIndex: number;
        cause: MessageProcessorError;
      }
    | {
        /** Resolution of `surfaceId` failed, or the surface is not complete. */
        stage: "resolve";
        surfaceId: string;
        cause: WeaverSurfaceResolutionError | A2UIPromptSurfaceNotReadyCause;
      }
  );

export type A2UIPromptGenerationErrorCode = A2UIPromptGenerationError["code"];

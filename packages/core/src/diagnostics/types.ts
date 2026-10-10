import type { A2UIV091StreamIngestionError } from "../stream-ingestion/index.js";
import type { MessageProcessorError } from "../message-processor/index.js";
import type { JsonlDecodeError } from "../transport/jsonl/index.js";
import type { WeaverRuntimeConfigurationError, WeaverRuntimeInteractionError, WeaverSurfaceResolutionError } from "../runtime/index.js";
import type { FunctionRegistryError } from "../functions/index.js";
import type { A2UIV091PromptGenerationError } from "../prompt/errors.js";

export type WeaverErrorSeverity = "error" | "warning";

/**
 * A host-readable description of one Weaver error.
 *
 * `causes` is the whole cause chain, flattened in pre-order: a cause comes
 * before its own causes, and siblings keep their original order. Entries in
 * `causes` carry their own location and text, and their `causes` is always
 * empty, so the chain is never repeated.
 */
export interface WeaverErrorDescription {
  code: string;
  severity: WeaverErrorSeverity;
  summary: string;
  surfaceId?: string;
  componentId?: string;
  scopePath?: string;
  dataPath?: string;
  frame?: number;
  causes: readonly WeaverErrorDescription[];
  hint?: string;
}

export interface DescribeWeaverErrorContext {
  /** The JSONL frame number that produced the error, when known. */
  frame?: number;
}

/**
 * Every Core error union that `describeWeaverError()` accepts. The first five
 * are the surfaces a host sees from message processing, streaming, and
 * runtime interaction. The next two are the runtime and function-registry
 * configuration errors, which only exist at setup time. The last is the
 * prompt generator's failure union. They are listed so every code in every
 * `errors.ts` in Core's source tree has a description.
 */
export type DescribableWeaverError =
  | MessageProcessorError
  | JsonlDecodeError
  | WeaverSurfaceResolutionError
  | WeaverRuntimeInteractionError
  | A2UIV091StreamIngestionError
  | WeaverRuntimeConfigurationError
  | FunctionRegistryError
  | A2UIV091PromptGenerationError;

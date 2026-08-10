import type { MessageProcessorResult } from "../../../../message-processor/index.js";
import type { A2UIV091WireVersion } from "../types.js";

/** Exact A2UI v0.9.1 capability-file shape (whose official key is `v0.9`). */
export interface A2UIClientCapabilities {
  "v0.9": {
    supportedCatalogIds: string[];
  };
}

export interface A2UIValidationFailedClientMessage {
  version: A2UIV091WireVersion;
  error: {
    code: "VALIDATION_FAILED";
    surfaceId: string;
    path: string;
    message: string;
  };
}

export interface A2UIValidationFailureMappingInput {
  result: MessageProcessorResult;
  input: unknown;
  /** Trusted routing/session fallback; used only when the inbound envelope has no usable surface ID. */
  surfaceId?: string;
  version?: A2UIV091WireVersion;
}

export type A2UIValidationFailureMappingError =
  | { code: "NOT_A_VALIDATION_FAILURE" }
  | { code: "VALIDATION_ERROR_SURFACE_ID_REQUIRED" };

export type A2UIValidationFailureMappingResult =
  | { ok: true; value: A2UIValidationFailedClientMessage }
  | { ok: false; error: A2UIValidationFailureMappingError };

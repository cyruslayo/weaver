import type { MessageProcessorResult } from "../../../../message-processor/index.js";
import type { A2UIV10WireVersion } from "../types.js";

/** Exact A2UI v1.0 renderer capability shape (the namespace key is `"1.0"`). */
export interface A2UIRendererCapabilities {
  "1.0": {
    supportedCatalogIds: string[];
  };
}

/** renderer-to-agent error codes that carry a validation failure location. */
export type A2UIValidationErrorCode = "VALIDATION_FAILED" | "UNALLOWED_PARENT" | "UNALLOWED_CHILD";

export interface A2UIValidationFailedRendererMessage {
  version: A2UIV10WireVersion;
  error: {
    code: A2UIValidationErrorCode;
    surfaceId: string;
    path: string;
    message: string;
  };
}

/**
 * renderer-to-agent generic error. Exactly one of `surfaceId` or `functionCallId`
 * identifies the origin, and the code must not be a validation code.
 */
export type A2UIRendererErrorMessage = {
  version: A2UIV10WireVersion;
  error: {
    code: string;
    message: string;
  } & (
    | { surfaceId: string; functionCallId?: never }
    | { functionCallId: string; surfaceId?: never }
  );
};

export interface A2UIValidationFailureMappingInput {
  result: MessageProcessorResult;
  input: unknown;
  /** Trusted routing/session fallback; used only when the inbound envelope has no usable surface ID. */
  surfaceId?: string;
  version?: A2UIV10WireVersion;
}

export type A2UIValidationFailureMappingError =
  | { code: "NOT_A_VALIDATION_FAILURE" }
  | { code: "VALIDATION_ERROR_SURFACE_ID_REQUIRED" };

export type A2UIValidationFailureMappingResult =
  | { ok: true; value: A2UIValidationFailedRendererMessage }
  | { ok: false; error: A2UIValidationFailureMappingError };

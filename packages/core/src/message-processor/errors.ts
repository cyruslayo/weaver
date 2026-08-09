import type { ValidationIssue } from "../protocol/index.js";
import type { SurfaceStoreError } from "../surfaces/index.js";

export type MessageProcessorError =
  | {
      code: "PROTOCOL_VALIDATION_FAILED";
      issues: ValidationIssue[];
    }
  | {
      code: "SURFACE_STORE_ERROR";
      storeError: SurfaceStoreError;
    };

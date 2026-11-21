import type { CatalogRegistryError } from "../../../../catalog/index.js";
import type {
  A2UIRendererErrorMessage,
  A2UIValidationErrorCode,
  A2UIValidationFailedRendererMessage,
  A2UIValidationFailureMappingInput,
  A2UIValidationFailureMappingResult,
} from "./types.js";

const VALIDATION_ERROR_CODES: readonly string[] = ["VALIDATION_FAILED", "UNALLOWED_PARENT", "UNALLOWED_CHILD"];

export function buildA2UIValidationFailedRendererMessage(input: {
  surfaceId: string;
  path: string;
  message: string;
  code?: A2UIValidationErrorCode;
  version?: "1.0";
}): A2UIValidationFailedRendererMessage {
  if (input.surfaceId.length === 0) throw new TypeError("surfaceId must not be empty");
  return {
    version: input.version ?? "1.0",
    error: {
      code: input.code ?? "VALIDATION_FAILED",
      surfaceId: input.surfaceId,
      path: input.path,
      message: input.message,
    },
  };
}

/**
 * Builds a generic renderer-to-agent error. The code must not be a validation
 * code, and exactly one of surfaceId or functionCallId must be provided.
 */
export function buildA2UIGenericRendererErrorMessage(input: {
  code: string;
  message: string;
  surfaceId?: string;
  functionCallId?: string;
  version?: "1.0";
}): A2UIRendererErrorMessage {
  if (input.code.length === 0) throw new TypeError("code must not be empty");
  if (VALIDATION_ERROR_CODES.includes(input.code)) {
    throw new TypeError(`code ${input.code} is reserved for validation errors`);
  }
  const hasSurface = input.surfaceId !== undefined;
  const hasCall = input.functionCallId !== undefined;
  if (hasSurface === hasCall) {
    throw new TypeError("exactly one of surfaceId or functionCallId is required");
  }
  const error = hasSurface
    ? { code: input.code, message: input.message, surfaceId: input.surfaceId as string }
    : { code: input.code, message: input.message, functionCallId: input.functionCallId as string };
  return { version: input.version ?? "1.0", error } as A2UIRendererErrorMessage;
}

/** Maps only inbound schema/catalog validation failures. Root validation uses `/`. */
export function mapA2UIValidationFailure(
  input: A2UIValidationFailureMappingInput,
): A2UIValidationFailureMappingResult {
  if (input.result.ok) return { ok: false, error: { code: "NOT_A_VALIDATION_FAILURE" } };

  const failure = input.result.error;
  let issue: { path: string; message: string; surfaceId?: string } | undefined;
  if (failure.code === "PROTOCOL_VALIDATION_FAILED") {
    issue = failure.issues[0];
  } else if (failure.code === "CATALOG_REGISTRY_ERROR") {
    issue = mapCatalogFailure(failure.catalogError, input.input);
  }
  if (issue === undefined) return { ok: false, error: { code: "NOT_A_VALIDATION_FAILURE" } };

  const surfaceId = extractInboundSurfaceId(input.input) ?? input.surfaceId;
  if (surfaceId === undefined || surfaceId.length === 0) {
    return { ok: false, error: { code: "VALIDATION_ERROR_SURFACE_ID_REQUIRED" } };
  }

  return {
    ok: true,
    value: buildA2UIValidationFailedRendererMessage({
      surfaceId,
      path: issue.path,
      message: issue.message,
      ...(input.version === undefined ? {} : { version: input.version }),
    }),
  };
}

function mapCatalogFailure(
  error: CatalogRegistryError,
  input: unknown,
): { path: string; message: string } | undefined {
  if (error.code !== "COMPONENT_VALIDATION_FAILED" && error.code !== "COMPONENT_NOT_ALLOWED") return undefined;

  const componentIndex = findComponentIndex(input, error.componentId);
  const base = `/updateComponents/components/${componentIndex ?? 0}`;
  const issue = error.issues?.[0];
  return {
    path: prefixPath(base, issue?.path),
    message: issue?.message ?? (error.code === "COMPONENT_NOT_ALLOWED"
      ? "Component type is not allowed by the catalog"
      : "Component does not satisfy the catalog schema"),
  };
}

function extractInboundSurfaceId(input: unknown): string | undefined {
  if (!isRecord(input)) return undefined;
  for (const key of ["createSurface", "updateComponents", "updateDataModel", "deleteSurface"] as const) {
    const payload = input[key];
    if (isRecord(payload) && typeof payload.surfaceId === "string" && payload.surfaceId.length > 0) {
      return payload.surfaceId;
    }
  }
  return undefined;
}

function findComponentIndex(input: unknown, componentId?: string): number | undefined {
  if (!isRecord(input) || !isRecord(input.updateComponents) || !Array.isArray(input.updateComponents.components)) return undefined;
  if (componentId === undefined) return 0;
  const index = input.updateComponents.components.findIndex(
    (component) => isRecord(component) && component.id === componentId,
  );
  return index < 0 ? undefined : index;
}

function prefixPath(base: string, path?: string): string {
  if (path === undefined || path === "" || path === "/") return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

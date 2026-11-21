import type { ValidationIssue, ValidationResult } from "./errors.js";
import type { A2UIAgentMessage, JsonValue } from "./types.js";

const MESSAGE_KEYS = [
  "createSurface",
  "updateComponents",
  "updateDataModel",
  "deleteSurface",
  "callRendererFunction",
  "agentFunctionResponse",
] as const;

/** The reserved implicit container. createSurface creates it; it is never sent as a component. */
const RESERVED_SURFACE_COMPONENT = "Surface";

/** Canonical identifier rule from A2UI v1.0 (UAX #31). */
const IDENTIFIER_PATTERN = /^[\p{XID_Start}_][\p{XID_Continue}]*$/u;

type MessageKey = (typeof MESSAGE_KEYS)[number];
type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function issue(
  path: string,
  message: string,
  surfaceId?: string,
): ValidationIssue {
  return surfaceId === undefined
    ? { code: "VALIDATION_FAILED", path, message }
    : { code: "VALIDATION_FAILED", path, message, surfaceId };
}

function getSurfaceId(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  return typeof payload.surfaceId === "string" ? payload.surfaceId : undefined;
}

function validateExactKeys(
  value: UnknownRecord,
  allowed: readonly string[],
  path: string,
  issues: ValidationIssue[],
  surfaceId?: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      issues.push(issue(`${path}/${key}`, "Unexpected property", surfaceId));
    }
  }
}

function validateString(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  surfaceId?: string,
): void {
  if (typeof value !== "string") {
    issues.push(issue(path, "Expected string", surfaceId));
  }
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  const active = new Set<object>();
  const stack: (
    | { value: unknown; exit: false }
    | { value: object; exit: true }
  )[] = [{ value, exit: false }];
  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.exit) {
      active.delete(frame.value);
      continue;
    }
    const current = frame.value;
    if (
      current === null ||
      typeof current === "string" ||
      typeof current === "boolean"
    )
      continue;
    if (typeof current === "number") {
      if (!Number.isFinite(current)) return false;
      continue;
    }
    if (typeof current !== "object" || active.has(current)) return false;
    if (Array.isArray(current)) {
      if (Object.keys(current).length !== current.length) return false;
    } else if (!isRecord(current)) return false;
    active.add(current);
    stack.push({ value: current, exit: true });
    if (Array.isArray(current))
      for (const entry of current) stack.push({ value: entry, exit: false });
    else
      for (const entry of Object.values(current))
        stack.push({ value: entry, exit: false });
  }
  return true;
}

/** Validates an `Extensions` map: identifier keys and JSON values. */
function validateExtensions(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  surfaceId?: string,
): void {
  if (!isRecord(value)) {
    issues.push(issue(path, "Expected object", surfaceId));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (!IDENTIFIER_PATTERN.test(key)) {
      issues.push(
        issue(`${path}/${key}`, "Extension key must be a Unicode identifier", surfaceId),
      );
    }
    if (!isJsonValue(entry)) {
      issues.push(issue(`${path}/${key}`, "Expected JSON value", surfaceId));
    }
  }
}

/**
 * Validates a component list shared by createSurface and updateComponents.
 * Ids must be Unicode identifiers, `Surface` is reserved, and every property
 * must be a JSON value.
 */
function validateComponents(
  components: unknown,
  path: string,
  issues: ValidationIssue[],
  surfaceId: string | undefined,
): void {
  if (!Array.isArray(components)) {
    issues.push(issue(path, "Expected array", surfaceId));
    return;
  }
  if (components.length === 0) {
    issues.push(issue(path, "Expected at least one component", surfaceId));
  }
  components.forEach((component, index) => {
    const componentPath = `${path}/${index}`;
    if (!isRecord(component)) {
      issues.push(issue(componentPath, "Expected object", surfaceId));
      return;
    }
    validateString(component.id, `${componentPath}/id`, issues, surfaceId);
    const hasValidId =
      typeof component.id === "string" && IDENTIFIER_PATTERN.test(component.id);
    if (typeof component.id === "string" && !hasValidId) {
      issues.push(
        issue(`${componentPath}/id`, "Component id must be a Unicode identifier", surfaceId),
      );
    }
    validateString(component.component, `${componentPath}/component`, issues, surfaceId);
    if (component.component === RESERVED_SURFACE_COMPONENT) {
      issues.push(
        issue(
          `${componentPath}/component`,
          "Surface is reserved and cannot be sent as a component",
          surfaceId,
        ),
      );
    }
    for (const [key, value] of Object.entries(component)) {
      if (!isJsonValue(value)) {
        issues.push(issue(`${componentPath}/${key}`, "Expected JSON value", surfaceId));
      }
    }
  });
}

function validateCreateSurface(
  payload: unknown,
  issues: ValidationIssue[],
): void {
  if (!isRecord(payload)) {
    issues.push(issue("/createSurface", "Expected object"));
    return;
  }
  const surfaceId = getSurfaceId(payload);
  validateExactKeys(
    payload,
    ["surfaceId", "catalogId", "sendDataModel", "components", "dataModel", "metadata"],
    "/createSurface",
    issues,
    surfaceId,
  );
  validateString(payload.surfaceId, "/createSurface/surfaceId", issues, surfaceId);
  if ("catalogId" in payload) {
    validateString(payload.catalogId, "/createSurface/catalogId", issues, surfaceId);
  }
  if ("sendDataModel" in payload && typeof payload.sendDataModel !== "boolean") {
    issues.push(issue("/createSurface/sendDataModel", "Expected boolean", surfaceId));
  }
  if ("components" in payload) {
    validateComponents(payload.components, "/createSurface/components", issues, surfaceId);
  }
  if ("dataModel" in payload && (!isRecord(payload.dataModel) || !isJsonValue(payload.dataModel))) {
    issues.push(issue("/createSurface/dataModel", "Expected JSON object", surfaceId));
  }
  if ("metadata" in payload) {
    const metadata = payload.metadata;
    if (!isRecord(metadata)) {
      issues.push(issue("/createSurface/metadata", "Expected object", surfaceId));
    } else {
      validateExactKeys(metadata, ["extensions"], "/createSurface/metadata", issues, surfaceId);
      if ("extensions" in metadata) {
        validateExtensions(metadata.extensions, "/createSurface/metadata/extensions", issues, surfaceId);
      }
    }
  }
}

function validateUpdateComponents(
  payload: unknown,
  issues: ValidationIssue[],
): void {
  if (!isRecord(payload)) {
    issues.push(issue("/updateComponents", "Expected object"));
    return;
  }
  const surfaceId = getSurfaceId(payload);
  validateExactKeys(payload, ["surfaceId", "components"], "/updateComponents", issues, surfaceId);
  validateString(payload.surfaceId, "/updateComponents/surfaceId", issues, surfaceId);
  validateComponents(payload.components, "/updateComponents/components", issues, surfaceId);
}

function validateUpdateDataModel(
  payload: unknown,
  issues: ValidationIssue[],
): void {
  if (!isRecord(payload)) {
    issues.push(issue("/updateDataModel", "Expected object"));
    return;
  }
  const surfaceId = getSurfaceId(payload);
  validateExactKeys(payload, ["surfaceId", "path", "value"], "/updateDataModel", issues, surfaceId);
  validateString(payload.surfaceId, "/updateDataModel/surfaceId", issues, surfaceId);
  if ("path" in payload) {
    validateString(payload.path, "/updateDataModel/path", issues, surfaceId);
  }
  if (!("value" in payload)) {
    issues.push(
      issue("/updateDataModel/value", "Required property (set null to delete)", surfaceId),
    );
  } else if (!isJsonValue(payload.value)) {
    issues.push(issue("/updateDataModel/value", "Expected JSON value", surfaceId));
  }
}

function validateDeleteSurface(
  payload: unknown,
  issues: ValidationIssue[],
): void {
  if (!isRecord(payload)) {
    issues.push(issue("/deleteSurface", "Expected object"));
    return;
  }
  const surfaceId = getSurfaceId(payload);
  validateExactKeys(payload, ["surfaceId"], "/deleteSurface", issues, surfaceId);
  validateString(payload.surfaceId, "/deleteSurface/surfaceId", issues, surfaceId);
}

function validateCallRendererFunction(
  payload: unknown,
  issues: ValidationIssue[],
): void {
  if (!isRecord(payload)) {
    issues.push(issue("/callRendererFunction", "Expected object"));
    return;
  }
  const surfaceId = getSurfaceId(payload);
  validateExactKeys(
    payload,
    ["surfaceId", "functionCallId", "callFunction"],
    "/callRendererFunction",
    issues,
    surfaceId,
  );
  if ("surfaceId" in payload) {
    validateString(payload.surfaceId, "/callRendererFunction/surfaceId", issues, surfaceId);
  }
  validateString(payload.functionCallId, "/callRendererFunction/functionCallId", issues, surfaceId);
  const call = payload.callFunction;
  if (!isRecord(call)) {
    issues.push(issue("/callRendererFunction/callFunction", "Expected object", surfaceId));
    return;
  }
  const callPath = "/callRendererFunction/callFunction";
  validateExactKeys(call, ["@call", "catalogId", "args"], callPath, issues, surfaceId);
  validateString(call["@call"], `${callPath}/@call`, issues, surfaceId);
  validateString(call.catalogId, `${callPath}/catalogId`, issues, surfaceId);
  if ("args" in call && (!isRecord(call.args) || !isJsonValue(call.args))) {
    issues.push(issue(`${callPath}/args`, "Expected JSON object", surfaceId));
  }
}

function validateAgentFunctionResponse(
  payload: unknown,
  issues: ValidationIssue[],
): void {
  if (!isRecord(payload)) {
    issues.push(issue("/agentFunctionResponse", "Expected object"));
    return;
  }
  validateExactKeys(payload, ["functionCallId", "value", "error"], "/agentFunctionResponse", issues);
  validateString(payload.functionCallId, "/agentFunctionResponse/functionCallId", issues);
  const hasValue = "value" in payload;
  const hasError = "error" in payload;
  if (hasValue === hasError) {
    issues.push(issue("/agentFunctionResponse", "Expected exactly one of value or error"));
  }
  if (hasValue && !isJsonValue(payload.value)) {
    issues.push(issue("/agentFunctionResponse/value", "Expected JSON value"));
  }
  if (hasError) {
    const error = payload.error;
    if (!isRecord(error)) {
      issues.push(issue("/agentFunctionResponse/error", "Expected object"));
    } else {
      validateExactKeys(error, ["code", "message"], "/agentFunctionResponse/error", issues);
      validateString(error.code, "/agentFunctionResponse/error/code", issues);
      validateString(error.message, "/agentFunctionResponse/error/message", issues);
    }
  }
}

const validators: Record<
  MessageKey,
  (payload: unknown, issues: ValidationIssue[]) => void
> = {
  createSurface: validateCreateSurface,
  updateComponents: validateUpdateComponents,
  updateDataModel: validateUpdateDataModel,
  deleteSurface: validateDeleteSurface,
  callRendererFunction: validateCallRendererFunction,
  agentFunctionResponse: validateAgentFunctionResponse,
};

/**
 * Validates one agent-to-renderer A2UI v1.0 message. Only wire version "1.0" is
 * accepted; v0.9 and v0.9.1 messages are rejected. The input is not mutated.
 */
export function validateA2UIAgentMessage(
  input: unknown,
): ValidationResult<A2UIAgentMessage> {
  const issues: ValidationIssue[] = [];
  try {
    if (!isRecord(input))
      return { ok: false, issues: [issue("/", "Expected object")] };

    if (input.version !== "1.0") {
      issues.push(issue("/version", 'Expected version "1.0"'));
    }

    const presentMessageKeys = MESSAGE_KEYS.filter((key) => key in input);
    if (presentMessageKeys.length !== 1) {
      issues.push(issue("/", "Expected exactly one A2UI message type"));
    }

    validateExactKeys(input, ["version", ...MESSAGE_KEYS], "", issues);
    if (presentMessageKeys.length === 1) {
      const key = presentMessageKeys[0];
      validators[key](input[key], issues);
    }

    // SAFETY: validation above establishes the discriminated agent-message shape.
    return issues.length === 0
      ? { ok: true, value: input as unknown as A2UIAgentMessage }
      : { ok: false, issues };
  } catch {
    return { ok: false, issues: [issue("/", "Unable to inspect input")] };
  }
}

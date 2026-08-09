import type { ValidationIssue, ValidationResult } from "./errors.js";
import type { A2UIServerMessage, JsonValue } from "./types.js";

const MESSAGE_KEYS = [
  "createSurface",
  "updateComponents",
  "updateDataModel",
  "deleteSurface",
] as const;

type MessageKey = (typeof MESSAGE_KEYS)[number];
type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function issue(path: string, message: string, surfaceId?: string): ValidationIssue {
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

function isJsonValue(value: unknown, ancestors = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (ancestors.has(value)) return false;

  ancestors.add(value);
  const valid = Array.isArray(value)
    ? Object.keys(value).length === value.length && value.every((entry) => isJsonValue(entry, ancestors))
    : isRecord(value) && Object.values(value).every((entry) => isJsonValue(entry, ancestors));
  ancestors.delete(value);
  return valid;
}

function validateCreateSurface(payload: unknown, issues: ValidationIssue[]): void {
  if (!isRecord(payload)) {
    issues.push(issue("/createSurface", "Expected object"));
    return;
  }
  const surfaceId = getSurfaceId(payload);
  validateExactKeys(payload, ["surfaceId", "catalogId", "theme", "sendDataModel"], "/createSurface", issues, surfaceId);
  validateString(payload.surfaceId, "/createSurface/surfaceId", issues, surfaceId);
  validateString(payload.catalogId, "/createSurface/catalogId", issues, surfaceId);
  if ("theme" in payload && (!isRecord(payload.theme) || !isJsonValue(payload.theme))) {
    issues.push(issue("/createSurface/theme", "Expected JSON object", surfaceId));
  }
  if ("sendDataModel" in payload && typeof payload.sendDataModel !== "boolean") {
    issues.push(issue("/createSurface/sendDataModel", "Expected boolean", surfaceId));
  }
}

function validateUpdateComponents(payload: unknown, issues: ValidationIssue[]): void {
  if (!isRecord(payload)) {
    issues.push(issue("/updateComponents", "Expected object"));
    return;
  }
  const surfaceId = getSurfaceId(payload);
  validateExactKeys(payload, ["surfaceId", "components"], "/updateComponents", issues, surfaceId);
  validateString(payload.surfaceId, "/updateComponents/surfaceId", issues, surfaceId);
  if (!Array.isArray(payload.components)) {
    issues.push(issue("/updateComponents/components", "Expected array", surfaceId));
    return;
  }
  if (payload.components.length === 0) {
    issues.push(issue("/updateComponents/components", "Expected at least one component", surfaceId));
  }
  payload.components.forEach((component, index) => {
    const path = `/updateComponents/components/${index}`;
    if (!isRecord(component)) {
      issues.push(issue(path, "Expected object", surfaceId));
      return;
    }
    validateString(component.id, `${path}/id`, issues, surfaceId);
    validateString(component.component, `${path}/component`, issues, surfaceId);
    for (const [key, value] of Object.entries(component)) {
      if (!isJsonValue(value)) {
        issues.push(issue(`${path}/${key}`, "Expected JSON value", surfaceId));
      }
    }
  });
}

function validateUpdateDataModel(payload: unknown, issues: ValidationIssue[]): void {
  if (!isRecord(payload)) {
    issues.push(issue("/updateDataModel", "Expected object"));
    return;
  }
  const surfaceId = getSurfaceId(payload);
  validateExactKeys(payload, ["surfaceId", "path", "value"], "/updateDataModel", issues, surfaceId);
  validateString(payload.surfaceId, "/updateDataModel/surfaceId", issues, surfaceId);
  if ("path" in payload) validateString(payload.path, "/updateDataModel/path", issues, surfaceId);
  if ("value" in payload && !isJsonValue(payload.value)) {
    issues.push(issue("/updateDataModel/value", "Expected JSON value", surfaceId));
  }
}

function validateDeleteSurface(payload: unknown, issues: ValidationIssue[]): void {
  if (!isRecord(payload)) {
    issues.push(issue("/deleteSurface", "Expected object"));
    return;
  }
  const surfaceId = getSurfaceId(payload);
  validateExactKeys(payload, ["surfaceId"], "/deleteSurface", issues, surfaceId);
  validateString(payload.surfaceId, "/deleteSurface/surfaceId", issues, surfaceId);
}

const validators: Record<MessageKey, (payload: unknown, issues: ValidationIssue[]) => void> = {
  createSurface: validateCreateSurface,
  updateComponents: validateUpdateComponents,
  updateDataModel: validateUpdateDataModel,
  deleteSurface: validateDeleteSurface,
};

export function validateA2UIServerMessage(input: unknown): ValidationResult<A2UIServerMessage> {
  const issues: ValidationIssue[] = [];
  try {
    if (!isRecord(input)) return { ok: false, issues: [issue("/", "Expected object")] };

    if (input.version !== "v0.9" && input.version !== "v0.9.1") {
      issues.push(issue("/version", "Expected v0.9 or v0.9.1"));
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

    return issues.length === 0
      ? { ok: true, value: input as unknown as A2UIServerMessage }
      : { ok: false, issues };
  } catch {
    return { ok: false, issues: [issue("/", "Unable to inspect input")] };
  }
}

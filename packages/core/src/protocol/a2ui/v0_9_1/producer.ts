import type {
  A2UIComponent,
  CreateSurfaceMessage,
  DeleteSurfaceMessage,
  JsonObject,
  JsonValue,
  UpdateComponentsMessage,
  UpdateDataModelMessage,
} from "./types.js";
import { validateA2UIServerMessage } from "./validation.js";

/** Inputs accepted by the A2UI v0.9.1 createSurface producer. */
export interface A2UIV091CreateSurfaceInput {
  surfaceId: string;
  catalogId: string;
  theme?: JsonObject;
  sendDataModel?: boolean;
}

/** Inputs accepted by the A2UI v0.9.1 updateComponents producer. */
export interface A2UIV091UpdateComponentsInput {
  surfaceId: string;
  components: readonly A2UIComponent[];
}

/** Inputs accepted by the A2UI v0.9.1 updateDataModel producer. */
export interface A2UIV091UpdateDataModelInput {
  surfaceId: string;
  path?: string;
  value?: JsonValue;
}

/** Inputs accepted by the A2UI v0.9.1 deleteSurface producer. */
export interface A2UIV091DeleteSurfaceInput {
  surfaceId: string;
}

/**
 * Stateless construction helpers for the server-to-client A2UI v0.9.1
 * lifecycle messages supported by Weaver.
 *
 * Construction owns the returned JSON and performs protocol-envelope
 * validation. It does not validate catalog component schemas or runtime
 * lifecycle state; those remain the runtime's responsibilities.
 */
export interface A2UIV091Producer {
  createSurface(input: A2UIV091CreateSurfaceInput): CreateSurfaceMessage;
  updateComponents(input: A2UIV091UpdateComponentsInput): UpdateComponentsMessage;
  updateDataModel(input: A2UIV091UpdateDataModelInput): UpdateDataModelMessage;
  deleteSurface(input: A2UIV091DeleteSurfaceInput): DeleteSurfaceMessage;
}

const VERSION = "v0.9.1" as const;

export function createA2UIV091Producer(): A2UIV091Producer {
  return {
    createSurface: buildCreateSurface,
    updateComponents: buildUpdateComponents,
    updateDataModel: buildUpdateDataModel,
    deleteSurface: buildDeleteSurface,
  };
}

function buildCreateSurface(input: A2UIV091CreateSurfaceInput): CreateSurfaceMessage {
  assertInputObject(input, "createSurface");
  const payload: Record<string, unknown> = {
    surfaceId: input.surfaceId,
    catalogId: input.catalogId,
  };
  if (hasOwn(input, "theme")) payload.theme = input.theme;
  if (hasOwn(input, "sendDataModel")) payload.sendDataModel = input.sendDataModel;
  return validateAndOwn({ version: VERSION, createSurface: payload }) as unknown as CreateSurfaceMessage;
}

function buildUpdateComponents(input: A2UIV091UpdateComponentsInput): UpdateComponentsMessage {
  assertInputObject(input, "updateComponents");
  return validateAndOwn({
    version: VERSION,
    updateComponents: {
      surfaceId: input.surfaceId,
      components: input.components,
    },
  }) as unknown as UpdateComponentsMessage;
}

function buildUpdateDataModel(input: A2UIV091UpdateDataModelInput): UpdateDataModelMessage {
  assertInputObject(input, "updateDataModel");
  const payload: Record<string, unknown> = { surfaceId: input.surfaceId };
  if (hasOwn(input, "path")) payload.path = input.path;
  if (hasOwn(input, "value")) payload.value = input.value;
  return validateAndOwn({ version: VERSION, updateDataModel: payload }) as unknown as UpdateDataModelMessage;
}

function buildDeleteSurface(input: A2UIV091DeleteSurfaceInput): DeleteSurfaceMessage {
  assertInputObject(input, "deleteSurface");
  return validateAndOwn({
    version: VERSION,
    deleteSurface: { surfaceId: input.surfaceId },
  }) as unknown as DeleteSurfaceMessage;
}

function validateAndOwn(input: unknown): JsonObject {
  const owned = cloneJsonValue(input);
  const validation = validateA2UIServerMessage(owned);
  if (!validation.ok) {
    const firstIssue = validation.issues[0];
    throw new TypeError(`Invalid A2UI v0.9.1 producer input at ${firstIssue.path}: ${firstIssue.message}`);
  }
  return owned as JsonObject;
}

function cloneJsonValue(value: unknown, ancestors = new Set<object>()): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    throw new TypeError("A2UI producer input must contain finite JSON numbers");
  }
  if (typeof value !== "object") {
    throw new TypeError("A2UI producer input must contain JSON values");
  }
  if (ancestors.has(value)) throw new TypeError("A2UI producer input must not contain cycles");

  ancestors.add(value);
  let clone: JsonValue;
  if (Array.isArray(value)) {
    clone = value.map((entry) => cloneJsonValue(entry, ancestors));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("A2UI producer input must contain plain JSON objects");
    }
    const object: JsonObject = {};
    for (const [key, entry] of Object.entries(value)) {
      Object.defineProperty(object, key, {
        configurable: true,
        enumerable: true,
        value: cloneJsonValue(entry, ancestors),
        writable: true,
      });
    }
    clone = object;
  }
  ancestors.delete(value);
  return clone;
}

function assertInputObject(value: unknown, name: string): asserts value is object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} producer input must be an object`);
  }
}

function hasOwn<T extends object>(value: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

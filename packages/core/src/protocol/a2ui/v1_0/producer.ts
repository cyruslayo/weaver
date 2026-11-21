import type {
  A2UIComponent,
  A2UISurfaceMetadata,
  CreateSurfaceMessage,
  DeleteSurfaceMessage,
  JsonObject,
  JsonValue,
  UpdateComponentsMessage,
  UpdateDataModelMessage,
} from "./types.js";
import { validateA2UIAgentMessage } from "./validation.js";

/** Inputs accepted by the A2UI v1.0 createSurface producer. */
export interface A2UIV10CreateSurfaceInput {
  surfaceId: string;
  catalogId?: string;
  sendDataModel?: boolean;
  components?: readonly A2UIComponent[];
  dataModel?: JsonObject;
  metadata?: A2UISurfaceMetadata;
}

/** Inputs accepted by the A2UI v1.0 updateComponents producer. */
export interface A2UIV10UpdateComponentsInput {
  surfaceId: string;
  components: readonly A2UIComponent[];
}

/** Inputs accepted by the A2UI v1.0 updateDataModel producer. `value` is required; null deletes. */
export interface A2UIV10UpdateDataModelInput {
  surfaceId: string;
  path?: string;
  value: JsonValue;
}

/** Inputs accepted by the A2UI v1.0 deleteSurface producer. */
export interface A2UIV10DeleteSurfaceInput {
  surfaceId: string;
}

/**
 * Stateless construction helpers for the server-to-client A2UI v1.0
 * lifecycle messages supported by Weaver.
 *
 * Construction owns the returned JSON and performs protocol-envelope
 * validation. It does not validate catalog component schemas or runtime
 * lifecycle state; those remain the runtime's responsibilities.
 */
export interface A2UIV10Producer {
  createSurface(input: A2UIV10CreateSurfaceInput): CreateSurfaceMessage;
  updateComponents(
    input: A2UIV10UpdateComponentsInput,
  ): UpdateComponentsMessage;
  updateDataModel(input: A2UIV10UpdateDataModelInput): UpdateDataModelMessage;
  deleteSurface(input: A2UIV10DeleteSurfaceInput): DeleteSurfaceMessage;
}

const VERSION = "1.0" as const;

export function createA2UIV10Producer(): A2UIV10Producer {
  return {
    createSurface: buildCreateSurface,
    updateComponents: buildUpdateComponents,
    updateDataModel: buildUpdateDataModel,
    deleteSurface: buildDeleteSurface,
  };
}

function buildCreateSurface(
  input: A2UIV10CreateSurfaceInput,
): CreateSurfaceMessage {
  assertInputObject(input, "createSurface");
  const payload: Record<string, unknown> = { surfaceId: input.surfaceId };
  if (hasOwn(input, "catalogId")) payload.catalogId = input.catalogId;
  if (hasOwn(input, "sendDataModel"))
    payload.sendDataModel = input.sendDataModel;
  if (hasOwn(input, "components")) payload.components = input.components;
  if (hasOwn(input, "dataModel")) payload.dataModel = input.dataModel;
  if (hasOwn(input, "metadata")) payload.metadata = input.metadata;
  // SAFETY: validateAndOwn validates and owns the exact CreateSurface message shape.
  return validateAndOwn({
    version: VERSION,
    createSurface: payload,
  }) as unknown as CreateSurfaceMessage;
}

function buildUpdateComponents(
  input: A2UIV10UpdateComponentsInput,
): UpdateComponentsMessage {
  assertInputObject(input, "updateComponents");
  // SAFETY: validateAndOwn validates and owns the exact UpdateComponents message shape.
  return validateAndOwn({
    version: VERSION,
    updateComponents: {
      surfaceId: input.surfaceId,
      components: input.components,
    },
  }) as unknown as UpdateComponentsMessage;
}

function buildUpdateDataModel(
  input: A2UIV10UpdateDataModelInput,
): UpdateDataModelMessage {
  assertInputObject(input, "updateDataModel");
  const payload: Record<string, unknown> = { surfaceId: input.surfaceId };
  if (hasOwn(input, "path")) payload.path = input.path;
  // value is required on the wire; null is the deletion sentinel and is kept.
  payload.value = input.value;
  // SAFETY: validateAndOwn validates and owns the exact UpdateDataModel message shape.
  return validateAndOwn({
    version: VERSION,
    updateDataModel: payload,
  }) as unknown as UpdateDataModelMessage;
}

function buildDeleteSurface(
  input: A2UIV10DeleteSurfaceInput,
): DeleteSurfaceMessage {
  assertInputObject(input, "deleteSurface");
  // SAFETY: validateAndOwn validates and owns the exact DeleteSurface message shape.
  return validateAndOwn({
    version: VERSION,
    deleteSurface: { surfaceId: input.surfaceId },
  }) as unknown as DeleteSurfaceMessage;
}

function validateAndOwn(input: unknown): JsonObject {
  const owned = cloneJsonValue(input);
  const validation = validateA2UIAgentMessage(owned);
  if (!validation.ok) {
    const firstIssue = validation.issues[0];
    throw new TypeError(
      `Invalid A2UI v1.0 producer input at ${firstIssue.path}: ${firstIssue.message}`,
    );
  }
  return owned as JsonObject;
}

interface ProducerCloneFrame {
  source: JsonValue[] | JsonObject;
  target: JsonValue[] | JsonObject;
  keys?: string[];
  index: number;
}

function cloneJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    throw new TypeError("A2UI producer input must contain finite JSON numbers");
  }
  if (typeof value !== "object") {
    throw new TypeError("A2UI producer input must contain JSON values");
  }

  const root: JsonValue[] | JsonObject = Array.isArray(value) ? [] : {};
  const active = new Set<object>([value]);
  const frames: ProducerCloneFrame[] = [
    Array.isArray(value)
      ? { source: value, target: root as JsonValue[], index: 0 }
      : {
          source: value as JsonObject,
          target: root as JsonObject,
          keys: Object.keys(value),
          index: 0,
        },
  ];

  while (frames.length > 0) {
    const frame = frames[frames.length - 1]!;
    let key: number | string;
    let entry: unknown;
    if (Array.isArray(frame.source)) {
      if (frame.index === frame.source.length) {
        active.delete(frame.source);
        frames.pop();
        continue;
      }
      key = frame.index;
      entry = frame.source[frame.index];
      frame.index += 1;
    } else {
      if (frame.keys === undefined)
        throw new TypeError("A2UI producer input must contain JSON values");
      if (frame.index === frame.keys.length) {
        active.delete(frame.source);
        frames.pop();
        continue;
      }
      key = frame.keys[frame.index]!;
      entry = frame.source[key];
      frame.index += 1;
    }

    let cloned: JsonValue;
    if (
      entry === null ||
      typeof entry === "string" ||
      typeof entry === "boolean"
    )
      cloned = entry;
    else if (typeof entry === "number") {
      if (!Number.isFinite(entry))
        throw new TypeError(
          "A2UI producer input must contain finite JSON numbers",
        );
      cloned = entry;
    } else {
      if (typeof entry !== "object")
        throw new TypeError("A2UI producer input must contain JSON values");
      if (active.has(entry))
        throw new TypeError("A2UI producer input must not contain cycles");
      if (!Array.isArray(entry)) {
        const prototype = Object.getPrototypeOf(entry);
        if (prototype !== Object.prototype && prototype !== null) {
          throw new TypeError(
            "A2UI producer input must contain plain JSON objects",
          );
        }
      }
      const child: JsonValue[] | JsonObject = Array.isArray(entry) ? [] : {};
      if (Array.isArray(frame.target)) frame.target[key as number] = child;
      else
        Object.defineProperty(frame.target, key as string, {
          configurable: true,
          enumerable: true,
          value: child,
          writable: true,
        });
      active.add(entry);
      frames.push(
        Array.isArray(entry)
          ? { source: entry, target: child as JsonValue[], index: 0 }
          : {
              source: entry as JsonObject,
              target: child as JsonObject,
              keys: Object.keys(entry),
              index: 0,
            },
      );
      continue;
    }

    if (Array.isArray(frame.target)) frame.target[key as number] = cloned;
    else
      Object.defineProperty(frame.target, key as string, {
        configurable: true,
        enumerable: true,
        value: cloned,
        writable: true,
      });
  }
  return root;
}

function assertInputObject(
  value: unknown,
  name: string,
): asserts value is object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} producer input must be an object`);
  }
}

function hasOwn<T extends object>(value: T, key: PropertyKey): boolean {
  return Object.hasOwn(value, key);
}

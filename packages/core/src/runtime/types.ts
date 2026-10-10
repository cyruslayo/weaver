import type {
  ActionDispatchError,
  ActionDispatchResult,
} from "../actions/index.js";
import type {
  CatalogRegistration,
  CatalogRegistryError,
} from "../catalog/index.js";
import type { ComponentCheckTreeSnapshot } from "../checks/index.js";
import type {
  ComponentInstanceError,
  ComponentInstanceIssue,
} from "../component-instances/index.js";
import type {
  ComponentPropertyError,
  ComponentPropertyIssue,
  HydratedComponentTree,
} from "../component-properties/index.js";
import type {
  ComponentTreeError,
  ComponentTreeIssue,
} from "../component-tree/index.js";
import type {
  FunctionRegistration,
  FunctionRegistryError,
} from "../functions/index.js";
import type {
  InputBindingWriteError,
  InputBindingWriteSuccess,
} from "../input-binding/index.js";
import type { MessageProcessorResult } from "../message-processor/index.js";
import type { JsonValue } from "../protocol/index.js";
import type { WeaverRuntime } from "./WeaverRuntime.js";
import type {
  WeaverRuntimeSafetyConfig,
  WeaverRuntimeSafetyConfigurationError,
} from "./safety.js";

export interface WeaverRuntimeConfig {
  catalogs: readonly CatalogRegistration[];
  functions?: readonly FunctionRegistration[];
  now?: () => Date;
  safety?: WeaverRuntimeSafetyConfig;
  /**
   * Opt-in observer. It receives a defensive copy of each message, input write
   * and action outcome, in order. Exceptions it throws are ignored, so it can
   * never change runtime results or state.
   */
  observer?: WeaverRuntimeObserver;
}

/**
 * Event delivered to a WeaverRuntime observer. Payloads are defensive copies,
 * and observing never changes a result or the runtime's state.
 *
 * Caller-supplied values are checked before they are copied, whether or not the
 * runtime accepted them. A value that is not JSON-safe (a cycle, a non-plain
 * object, a non-finite number, or an undefined member) is delivered as
 * `{ unserializable: true }` in place of the value. This applies to the
 * `message` input, the `input` request value, and a host local-function value
 * in an `action` result.
 *
 * An `action` request that is not JSON-safe is delivered reduced to its four
 * typed fields (`surfaceId`, `sourceComponentId`, `scopePath`, `actionProperty`).
 * Any of those fields that is not a JSON-safe string is delivered as `""`. Extra
 * fields are not delivered. A JSON-safe request is delivered whole.
 *
 * Core result objects are JSON-safe by construction. If one were not, the event
 * would not be delivered, as when an observer throws.
 */
export type WeaverRuntimeEvent =
  | { kind: "message"; input: unknown; result: MessageProcessorResult }
  | {
      kind: "input";
      request: WeaverInputRequest;
      result: WeaverInputResult;
    }
  | {
      kind: "action";
      request: WeaverActionRequest;
      result: WeaverActionResult;
    };

export type WeaverRuntimeObserver = (event: WeaverRuntimeEvent) => void;

export type WeaverRuntimeConfigurationError =
  | { code: "CATALOG_CONFIGURATION_FAILED"; catalogError: CatalogRegistryError }
  | {
      code: "FUNCTION_CONFIGURATION_FAILED";
      functionError: FunctionRegistryError;
    }
  | {
      code: "SAFETY_CONFIGURATION_FAILED";
      safetyError: WeaverRuntimeSafetyConfigurationError;
    };

export type WeaverRuntimeCreationResult =
  | { ok: true; value: WeaverRuntime }
  | { ok: false; error: WeaverRuntimeConfigurationError };

export interface WeaverResolvedSurface {
  surfaceId: string;
  catalogId: string;
  theme?: import("../protocol/index.js").JsonObject;
  sendDataModel: boolean;
  tree: HydratedComponentTree;
  checks: ComponentCheckTreeSnapshot;
  issues: {
    tree: ComponentTreeIssue[];
    instances: ComponentInstanceIssue[];
    properties: ComponentPropertyIssue[];
  };
}

export type WeaverSurfaceResolutionError =
  | { code: "SURFACE_NOT_FOUND"; surfaceId: string }
  | { code: "COMPONENT_TREE_RESOLUTION_FAILED"; cause: ComponentTreeError }
  | {
      code: "COMPONENT_INSTANCE_RESOLUTION_FAILED";
      cause: ComponentInstanceError;
    }
  | {
      code: "COMPONENT_PROPERTY_RESOLUTION_FAILED";
      cause: ComponentPropertyError;
    }
  | {
      code: "CHECK_EVALUATION_FAILED";
      cause: import("../checks/index.js").CheckEvaluatorError;
    };

export type WeaverSurfaceResolutionResult =
  | { ok: true; value: WeaverResolvedSurface }
  | { ok: false; error: WeaverSurfaceResolutionError };

export interface WeaverInstanceIdentity {
  surfaceId: string;
  sourceComponentId: string;
  scopePath: string;
}

export interface WeaverInputRequest extends WeaverInstanceIdentity {
  property: string;
  value: JsonValue;
}

export interface WeaverActionRequest extends WeaverInstanceIdentity {
  actionProperty: string;
}

export type WeaverRuntimeInteractionError =
  | { code: "SURFACE_NOT_FOUND"; surfaceId: string }
  | { code: "INSTANCE_RESOLUTION_FAILED"; cause: ComponentInstanceError }
  | {
      code: "INSTANCE_NOT_FOUND";
      surfaceId: string;
      sourceComponentId: string;
      scopePath: string;
    }
  | { code: "INPUT_WRITE_FAILED"; cause: InputBindingWriteError }
  | { code: "ACTION_DISPATCH_FAILED"; cause: ActionDispatchError };

export type WeaverInputResult =
  | { ok: true; value: InputBindingWriteSuccess }
  | { ok: false; error: WeaverRuntimeInteractionError };

export type WeaverActionResult =
  | Extract<ActionDispatchResult, { ok: true }>
  | { ok: false; error: WeaverRuntimeInteractionError };

export type WeaverSurfaceSubscriber = (
  result: WeaverSurfaceResolutionResult,
) => void;

export interface WeaverRuntimeSafetyConfig {
  maxResolutionDepth?: number;
  maxResolvedInstances?: number;
}

export interface ResolutionSafetyPolicy {
  readonly maxResolutionDepth: number;
  readonly maxResolvedInstances: number;
}

export type SafetyLimit = "maxResolutionDepth" | "maxResolvedInstances";

export type WeaverRuntimeSafetyConfigurationError =
  | {
      code: "INVALID_SAFETY_LIMIT";
      limit: SafetyLimit;
      reason: SafetyLimitReason;
    }
  | {
      code: "INVALID_SAFETY_CONFIGURATION";
      reason: "MUST_BE_OBJECT";
    };

export type SafetyLimitReason =
  | "MUST_BE_POSITIVE_SAFE_INTEGER"
  | "EXCEEDS_HOST_MAXIMUM";

export type ResolutionBudgetKind = "depth" | "instances";
export type ResolutionBudgetPhase = "component-tree" | "component-instances";

export interface ResolutionBudgetExceededError {
  code: "RESOLUTION_BUDGET_EXCEEDED";
  message: string;
  budget: ResolutionBudgetKind;
  limit: number;
  observed: number;
  phase: ResolutionBudgetPhase;
  componentId?: string;
}

const DEFAULT_MAX_RESOLUTION_DEPTH = 32;
const DEFAULT_MAX_RESOLVED_INSTANCES = 1000;
const MAX_CONFIGURED_RESOLUTION_DEPTH = 256;
const MAX_CONFIGURED_RESOLVED_INSTANCES = 100_000;
const MAX_ERROR_COMPONENT_ID_LENGTH = 128;

function boundedComponentId(componentId: string): string {
  return componentId.length <= MAX_ERROR_COMPONENT_ID_LENGTH
    ? componentId
    : `${componentId.slice(0, MAX_ERROR_COMPONENT_ID_LENGTH - 3)}...`;
}

function invalidLimit(
  limit: SafetyLimit,
  reason: SafetyLimitReason,
): WeaverRuntimeSafetyConfigurationError {
  return { code: "INVALID_SAFETY_LIMIT", limit, reason };
}

function normalizeLimit(
  limit: SafetyLimit,
  value: unknown,
  maximum: number,
):
  | { ok: true; value: number }
  | { ok: false; error: WeaverRuntimeSafetyConfigurationError } {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    return {
      ok: false,
      error: invalidLimit(limit, "MUST_BE_POSITIVE_SAFE_INTEGER"),
    };
  }
  if (value > maximum) {
    return { ok: false, error: invalidLimit(limit, "EXCEEDS_HOST_MAXIMUM") };
  }
  return { ok: true, value };
}

export function normalizeResolutionSafety(
  config: WeaverRuntimeSafetyConfig | undefined,
):
  | { ok: true; value: ResolutionSafetyPolicy }
  | { ok: false; error: WeaverRuntimeSafetyConfigurationError } {
  if (
    config !== undefined &&
    (config === null || typeof config !== "object" || Array.isArray(config))
  ) {
    return {
      ok: false,
      error: { code: "INVALID_SAFETY_CONFIGURATION", reason: "MUST_BE_OBJECT" },
    };
  }

  const depth = normalizeLimit(
    "maxResolutionDepth",
    config?.maxResolutionDepth ?? DEFAULT_MAX_RESOLUTION_DEPTH,
    MAX_CONFIGURED_RESOLUTION_DEPTH,
  );
  if (!depth.ok) return depth;
  const instances = normalizeLimit(
    "maxResolvedInstances",
    config?.maxResolvedInstances ?? DEFAULT_MAX_RESOLVED_INSTANCES,
    MAX_CONFIGURED_RESOLVED_INSTANCES,
  );
  if (!instances.ok) return instances;

  return {
    ok: true,
    value: Object.freeze({
      maxResolutionDepth: depth.value,
      maxResolvedInstances: instances.value,
    }),
  };
}

export class ResolutionBudget {
  #treeNodes = 0;
  #instances = 0;

  constructor(private readonly policy: ResolutionSafetyPolicy) {}

  checkDepth(
    depth: number,
    phase: ResolutionBudgetPhase,
    componentId: string,
  ): ResolutionBudgetExceededError | undefined {
    if (depth <= this.policy.maxResolutionDepth) return undefined;
    return {
      code: "RESOLUTION_BUDGET_EXCEEDED",
      message: `Maximum ${phase} resolution depth exceeded`,
      budget: "depth",
      limit: this.policy.maxResolutionDepth,
      observed: depth,
      phase,
      componentId: boundedComponentId(componentId),
    };
  }

  consumeTreeNode(
    componentId: string,
  ): ResolutionBudgetExceededError | undefined {
    const observed = this.#treeNodes + 1;
    if (observed > this.policy.maxResolvedInstances) {
      return {
        code: "RESOLUTION_BUDGET_EXCEEDED",
        message: "Maximum resolved component-tree node count exceeded",
        budget: "instances",
        limit: this.policy.maxResolvedInstances,
        observed,
        phase: "component-tree",
        componentId: boundedComponentId(componentId),
      };
    }
    this.#treeNodes = observed;
    return undefined;
  }

  consumeInstance(
    componentId: string,
  ): ResolutionBudgetExceededError | undefined {
    const observed = this.#instances + 1;
    if (observed > this.policy.maxResolvedInstances) {
      return {
        code: "RESOLUTION_BUDGET_EXCEEDED",
        message: "Maximum resolved component-instance count exceeded",
        budget: "instances",
        limit: this.policy.maxResolvedInstances,
        observed,
        phase: "component-instances",
        componentId: boundedComponentId(componentId),
      };
    }
    this.#instances = observed;
    return undefined;
  }
}

export function createResolutionBudget(
  policy: ResolutionSafetyPolicy,
): ResolutionBudget {
  return new ResolutionBudget(policy);
}

export function isResolutionBudgetExceededError(
  value: unknown,
): value is ResolutionBudgetExceededError {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as { code?: unknown }).code === "RESOLUTION_BUDGET_EXCEEDED"
  );
}

export function defaultResolutionSafetyPolicy(): ResolutionSafetyPolicy {
  return Object.freeze({
    maxResolutionDepth: DEFAULT_MAX_RESOLUTION_DEPTH,
    maxResolvedInstances: DEFAULT_MAX_RESOLVED_INSTANCES,
  });
}

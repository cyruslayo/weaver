import type { CatalogRegistry } from "../catalog/index.js";
import { componentCatalogId } from "../catalog/catalogResolution.js";
import type { AgentFunctionScope } from "../agent-functions/types.js";
import type { ResolvedComponentInstance } from "../component-instances/index.js";
import { DataContext } from "../data-context/index.js";
import { FunctionEvaluator, isDataBinding, isFunctionCall } from "../functions/index.js";
import type { SurfaceSnapshot } from "../surfaces/index.js";
import type {
  CheckEvaluationIssue,
  CheckEvaluationResult,
  CheckSeverity,
  CheckStatus,
  CheckTreeEvaluationResult,
  ComponentCheckSnapshot,
  ComponentCheckStatus,
  ComponentInstanceTreeInput,
  EvaluatedCheck,
} from "./types.js";

/** A CheckRule. The condition is a DataBinding or FunctionCall; the message is optional. */
interface CheckRule {
  condition: unknown;
  message?: unknown;
}

const SEVERITIES: ReadonlySet<string> = new Set(["error", "warning", "info"]);

function actualType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function statusFor(checks: readonly EvaluatedCheck[]): ComponentCheckStatus {
  if (checks.some(({ status }) => status === "failed")) return "invalid";
  if (checks.some(({ status }) => status === "error")) return "error";
  if (checks.some(({ status }) => status === "pending")) return "pending";
  return "valid";
}

function isCheckRule(value: unknown): value is CheckRule {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  if (!Object.hasOwn(value, "condition")) return false;
  const message = (value as CheckRule).message;
  return message === undefined || typeof message === "string";
}

interface ValidationResultParts {
  valid: boolean;
  code?: string;
  message?: string;
  severity?: CheckSeverity;
}

/** A ValidationResult: a boolean `valid`, with optional well-typed code, message and severity. */
function validationResultParts(value: unknown): ValidationResultParts | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.valid !== "boolean") return undefined;
  if (record.code !== undefined && typeof record.code !== "string") return undefined;
  if (record.message !== undefined && typeof record.message !== "string") return undefined;
  if (record.severity !== undefined && (typeof record.severity !== "string" || !SEVERITIES.has(record.severity))) {
    return undefined;
  }
  return {
    valid: record.valid,
    ...(record.code === undefined ? {} : { code: record.code as string }),
    ...(record.message === undefined ? {} : { message: record.message as string }),
    ...(record.severity === undefined ? {} : { severity: record.severity as CheckSeverity }),
  };
}

/** Computes current validation without storing, subscribing, or applying presentation policy. */
export class CheckEvaluator {
  constructor(
    private readonly catalogs: CatalogRegistry,
    private readonly functionEvaluator: FunctionEvaluator,
  ) {}

  /**
   * Evaluates the component's checks. Checkability and the check schema come from the component's own
   * resolved catalog. Each check's FunctionCall resolves against surfaceCatalogId, the surface default.
   */
  evaluate(
    surfaceCatalogId: string | undefined,
    instance: ResolvedComponentInstance,
    dataContext: DataContext,
    scope?: AgentFunctionScope,
  ): CheckEvaluationResult {
    const catalogId = componentCatalogId(instance.definition, surfaceCatalogId);
    if (catalogId === undefined) {
      return {
        ok: false,
        error: {
          code: "CATALOG_RESOLUTION_FAILED",
          message: `Component "${instance.sourceComponentId}" names no @catalogId, and the surface has no default catalogId`,
          sourceComponentId: instance.sourceComponentId,
          scopePath: instance.scopePath,
        },
      };
    }
    const checkable = this.catalogs.isComponentCheckable(catalogId, instance.component);
    if (!checkable) return { ok: true, value: this.snapshot(instance, false, []) };

    const declared = instance.definition["@checks"];
    const definitions = Array.isArray(declared) ? declared : [];
    const checks = definitions.map((definition, index) =>
      this.evaluateCheck(surfaceCatalogId, definition, index, dataContext, scope),
    );
    return { ok: true, value: this.snapshot(instance, true, checks) };
  }

  evaluateTree(surface: SurfaceSnapshot, instances: ComponentInstanceTreeInput): CheckTreeEvaluationResult {
    if (!instances.ready || instances.root === undefined) {
      return { ok: true, value: { ready: false, components: [] } };
    }
    const components: ComponentCheckSnapshot[] = [];
    const visit = (instance: ResolvedComponentInstance, context: DataContext): CheckTreeEvaluationResult | undefined => {
      const own = this.evaluate(surface.catalogId, instance, context, { surfaceId: surface.surfaceId, kind: "reactive" });
      if (!own.ok) return own as CheckTreeEvaluationResult;
      components.push(own.value);
      for (const relationship of instance.relationships) {
        if (relationship.kind === "single") {
          if (relationship.child !== undefined) {
            const failed = visit(relationship.child, context);
            if (failed !== undefined) return failed;
          }
        } else if (relationship.kind === "list") {
          for (const child of relationship.children) {
            const failed = visit(child, context);
            if (failed !== undefined) return failed;
          }
        } else {
          for (const child of relationship.children) {
            const childContext =
              child.collectionIndex === undefined
                ? { ok: false as const, error: { code: "INVALID_COLLECTION_INDEX" as const, index: Number.NaN } }
                : context.createCollectionItemContext(relationship.collectionPath, child.collectionIndex);
            if (!childContext.ok) {
              return {
                ok: false,
                error: {
                  code: "CHECK_DATA_CONTEXT_RECONSTRUCTION_FAILED",
                  message: "Could not reconstruct the component check data scope",
                  sourceComponentId: child.sourceComponentId,
                  scopePath: child.scopePath,
                  cause: { ...childContext.error },
                },
              };
            }
            const failed = visit(child, childContext.value);
            if (failed !== undefined) return failed;
          }
        }
      }
      return undefined;
    };
    const failed = visit(instances.root, DataContext.root(surface.dataModel));
    return failed ?? { ok: true, value: { ready: true, components } };
  }

  private snapshot(instance: ResolvedComponentInstance, checkable: boolean, checks: EvaluatedCheck[]): ComponentCheckSnapshot {
    return {
      sourceComponentId: instance.sourceComponentId,
      scopePath: instance.scopePath,
      ...(instance.collectionIndex === undefined ? {} : { collectionIndex: instance.collectionIndex }),
      checkable,
      status: statusFor(checks),
      checks,
    };
  }

  private evaluateCheck(
    surfaceCatalogId: string | undefined,
    definition: unknown,
    index: number,
    dataContext: DataContext,
    scope: AgentFunctionScope | undefined,
  ): EvaluatedCheck {
    if (!isCheckRule(definition)) return this.typeError(index, undefined, definition);
    const { condition } = definition;
    const message = definition.message as string | undefined;
    if (isDataBinding(condition)) {
      const resolved = dataContext.resolveBinding(condition);
      if (!resolved.ok) {
        return this.issueResult(index, message, { code: "CHECK_BINDING_RESOLUTION_FAILED", error: { ...resolved.error } });
      }
      return this.conditionResult(index, message, resolved.value);
    }
    if (isFunctionCall(condition)) {
      const evaluated = this.functionEvaluator.evaluate(surfaceCatalogId, condition, dataContext, scope);
      if (!evaluated.ok) {
        return this.issueResult(index, message, { code: "CHECK_FUNCTION_EVALUATION_FAILED", error: { ...evaluated.error } });
      }
      return this.conditionResult(index, message, evaluated.value);
    }
    return this.typeError(index, message, condition);
  }

  /**
   * CheckRule coercion (a2ui_protocol.md, "DynamicBoolean and CheckRule Coercion"): a boolean
   * becomes {valid}, with CheckRule.message on failure; a ValidationResult keeps its own
   * message, code and severity. An absent value is pending, not failed.
   */
  private conditionResult(index: number, message: string | undefined, value: unknown): EvaluatedCheck {
    if (value === undefined) return { index, status: "pending", severity: "error", issues: [] };
    if (typeof value === "boolean") {
      return {
        index,
        status: value ? "passed" : "failed",
        ...(message === undefined ? {} : { message }),
        severity: "error",
        issues: [],
      };
    }
    const parts = validationResultParts(value);
    if (parts === undefined) return this.typeError(index, message, value);
    const severity = parts.severity ?? "error";
    const resolvedMessage = parts.message ?? message;
    const status: CheckStatus = parts.valid ? "passed" : severity === "error" ? "failed" : "advisory";
    return {
      index,
      status,
      ...(resolvedMessage === undefined ? {} : { message: resolvedMessage }),
      ...(parts.code === undefined ? {} : { code: parts.code }),
      severity,
      issues: [],
    };
  }

  private typeError(index: number, message: string | undefined, value: unknown): EvaluatedCheck {
    return this.issueResult(index, message, {
      code: "CHECK_CONDITION_TYPE_MISMATCH",
      expected: "ValidationResult",
      actual: actualType(value),
    });
  }

  private issueResult(index: number, message: string | undefined, issue: CheckEvaluationIssue): EvaluatedCheck {
    return { index, status: "error", ...(message === undefined ? {} : { message }), severity: "error", issues: [issue] };
  }
}

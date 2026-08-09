import type { CatalogRegistry } from "../catalog/index.js";
import type { ResolvedComponentInstance } from "../component-instances/index.js";
import { DataContext, isDataPathBinding } from "../data-context/index.js";
import { FunctionEvaluator, isFunctionCall } from "../functions/index.js";
import type { SurfaceSnapshot } from "../surfaces/index.js";
import type {
  CheckEvaluationIssue,
  CheckEvaluationResult,
  CheckStatus,
  CheckTreeEvaluationResult,
  ComponentCheckSnapshot,
  ComponentCheckStatus,
  ComponentInstanceTreeInput,
  EvaluatedCheck,
} from "./types.js";

interface CheckRule { condition: unknown; message: string }

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
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).message === "string" &&
    Object.hasOwn(value, "condition");
}

/** Computes current validation without storing, subscribing, or applying presentation policy. */
export class CheckEvaluator {
  constructor(
    private readonly catalogs: CatalogRegistry,
    private readonly functionEvaluator: FunctionEvaluator,
  ) {}

  evaluate(
    catalogId: string,
    instance: ResolvedComponentInstance,
    dataContext: DataContext,
  ): CheckEvaluationResult {
    const checkable = this.catalogs.isComponentCheckable(catalogId, instance.component);
    if (!checkable) return { ok: true, value: this.snapshot(instance, false, []) };

    const definitions = Array.isArray(instance.definition.checks) ? instance.definition.checks : [];
    const checks = definitions.map((definition, index) =>
      this.evaluateCheck(catalogId, definition, index, dataContext));
    return { ok: true, value: this.snapshot(instance, true, checks) };
  }

  evaluateTree(surface: SurfaceSnapshot, instances: ComponentInstanceTreeInput): CheckTreeEvaluationResult {
    if (!instances.ready || instances.root === undefined) {
      return { ok: true, value: { ready: false, components: [] } };
    }
    const components: ComponentCheckSnapshot[] = [];
    const visit = (instance: ResolvedComponentInstance, context: DataContext): CheckTreeEvaluationResult | undefined => {
      const own = this.evaluate(surface.catalogId, instance, context);
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
            const childContext = child.collectionIndex === undefined
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

  private snapshot(
    instance: ResolvedComponentInstance,
    checkable: boolean,
    checks: EvaluatedCheck[],
  ): ComponentCheckSnapshot {
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
    catalogId: string,
    definition: unknown,
    index: number,
    dataContext: DataContext,
  ): EvaluatedCheck {
    if (!isCheckRule(definition)) return this.typeError(index, "", definition);
    const { condition, message } = definition;
    if (typeof condition === "boolean") return this.booleanResult(index, message, condition);
    if (isDataPathBinding(condition)) {
      const resolved = dataContext.resolveBinding(condition);
      if (!resolved.ok) {
        return this.issueResult(index, message, {
          code: "CHECK_BINDING_RESOLUTION_FAILED", error: { ...resolved.error },
        });
      }
      return this.valueResult(index, message, resolved.value);
    }
    if (isFunctionCall(condition)) {
      const evaluated = this.functionEvaluator.evaluate(catalogId, condition, dataContext);
      if (!evaluated.ok) {
        return this.issueResult(index, message, {
          code: "CHECK_FUNCTION_EVALUATION_FAILED", error: { ...evaluated.error },
        });
      }
      return this.valueResult(index, message, evaluated.value);
    }
    return this.typeError(index, message, condition);
  }

  private valueResult(index: number, message: string, value: unknown): EvaluatedCheck {
    if (value === undefined) return { index, status: "pending", message, issues: [] };
    if (typeof value === "boolean") return this.booleanResult(index, message, value);
    return this.typeError(index, message, value);
  }

  private booleanResult(index: number, message: string, value: boolean): EvaluatedCheck {
    return { index, status: value ? "passed" : "failed", message, issues: [] };
  }

  private typeError(index: number, message: string, value: unknown): EvaluatedCheck {
    return this.issueResult(index, message, {
      code: "CHECK_CONDITION_TYPE_MISMATCH", expected: "boolean", actual: actualType(value),
    });
  }

  private issueResult(index: number, message: string, issue: CheckEvaluationIssue): EvaluatedCheck {
    return { index, status: "error" as CheckStatus, message, issues: [issue] };
  }
}

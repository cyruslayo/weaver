import type { ActionContextResolutionError, ActionDispatchError } from "../actions/index.js";
import type {
  CatalogRegistryError,
  CatalogValidationIssue,
} from "../catalog/index.js";
import type { CheckEvaluatorError, ComponentCheckSnapshot } from "../checks/index.js";
import type { ComponentInstanceError } from "../component-instances/index.js";
import type { ComponentPropertyError } from "../component-properties/index.js";
import type { ComponentTreeError } from "../component-tree/index.js";
import type { DataContextError } from "../data-context/index.js";
import type { DataModelError } from "../data-model/index.js";
import type { FunctionEvaluationError, FunctionRegistryError } from "../functions/index.js";
import type { InputBindingWriteError } from "../input-binding/index.js";
import type { MessageProcessorError } from "../message-processor/index.js";
import type { ValidationIssue } from "../protocol/index.js";
import type { ResolutionBudgetExceededError, WeaverRuntimeSafetyConfigurationError } from "../runtime/safety.js";
import type {
  WeaverRuntimeConfigurationError,
  WeaverRuntimeInteractionError,
  WeaverSurfaceResolutionError,
} from "../runtime/index.js";
import type {
  A2UIV091PromptExampleInvalidError,
  A2UIV091PromptGenerationError,
  A2UIV091PromptSurfaceNotReadyCause,
} from "../prompt/errors.js";
import type { SurfaceStoreError } from "../surfaces/index.js";
import type { JsonlDecodeError } from "../transport/jsonl/index.js";
import type {
  DescribeWeaverErrorContext,
  DescribableWeaverError,
  WeaverErrorDescription,
  WeaverErrorSeverity,
} from "./types.js";

/*
 * Each union has its own exhaustive switch. The `default` branch passes the
 * narrowed value to a `never` parameter, so adding a code to any union in
 * Core fails the typecheck until it has a description here.
 *
 * Nodes are built as a tree, then flattened into `causes` in pre-order.
 * A node with no location of its own takes the first location found in its
 * subtree. That makes `componentId` on a top-level error reflect the cause
 * that actually names the component.
 */

interface Location {
  surfaceId?: string;
  componentId?: string;
  scopePath?: string;
  dataPath?: string;
  frame?: number;
}

interface ErrorNode extends Location {
  code: string;
  severity: WeaverErrorSeverity;
  summary: string;
  hint?: string;
  children: ErrorNode[];
}

interface NodeInit extends Location {
  severity?: WeaverErrorSeverity;
  hint?: string;
  children?: ErrorNode[];
}

function node(code: string, summary: string, init: NodeInit = {}): ErrorNode {
  return {
    code,
    summary,
    severity: init.severity ?? "error",
    hint: init.hint,
    children: init.children ?? [],
    surfaceId: init.surfaceId,
    componentId: init.componentId,
    scopePath: init.scopePath,
    dataPath: init.dataPath,
    frame: init.frame,
  };
}

function flatten(root: ErrorNode): ErrorNode[] {
  return root.children.flatMap((child) => [child, ...flatten(child)]);
}

function materialize(target: ErrorNode, causes: readonly WeaverErrorDescription[]): WeaverErrorDescription {
  const pool = [target, ...flatten(target)];
  const pick = <K extends keyof Location>(key: K): Location[K] =>
    pool.find((candidate) => candidate[key] !== undefined)?.[key];

  const description: WeaverErrorDescription = {
    code: target.code,
    severity: target.severity,
    summary: target.summary,
    causes,
  };
  const surfaceId = pick("surfaceId");
  const componentId = pick("componentId");
  const scopePath = pick("scopePath");
  const dataPath = pick("dataPath");
  const frame = pick("frame");
  const hint = target.hint;
  if (surfaceId !== undefined) description.surfaceId = surfaceId;
  if (componentId !== undefined) description.componentId = componentId;
  if (scopePath !== undefined) description.scopePath = scopePath;
  if (dataPath !== undefined) description.dataPath = dataPath;
  if (frame !== undefined) description.frame = frame;
  if (hint !== undefined) description.hint = hint;
  return description;
}

function finalize(root: ErrorNode): WeaverErrorDescription {
  const causes = flatten(root).map((cause) => materialize(cause, []));
  return materialize(root, causes);
}

/*
 * Reached only when a value arrives from JavaScript with a code this version
 * does not know. The `never` parameter makes the typecheck fail instead when a
 * code is added to a union and left undescribed.
 */
function unknownError(value: never): ErrorNode {
  return unknownCode((value as { code?: unknown }).code as never);
}

function unknownCode(code: never): ErrorNode {
  const label = String(code ?? "UNKNOWN");
  return node(label, `Weaver reported an error this version cannot describe (code ${label}).`, {
    hint: "Update @cylayo/weaver-core so the error can be described, or report the code.",
  });
}

const pathLabel = (path: string): string => (path === "" ? "the root" : `"${path}"`);

const trimPeriod = (text: string): string => text.replace(/\.$/, "");

function issueSentence(issue: CatalogValidationIssue | ValidationIssue | undefined): string {
  if (!issue) return "";
  return ` At ${pathLabel(issue.path)}: ${trimPeriod(issue.message)}.`;
}

// ---------------------------------------------------------------------------
// Shared surface and budget descriptions.
// ---------------------------------------------------------------------------

function surfaceNotFound(surfaceId: string): ErrorNode {
  return node("SURFACE_NOT_FOUND", `Surface "${surfaceId}" does not exist.`, {
    surfaceId,
    hint: "Create the surface with createSurface before updating it or reading from it.",
  });
}

function functionImplementationNotFound(catalogId: string, functionName: string): ErrorNode {
  return node(
    "FUNCTION_IMPLEMENTATION_NOT_FOUND",
    `No implementation is registered for function "${functionName}" in catalog "${catalogId}".`,
    {
      hint: "Register an implementation for this function with the runtime's function configuration.",
    },
  );
}

function resolutionBudgetExceeded(error: ResolutionBudgetExceededError): ErrorNode {
  const phase = error.phase === "component-tree" ? "component tree resolution" : "component instance expansion";
  const summary =
    error.budget === "depth"
      ? `Components are nested ${error.observed} levels deep, above the limit of ${error.limit} during ${phase}.`
      : `More than ${error.limit} components were resolved during ${phase}; the surface has ${error.observed}.`;
  return node("RESOLUTION_BUDGET_EXCEEDED", summary, {
    componentId: error.componentId,
    hint: "Simplify the component tree, or raise maxResolutionDepth or maxResolvedInstances within the host maximums.",
  });
}

function safetyConfigurationError(error: WeaverRuntimeSafetyConfigurationError): ErrorNode {
  if (error.code === "INVALID_SAFETY_CONFIGURATION") {
    return node("INVALID_SAFETY_CONFIGURATION", "The safety configuration must be an object.", {
      hint: "Pass an object such as { maxResolutionDepth, maxResolvedInstances }, or leave the option out.",
    });
  }
  const reason =
    error.reason === "EXCEEDS_HOST_MAXIMUM"
      ? "it is above the host maximum"
      : "it must be a positive safe integer";
  return node("INVALID_SAFETY_LIMIT", `The safety limit "${error.limit}" is invalid: ${reason}.`, {
    hint: "Use a positive safe integer for each safety limit, within the host maximums.",
  });
}

// ---------------------------------------------------------------------------
// Data paths and data model.
// ---------------------------------------------------------------------------

function dataContextError(error: DataContextError): ErrorNode {
  switch (error.code) {
    case "INVALID_PATH":
      return node("INVALID_PATH", `The data path "${error.path}" is not valid.`, {
        dataPath: error.path,
        hint: "Use an absolute JSON Pointer such as /user/name, or a relative path inside a collection.",
      });
    case "INVALID_POINTER_ESCAPE":
      return node("INVALID_POINTER_ESCAPE", `The data path "${error.path}" contains an invalid ~ escape.`, {
        dataPath: error.path,
        hint: "In a JSON Pointer, write ~ as ~0 and / as ~1.",
      });
    case "RELATIVE_PATH_OUTSIDE_COLLECTION":
      return node(
        "RELATIVE_PATH_OUTSIDE_COLLECTION",
        `The relative path "${error.path}" is used outside a collection template.`,
        {
          dataPath: error.path,
          hint: "Use an absolute path, or use a relative path only inside a collection template.",
        },
      );
    case "COLLECTION_NOT_FOUND":
      return node("COLLECTION_NOT_FOUND", `No collection exists at "${error.path}" in the data model.`, {
        dataPath: error.path,
        hint: "Write the collection with updateDataModel before the component that iterates it is rendered.",
      });
    case "COLLECTION_NOT_ARRAY":
      return node("COLLECTION_NOT_ARRAY", `The value at "${error.path}" is not an array.`, {
        dataPath: error.path,
        hint: "Point the collection at an array, or write an array to that path first.",
      });
    case "INVALID_COLLECTION_INDEX":
      return node("INVALID_COLLECTION_INDEX", `Collection index ${error.index} is not a valid array index.`, {
        hint: "Use a non-negative integer index.",
      });
    case "COLLECTION_INDEX_OUT_OF_RANGE":
      return node(
        "COLLECTION_INDEX_OUT_OF_RANGE",
        `Collection index ${error.index} is outside the array at "${error.path}", which has length ${error.length}.`,
        {
          dataPath: error.path,
          hint: "Check the index against the array length. The item may have been removed.",
        },
      );
    default:
      return unknownError(error);
  }
}

function dataModelError(error: DataModelError): ErrorNode {
  switch (error.code) {
    case "INVALID_POINTER":
      return node("INVALID_POINTER", `The data model path "${error.path}" is not a valid pointer.`, {
        dataPath: error.path,
        hint: "Use an absolute JSON Pointer such as /user/name.",
      });
    case "INVALID_POINTER_ESCAPE":
      return node("INVALID_POINTER_ESCAPE", `The data model path "${error.path}" contains an invalid ~ escape.`, {
        dataPath: error.path,
        hint: "In a JSON Pointer, write ~ as ~0 and / as ~1.",
      });
    case "TYPE_MISMATCH":
      return node(
        "TYPE_MISMATCH",
        `The data model has a non-object value on the way to "${error.path}", so the path cannot be written.`,
        {
          dataPath: error.path,
          hint: "Write the parent as an object first, or update a path that already exists.",
        },
      );
    case "INVALID_ARRAY_INDEX":
      return node("INVALID_ARRAY_INDEX", `The path "${error.path}" uses a segment that is not an array index.`, {
        dataPath: error.path,
        hint: "Use a non-negative integer for array segments.",
      });
    case "ARRAY_INDEX_TOO_LARGE":
      return node(
        "ARRAY_INDEX_TOO_LARGE",
        `Array index ${error.index} at "${error.path}" is too large to write.`,
        {
          dataPath: error.path,
          hint: "A write may use an index at most equal to the current array length. Fill arrays in order.",
        },
      );
    case "ARRAY_INDEX_DELETE_UNSUPPORTED":
      return node(
        "ARRAY_INDEX_DELETE_UNSUPPORTED",
        `Removing the array item at "${error.path}" is not supported.`,
        {
          dataPath: error.path,
          hint: "Replace the whole array with its new contents instead of removing one item by index.",
        },
      );
    default:
      return unknownError(error);
  }
}

// ---------------------------------------------------------------------------
// Catalog and function registries.
// ---------------------------------------------------------------------------

function catalogRegistryError(error: CatalogRegistryError): ErrorNode {
  const catalogId = error.catalogId;
  const first = error.issues?.[0];
  const dataPath = first?.path;
  const componentId = error.componentId;
  switch (error.code) {
    case "INVALID_CATALOG_SCHEMA":
      return node(
        "INVALID_CATALOG_SCHEMA",
        `Catalog "${catalogId}" is not a valid A2UI catalog schema.${issueSentence(first)}`,
        {
          dataPath,
          hint: "Check the catalog against the A2UI v0.9.1 catalog schema, starting with the path above.",
        },
      );
    case "CATALOG_ALREADY_REGISTERED":
      return node("CATALOG_ALREADY_REGISTERED", `Catalog "${catalogId}" is already registered.`, {
        hint: "Register each catalogId once, or use a new catalogId for the extra catalog.",
      });
    case "CATALOG_NOT_FOUND":
      return node("CATALOG_NOT_FOUND", `Catalog "${catalogId}" is not registered.`, {
        hint: "Register the catalog before a surface or component uses it, and check that the catalogId matches exactly.",
      });
    case "THEME_SCHEMA_NOT_FOUND":
      return node("THEME_SCHEMA_NOT_FOUND", `Catalog "${catalogId}" has no theme schema.`, {
        hint: "Add a theme schema to the catalog, or stop sending a theme for this catalog.",
      });
    case "THEME_VALIDATION_FAILED":
      return node(
        "THEME_VALIDATION_FAILED",
        `The theme does not match the schema of catalog "${catalogId}".${issueSentence(first)}`,
        {
          dataPath,
          hint: "Fix the theme value at the path above, or update the catalog's theme schema.",
        },
      );
    case "COMPONENT_NOT_ALLOWED":
      return node(
        "COMPONENT_NOT_ALLOWED",
        `Component "${error.component ?? "unknown"}"${componentId ? ` (id "${componentId}")` : ""} is not allowed by catalog "${catalogId}".`,
        {
          componentId,
          hint: "Use a component that the catalog lists, or add the component to the catalog.",
        },
      );
    case "COMPONENT_STRUCTURE_NOT_FOUND":
      return node(
        "COMPONENT_STRUCTURE_NOT_FOUND",
        `Catalog "${catalogId}" has no structure for component "${error.component ?? "unknown"}".`,
        {
          componentId,
          hint: "Add a definition for this component to the catalog schema.",
        },
      );
    case "COMPONENT_VALIDATION_FAILED":
      return node(
        "COMPONENT_VALIDATION_FAILED",
        `Component "${componentId ?? "unknown"}" (${error.component ?? "unknown type"}) does not match the catalog schema${first ? ` at ${pathLabel(first.path)}: ${trimPeriod(first.message)}` : ""}.`,
        {
          componentId,
          dataPath,
          hint: `Fix the property at ${first ? pathLabel(first.path) : "the path shown"} in component "${componentId ?? "unknown"}", or update the catalog schema if the property should be allowed.`,
        },
      );
    case "FUNCTION_NOT_ALLOWED":
      return node(
        "FUNCTION_NOT_ALLOWED",
        `Function "${error.functionName ?? "unknown"}" is not allowed by catalog "${catalogId}".`,
        {
          hint: "Use a function that the catalog lists, or add it to the catalog's function definitions.",
        },
      );
    case "FUNCTION_VALIDATION_FAILED":
      return node(
        "FUNCTION_VALIDATION_FAILED",
        `The call to function "${error.functionName ?? "unknown"}" does not match the catalog schema${first ? ` at ${pathLabel(first.path)}: ${trimPeriod(first.message)}` : ""}.`,
        {
          dataPath,
          hint: "Pass arguments that match the function's definition in the catalog.",
        },
      );
    default:
      return unknownCode(error.code);
  }
}

function functionRegistryError(error: FunctionRegistryError): ErrorNode {
  switch (error.code) {
    case "FUNCTION_IMPLEMENTATION_ALREADY_REGISTERED":
      return node(
        "FUNCTION_IMPLEMENTATION_ALREADY_REGISTERED",
        `Function "${error.functionName}" already has an implementation in catalog "${error.catalogId}".`,
        {
          hint: "Register each function implementation once per catalog.",
        },
      );
    case "FUNCTION_IMPLEMENTATION_NOT_FOUND":
      return functionImplementationNotFound(error.catalogId, error.functionName);
    case "INVALID_CATALOG_SCHEMA":
    case "CATALOG_ALREADY_REGISTERED":
    case "CATALOG_NOT_FOUND":
    case "THEME_SCHEMA_NOT_FOUND":
    case "THEME_VALIDATION_FAILED":
    case "COMPONENT_NOT_ALLOWED":
    case "COMPONENT_STRUCTURE_NOT_FOUND":
    case "COMPONENT_VALIDATION_FAILED":
    case "FUNCTION_NOT_ALLOWED":
    case "FUNCTION_VALIDATION_FAILED":
      return catalogRegistryError(error);
    default:
      return unknownError(error);
  }
}

function functionEvaluationError(error: FunctionEvaluationError): ErrorNode {
  switch (error.code) {
    case "FUNCTION_IMPLEMENTATION_NOT_FOUND":
      return functionImplementationNotFound(error.catalogId, error.functionName);
    case "FUNCTION_EFFECT_NOT_ALLOWED":
      return node(
        "FUNCTION_EFFECT_NOT_ALLOWED",
        `Function "${error.functionName}" has an effect that is not allowed in this position.`,
        {
          hint: "Use a function without that effect here, or change the catalog's function definition.",
        },
      );
    case "FUNCTION_ARGUMENT_RESOLUTION_FAILED":
      return node(
        "FUNCTION_ARGUMENT_RESOLUTION_FAILED",
        `An argument to function "${error.functionName}" could not be read from the data model.`,
        {
          children: error.cause ? [dataContextError(error.cause)] : [],
          hint: "Check the data path that is passed as the argument.",
        },
      );
    case "FUNCTION_EXECUTION_FAILED":
      return node("FUNCTION_EXECUTION_FAILED", `Function "${error.functionName}" failed while running.`, {
        hint: "Check the function implementation and the values it receives.",
      });
    case "FUNCTION_RETURN_TYPE_MISMATCH":
      return node(
        "FUNCTION_RETURN_TYPE_MISMATCH",
        `Function "${error.functionName}" returned ${error.actual ?? "a value of an unexpected type"}, but ${error.expected ?? "a different type"} was expected.`,
        {
          hint: "Make the function return the type that the caller expects.",
        },
      );
    case "FUNCTION_MAX_DEPTH_EXCEEDED":
      return node("FUNCTION_MAX_DEPTH_EXCEEDED", `Function calls for "${error.functionName}" are nested too deeply.`, {
        hint: "Remove some nested function calls, or simplify the expression.",
      });
    case "INVALID_CATALOG_SCHEMA":
    case "CATALOG_ALREADY_REGISTERED":
    case "CATALOG_NOT_FOUND":
    case "THEME_SCHEMA_NOT_FOUND":
    case "THEME_VALIDATION_FAILED":
    case "COMPONENT_NOT_ALLOWED":
    case "COMPONENT_STRUCTURE_NOT_FOUND":
    case "COMPONENT_VALIDATION_FAILED":
    case "FUNCTION_NOT_ALLOWED":
    case "FUNCTION_VALIDATION_FAILED":
      return catalogRegistryError(error as CatalogRegistryError);
    default:
      return unknownError(error);
  }
}

// ---------------------------------------------------------------------------
// Surfaces, protocol, and transport.
// ---------------------------------------------------------------------------

function surfaceStoreError(error: SurfaceStoreError): ErrorNode {
  switch (error.code) {
    case "SURFACE_ALREADY_EXISTS":
      return node("SURFACE_ALREADY_EXISTS", `Surface "${error.surfaceId}" already exists.`, {
        surfaceId: error.surfaceId,
        hint: "Update the existing surface instead of creating it again.",
      });
    case "SURFACE_NOT_FOUND":
      return surfaceNotFound(error.surfaceId);
    case "DUPLICATE_COMPONENT_ID":
      return node(
        "DUPLICATE_COMPONENT_ID",
        `Surface "${error.surfaceId}" has more than one component with id "${error.componentId}".`,
        {
          surfaceId: error.surfaceId,
          componentId: error.componentId,
          hint: "Give each component on a surface a unique id.",
        },
      );
    case "DATA_MODEL_ERROR":
      return node("DATA_MODEL_ERROR", "The surface's data model could not be updated.", {
        children: [dataModelError(error.dataModelError)],
        hint: "Check the data path in the updateDataModel message.",
      });
    default:
      return unknownError(error);
  }
}

function validationIssue(issue: ValidationIssue): ErrorNode {
  const location = issue.path === "" ? "the message root" : `"${issue.path}"`;
  return node(
    "VALIDATION_FAILED",
    `Protocol check failed at ${location}: ${trimPeriod(issue.message)}.`,
    {
      surfaceId: issue.surfaceId,
      dataPath: issue.path,
      hint: "Fix the field at the path above in the A2UI output.",
    },
  );
}

function messageProcessorError(error: MessageProcessorError): ErrorNode {
  switch (error.code) {
    case "PROTOCOL_VALIDATION_FAILED":
      return node("PROTOCOL_VALIDATION_FAILED", "The message does not match the A2UI v0.9.1 protocol.", {
        children: error.issues.map(validationIssue),
        hint: "Correct the listed fields in the A2UI output, then send the message again.",
      });
    case "SURFACE_STORE_ERROR":
      return node("SURFACE_STORE_ERROR", "The surface store rejected the message.", {
        children: [surfaceStoreError(error.storeError)],
      });
    case "CATALOG_REGISTRY_ERROR":
      return node("CATALOG_REGISTRY_ERROR", "The message does not satisfy its catalog.", {
        children: [catalogRegistryError(error.catalogError)],
      });
    default:
      return unknownError(error);
  }
}

function jsonlDecodeError(error: JsonlDecodeError): ErrorNode {
  switch (error.code) {
    case "INVALID_JSON":
      return node("INVALID_JSON", `Frame ${error.frame} is not valid JSON.`, {
        frame: error.frame,
        hint: "Send one complete JSON value per line, with no trailing commas or partial lines.",
      });
    case "FRAME_TOO_LARGE":
      return node(
        "FRAME_TOO_LARGE",
        `Frame ${error.frame} is longer than the limit of ${error.maxFrameCharacters} characters.`,
        {
          frame: error.frame,
          hint: "Split the update into smaller frames, or raise the frame limit in the stream configuration.",
        },
      );
    default:
      return unknownError(error);
  }
}

// ---------------------------------------------------------------------------
// Component pipeline: tree, instances, properties, and checks.
// ---------------------------------------------------------------------------

function componentTreeError(error: ComponentTreeError): ErrorNode {
  switch (error.code) {
    case "CATALOG_NOT_FOUND":
      return node(
        "CATALOG_NOT_FOUND",
        `The surface uses catalog "${error.catalogId}", which is not registered.`,
        {
          children: [catalogRegistryError(error.cause)],
          hint: "Register the catalog before the surface uses it, or change the surface's catalogId.",
        },
      );
    case "COMPONENT_STRUCTURE_NOT_FOUND":
      return node(
        "COMPONENT_STRUCTURE_NOT_FOUND",
        `Catalog "${error.catalogId}" has no structure for component "${error.component ?? "unknown"}".`,
        {
          children: [catalogRegistryError(error.cause)],
          hint: "Add a definition for this component to the catalog schema.",
        },
      );
    case "RESOLUTION_BUDGET_EXCEEDED":
      return resolutionBudgetExceeded(error);
    default:
      return unknownError(error);
  }
}

function componentInstanceError(error: ComponentInstanceError): ErrorNode {
  switch (error.code) {
    case "COMPONENT_TREE_RESOLUTION_FAILED":
      return node("COMPONENT_TREE_RESOLUTION_FAILED", "The component tree could not be resolved while expanding instances.", {
        children: [componentTreeError(error.cause)],
      });
    case "RESOLUTION_BUDGET_EXCEEDED":
      return resolutionBudgetExceeded(error);
    default:
      return unknownError(error);
  }
}

function checkEvaluatorError(error: CheckEvaluatorError): ErrorNode {
  switch (error.code) {
    case "CHECK_DATA_CONTEXT_RECONSTRUCTION_FAILED":
      return node(
        "CHECK_DATA_CONTEXT_RECONSTRUCTION_FAILED",
        `A check on component "${error.sourceComponentId}" could not read its data at scope "${error.scopePath}".`,
        {
          componentId: error.sourceComponentId,
          scopePath: error.scopePath,
          children: [dataContextError(error.cause)],
          hint: "Check the data paths that this component's checks read.",
        },
      );
    default:
      return unknownCode(error.code);
  }
}

function componentPropertyError(error: ComponentPropertyError): ErrorNode {
  switch (error.code) {
    case "CATALOG_PROPERTY_METADATA_FAILED":
      return node("CATALOG_PROPERTY_METADATA_FAILED", "The catalog metadata for a component property could not be read.", {
        children: [catalogRegistryError(error.cause)],
      });
    case "DATA_CONTEXT_RECONSTRUCTION_FAILED":
      return node(
        "DATA_CONTEXT_RECONSTRUCTION_FAILED",
        `The data scope for component "${error.cause.sourceComponentId}" at scope "${error.cause.scopePath}" could not be rebuilt.`,
        {
          componentId: error.cause.sourceComponentId,
          scopePath: error.cause.scopePath,
          children: [dataContextError(error.cause.cause)],
          hint: "Check the collection that this component reads, and that the item at this scope still exists.",
        },
      );
    default:
      return unknownError(error);
  }
}

function surfaceResolutionError(error: WeaverSurfaceResolutionError): ErrorNode {
  switch (error.code) {
    case "SURFACE_NOT_FOUND":
      return surfaceNotFound(error.surfaceId);
    case "COMPONENT_TREE_RESOLUTION_FAILED":
      return node("COMPONENT_TREE_RESOLUTION_FAILED", "The component tree could not be resolved for this surface.", {
        children: [componentTreeError(error.cause)],
      });
    case "COMPONENT_INSTANCE_RESOLUTION_FAILED":
      return node("COMPONENT_INSTANCE_RESOLUTION_FAILED", "Component instances could not be expanded for this surface.", {
        children: [componentInstanceError(error.cause)],
      });
    case "COMPONENT_PROPERTY_RESOLUTION_FAILED":
      return node("COMPONENT_PROPERTY_RESOLUTION_FAILED", "A component property could not be resolved.", {
        children: [componentPropertyError(error.cause)],
      });
    case "CHECK_EVALUATION_FAILED":
      return node("CHECK_EVALUATION_FAILED", "A component check could not be evaluated.", {
        children: [checkEvaluatorError(error.cause)],
      });
    default:
      return unknownError(error);
  }
}

function checkSnapshotLocation(checks: ComponentCheckSnapshot): Location {
  return { componentId: checks.sourceComponentId, scopePath: checks.scopePath };
}

// ---------------------------------------------------------------------------
// Actions and input bindings.
// ---------------------------------------------------------------------------

function actionContextResolutionError(error: ActionContextResolutionError): ErrorNode {
  switch (error.code) {
    case "ACTION_CONTEXT_VOID_FUNCTION":
      return node(
        "ACTION_CONTEXT_VOID_FUNCTION",
        `Action context key "${error.key}" calls function "${error.functionName}", which returns nothing.`,
        {
          hint: "Use a function that returns a value for an action context key.",
        },
      );
    case "ACTION_CONTEXT_VALUE_UNAVAILABLE":
      return node("ACTION_CONTEXT_VALUE_UNAVAILABLE", `Action context key "${error.key}" has no value yet.`, {
        hint: "Make sure the bound data exists before the action is sent, or give the key a default.",
      });
    case "ACTION_CONTEXT_RESOLUTION_FAILED":
      return node("ACTION_CONTEXT_RESOLUTION_FAILED", `Action context key "${error.key}" could not be resolved.`, {
        children: error.cause ? [functionEvaluationError(error.cause)] : [],
        hint: "Check the value or function bound to this action context key.",
      });
    default:
      return unknownError(error);
  }
}

function actionDispatchError(error: ActionDispatchError): ErrorNode {
  switch (error.code) {
    case "ACTION_PROPERTY_NOT_ALLOWED":
      return node(
        "ACTION_PROPERTY_NOT_ALLOWED",
        `The catalog does not allow the action property "${error.actionProperty}" on this component.`,
        {
          children: error.cause ? [catalogRegistryError(error.cause)] : [],
          hint: "Use an action property that the component's catalog definition allows.",
        },
      );
    case "ACTION_NOT_FOUND":
      return node("ACTION_NOT_FOUND", `The component has no action named "${error.actionProperty}".`, {
        hint: "Check the action property name, and that the component defines an action there.",
      });
    case "ACTION_INVALID":
      return node("ACTION_INVALID", `The action "${error.actionProperty}" is not valid.`, {
        hint: "Check the action's event name and required fields in the A2UI output.",
      });
    case "ACTION_DATA_CONTEXT_FAILED":
      return node("ACTION_DATA_CONTEXT_FAILED", "The action could not read its data scope.", {
        children: [dataContextError(error.cause)],
        hint: "Check the data paths used in the action's context.",
      });
    case "ACTION_CHECK_EVALUATION_FAILED":
      return node("ACTION_CHECK_EVALUATION_FAILED", "The action's checks could not be evaluated.", {
        children: [checkEvaluatorError(error.cause)],
      });
    case "ACTION_BLOCKED_BY_CHECKS":
      return node(
        "ACTION_BLOCKED_BY_CHECKS",
        "The action was not sent because one of its checks failed.",
        {
          severity: "warning",
          ...checkSnapshotLocation(error.checks),
          hint: "This is expected while a check fails. Show the check's message to the user, or fix the input that it reads.",
        },
      );
    case "LOCAL_FUNCTION_FAILED":
      return node("LOCAL_FUNCTION_FAILED", "A local function used by the action failed.", {
        children: [functionEvaluationError(error.cause)],
        hint: "Check the function's arguments and implementation.",
      });
    case "CLIENT_DATA_MODEL_NOT_OBJECT":
      return node("CLIENT_DATA_MODEL_NOT_OBJECT", "The client data model must be a JSON object.", {
        hint: "Send the client data model as an object, not an array or a primitive value.",
      });
    case "ACTION_CONTEXT_VOID_FUNCTION":
    case "ACTION_CONTEXT_VALUE_UNAVAILABLE":
    case "ACTION_CONTEXT_RESOLUTION_FAILED":
      return actionContextResolutionError(error);
    default:
      return unknownError(error);
  }
}

function inputBindingWriteError(error: InputBindingWriteError): ErrorNode {
  switch (error.code) {
    case "SURFACE_NOT_FOUND":
      return surfaceNotFound(error.surfaceId);
    case "SOURCE_COMPONENT_NOT_FOUND":
      return node(
        "SOURCE_COMPONENT_NOT_FOUND",
        `No component "${error.sourceComponentId}" exists on surface "${error.surfaceId}".`,
        {
          surfaceId: error.surfaceId,
          componentId: error.sourceComponentId,
          hint: "Check the component id, and that the component is still on the surface.",
        },
      );
    case "INPUT_PROPERTY_NOT_FOUND":
      return node(
        "INPUT_PROPERTY_NOT_FOUND",
        `Component "${error.sourceComponentId}" has no property "${error.property}".`,
        {
          componentId: error.sourceComponentId,
          hint: "Write only to properties that the component defines.",
        },
      );
    case "INPUT_PROPERTY_NOT_DYNAMIC":
      return node(
        "INPUT_PROPERTY_NOT_DYNAMIC",
        `Property "${error.property}" of component "${error.sourceComponentId}" is a fixed value, not a data binding.`,
        {
          componentId: error.sourceComponentId,
          hint: "Bind the property to a data model path in the A2UI output before writing an input to it.",
        },
      );
    case "INPUT_PROPERTY_NOT_BOUND":
      return node(
        "INPUT_PROPERTY_NOT_BOUND",
        `Property "${error.property}" of component "${error.sourceComponentId}" is not bound to a data path.`,
        {
          componentId: error.sourceComponentId,
          hint: "Bind the input property to a data path so its value can be written.",
        },
      );
    case "INPUT_VALUE_TYPE_MISMATCH":
      return node(
        "INPUT_VALUE_TYPE_MISMATCH",
        `Property "${error.property}" of component "${error.sourceComponentId}" expects ${error.expected} but received ${error.actual}.`,
        {
          componentId: error.sourceComponentId,
          hint: "Send a value of the type that the property expects.",
        },
      );
    case "CATALOG_REGISTRY_ERROR":
      return node("CATALOG_REGISTRY_ERROR", "The catalog rejected the input binding.", {
        children: [catalogRegistryError(error.cause)],
      });
    case "BINDING_PATH_RESOLUTION_FAILED":
      return node("BINDING_PATH_RESOLUTION_FAILED", "The data path of the input binding could not be resolved.", {
        children: [dataContextError(error.cause)],
        hint: "Check the data path that the input is bound to.",
      });
    case "SURFACE_STORE_ERROR":
      return node("SURFACE_STORE_ERROR", "The surface store rejected the input write.", {
        children: [surfaceStoreError(error.cause)],
      });
    default:
      return unknownError(error);
  }
}

function runtimeInteractionError(error: WeaverRuntimeInteractionError): ErrorNode {
  switch (error.code) {
    case "SURFACE_NOT_FOUND":
      return surfaceNotFound(error.surfaceId);
    case "INSTANCE_RESOLUTION_FAILED":
      return node("INSTANCE_RESOLUTION_FAILED", "The component instance for this interaction could not be resolved.", {
        children: [componentInstanceError(error.cause)],
      });
    case "INSTANCE_NOT_FOUND":
      return node(
        "INSTANCE_NOT_FOUND",
        `No component "${error.sourceComponentId}" exists at scope "${error.scopePath}" on surface "${error.surfaceId}".`,
        {
          surfaceId: error.surfaceId,
          componentId: error.sourceComponentId,
          scopePath: error.scopePath,
          hint: "Use an instance identity from the latest resolved surface. The collection item may have been removed or re-indexed.",
        },
      );
    case "INPUT_WRITE_FAILED":
      return node("INPUT_WRITE_FAILED", "The input value could not be written to the data model.", {
        children: [inputBindingWriteError(error.cause)],
      });
    case "ACTION_DISPATCH_FAILED":
      return node("ACTION_DISPATCH_FAILED", "The action could not be dispatched.", {
        children: [actionDispatchError(error.cause)],
      });
    default:
      return unknownError(error);
  }
}

function runtimeConfigurationError(error: WeaverRuntimeConfigurationError): ErrorNode {
  switch (error.code) {
    case "CATALOG_CONFIGURATION_FAILED":
      return node("CATALOG_CONFIGURATION_FAILED", "The runtime's catalog configuration is invalid.", {
        children: [catalogRegistryError(error.catalogError)],
        hint: "Check the catalog schema passed to createWeaverRuntime.",
      });
    case "FUNCTION_CONFIGURATION_FAILED":
      return node("FUNCTION_CONFIGURATION_FAILED", "The runtime's function configuration is invalid.", {
        children: [functionRegistryError(error.functionError)],
        hint: "Check the function implementations and the catalog's function definitions passed to createWeaverRuntime.",
      });
    case "SAFETY_CONFIGURATION_FAILED":
      return node("SAFETY_CONFIGURATION_FAILED", "The runtime's safety limits are invalid.", {
        children: [safetyConfigurationError(error.safetyError)],
        hint: "Check the safety limits passed to createWeaverRuntime.",
      });
    default:
      return unknownError(error);
  }
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

function promptGenerationError(error: A2UIV091PromptGenerationError): ErrorNode {
  switch (error.code) {
    case "CATALOG_INVALID":
      return node(
        "CATALOG_INVALID",
        `Prompt generation stopped because the catalog${error.catalogId ? ` "${error.catalogId}"` : ""} is invalid: ${trimPeriod(error.message)}.`,
        {
          children: error.cause ? [catalogRegistryError(error.cause)] : [],
          hint: "Fix the catalog definition named in the cause, then generate the prompt again.",
        },
      );
    case "ACTION_NAME_INVALID":
      return node(
        "ACTION_NAME_INVALID",
        error.reason === "empty"
          ? "An action name in the prompt catalog is empty."
          : `Action name "${error.actionName}" appears more than once in the prompt catalog.`,
        {
          hint:
            error.reason === "empty"
              ? "Give every action a non-empty name, then generate the prompt again."
              : "Give each action a unique name, then generate the prompt again.",
        },
      );
    case "PROMPT_TOO_LARGE":
      return node(
        "PROMPT_TOO_LARGE",
        `The generated prompt is ${error.characters} characters, over the limit of ${error.maxCharacters}.`,
        {
          hint: "Reduce the number of components, functions, or examples in the catalog so the prompt fits the limit.",
        },
      );
    case "EXAMPLE_INVALID":
      return exampleInvalidError(error);
    default:
      return unknownError(error);
  }
}

function surfaceNotReady(error: A2UIV091PromptSurfaceNotReadyCause): ErrorNode {
  const issueCount = error.issues.tree.length + error.issues.instances.length + error.issues.properties.length;
  const gaps: string[] = [];
  if (!error.treeReady) gaps.push("the component tree is incomplete");
  if (!error.checksReady) gaps.push("the checks are not ready");
  if (issueCount > 0) gaps.push(`${issueCount} surface ${issueCount === 1 ? "issue remains" : "issues remain"}`);
  return node(
    "SURFACE_NOT_READY",
    `Surface "${error.surfaceId}" is not ready for a prompt: ${gaps.join(", ") || "it has unresolved state"}.`,
    {
      surfaceId: error.surfaceId,
      hint: "Give the example's surface a root, resolve every reference, and remove its issues.",
    },
  );
}

/*
 * The example's typed cause is attached as a child node, so `causes` carries
 * the whole chain below it. `stage` decides which Core union that cause is.
 */
function exampleInvalidError(error: A2UIV091PromptExampleInvalidError): ErrorNode {
  const example = `example ${error.exampleIndex} ("${error.exampleTitle}")`;
  const hint = "Correct the example so it is valid A2UI v0.9.1 for this catalog, then generate the prompt again.";
  const message = trimPeriod(error.message);
  switch (error.stage) {
    case "runtime":
      return node(
        "EXAMPLE_INVALID",
        `Prompt generation stopped because ${example} is invalid at stage "runtime": ${message}.`,
        { children: [runtimeConfigurationError(error.cause)], hint },
      );
    case "process":
      return node(
        "EXAMPLE_INVALID",
        `Prompt generation stopped because ${example} is invalid at stage "process", message ${error.messageIndex}: ${message}.`,
        { children: [messageProcessorError(error.cause)], hint },
      );
    case "resolve":
      return node(
        "EXAMPLE_INVALID",
        `Prompt generation stopped because ${example} is invalid at stage "resolve", surface "${error.surfaceId}": ${message}.`,
        {
          surfaceId: error.surfaceId,
          children: [
            error.cause.code === "SURFACE_NOT_READY"
              ? surfaceNotReady(error.cause)
              : surfaceResolutionError(error.cause),
          ],
          hint,
        },
      );
    default:
      return unknownError(error);
  }
}

function describeTop(error: DescribableWeaverError): ErrorNode {
  switch (error.code) {
    case "PROTOCOL_VALIDATION_FAILED":
    case "SURFACE_STORE_ERROR":
    case "CATALOG_REGISTRY_ERROR":
      return messageProcessorError(error as MessageProcessorError);
    case "INVALID_JSON":
    case "FRAME_TOO_LARGE":
      return jsonlDecodeError(error as JsonlDecodeError);
    case "COMPONENT_TREE_RESOLUTION_FAILED":
    case "COMPONENT_INSTANCE_RESOLUTION_FAILED":
    case "COMPONENT_PROPERTY_RESOLUTION_FAILED":
    case "CHECK_EVALUATION_FAILED":
      return surfaceResolutionError(error as WeaverSurfaceResolutionError);
    case "INSTANCE_RESOLUTION_FAILED":
    case "INSTANCE_NOT_FOUND":
    case "INPUT_WRITE_FAILED":
    case "ACTION_DISPATCH_FAILED":
      return runtimeInteractionError(error as WeaverRuntimeInteractionError);
    case "CATALOG_CONFIGURATION_FAILED":
    case "FUNCTION_CONFIGURATION_FAILED":
    case "SAFETY_CONFIGURATION_FAILED":
      return runtimeConfigurationError(error as WeaverRuntimeConfigurationError);
    case "SURFACE_NOT_FOUND":
      return surfaceNotFound(error.surfaceId);
    case "FUNCTION_IMPLEMENTATION_ALREADY_REGISTERED":
    case "FUNCTION_IMPLEMENTATION_NOT_FOUND":
    case "INVALID_CATALOG_SCHEMA":
    case "CATALOG_ALREADY_REGISTERED":
    case "CATALOG_NOT_FOUND":
    case "THEME_SCHEMA_NOT_FOUND":
    case "THEME_VALIDATION_FAILED":
    case "COMPONENT_NOT_ALLOWED":
    case "COMPONENT_STRUCTURE_NOT_FOUND":
    case "COMPONENT_VALIDATION_FAILED":
    case "FUNCTION_NOT_ALLOWED":
    case "FUNCTION_VALIDATION_FAILED":
      return functionRegistryError(error as FunctionRegistryError);
    case "CATALOG_INVALID":
    case "ACTION_NAME_INVALID":
    case "PROMPT_TOO_LARGE":
    case "EXAMPLE_INVALID":
      return promptGenerationError(error as A2UIV091PromptGenerationError);
    default:
      return unknownError(error);
  }
}

/**
 * Turns any Weaver error into a description a host can show or log.
 *
 * The result carries the error's code, severity, one-sentence summary, and
 * the most specific location the error names. Its `causes` array flattens the
 * whole cause chain in order. The function is pure: it does no I/O, no DOM
 * work, and no i18n lookup.
 */
export function describeWeaverError(
  error: DescribableWeaverError,
  context: DescribeWeaverErrorContext = {},
): WeaverErrorDescription {
  const root = describeTop(error);
  if (root.frame === undefined && context.frame !== undefined) {
    root.frame = context.frame;
  }
  return finalize(root);
}

import assert from "node:assert/strict";
import { test } from "node:test";

import type { ActionDispatchErrorCode, ActionDispatchError } from "../actions/errors.js";
import type { ActionContextResolutionError } from "../actions/types.js";
import type { CatalogRegistryError, CatalogRegistryErrorCode } from "../catalog/errors.js";
import { CatalogRegistry } from "../catalog/index.js";
import type { CheckEvaluatorError, CheckEvaluatorErrorCode, ComponentCheckSnapshot } from "../checks/index.js";
import type { ComponentInstanceError, ComponentInstanceErrorCode } from "../component-instances/errors.js";
import type { ComponentPropertyError, ComponentPropertyErrorCode } from "../component-properties/errors.js";
import type { ComponentTreeError, ComponentTreeErrorCode } from "../component-tree/errors.js";
import type { DataContextError } from "../data-context/errors.js";
import type { DataModelError } from "../data-model/errors.js";
import type { FunctionEvaluationError, FunctionEvaluationErrorCode, FunctionRegistryError, FunctionRegistryErrorCode } from "../functions/errors.js";
import type { InputBindingWriteError } from "../input-binding/errors.js";
import type { MessageProcessorError } from "../message-processor/errors.js";
import { A2UIMessageProcessor } from "../message-processor/index.js";
import type { ValidationIssue } from "../protocol/a2ui/v0_9_1/errors.js";
import type { ResolutionBudgetExceededError, WeaverRuntimeSafetyConfigurationError } from "../runtime/safety.js";
import type {
  WeaverRuntimeConfigurationError,
  WeaverRuntimeInteractionError,
  WeaverSurfaceResolutionError,
} from "../runtime/types.js";
import { SurfaceStore } from "../surfaces/index.js";
import type { SurfaceStoreError } from "../surfaces/errors.js";
import type { JsonlDecodeError } from "../transport/jsonl/errors.js";
import type { A2UIPromptGenerationError } from "../prompt/errors.js";
import { describeWeaverError } from "./describeWeaverError.js";
import type { DescribableWeaverError, DescribeWeaverErrorContext, WeaverErrorDescription } from "./types.js";

// ---------------------------------------------------------------------------
// Code inventory. Every code in every errors.ts union that the describer
// accepts. The compile-time checks at the bottom fail if this list drifts.
// ---------------------------------------------------------------------------

const ALL_CODES = [
  // MessageProcessorError
  "PROTOCOL_VALIDATION_FAILED", "SURFACE_STORE_ERROR", "CATALOG_REGISTRY_ERROR",
  // ValidationIssue
  "VALIDATION_FAILED",
  // JsonlDecodeError
  "INVALID_JSON", "FRAME_TOO_LARGE",
  // WeaverSurfaceResolutionError and WeaverRuntimeInteractionError
  "SURFACE_NOT_FOUND", "COMPONENT_TREE_RESOLUTION_FAILED", "COMPONENT_INSTANCE_RESOLUTION_FAILED",
  "COMPONENT_PROPERTY_RESOLUTION_FAILED", "CHECK_EVALUATION_FAILED", "INSTANCE_RESOLUTION_FAILED",
  "INSTANCE_NOT_FOUND", "INPUT_WRITE_FAILED", "ACTION_DISPATCH_FAILED",
  // WeaverRuntimeConfigurationError and WeaverRuntimeSafetyConfigurationError
  "CATALOG_CONFIGURATION_FAILED", "FUNCTION_CONFIGURATION_FAILED", "SAFETY_CONFIGURATION_FAILED",
  "INVALID_SAFETY_LIMIT", "INVALID_SAFETY_CONFIGURATION",
  // CatalogRegistryError
  "INVALID_CATALOG_SCHEMA", "CATALOG_ALREADY_REGISTERED", "CATALOG_NOT_FOUND", "THEME_SCHEMA_NOT_FOUND",
  "THEME_VALIDATION_FAILED", "COMPONENT_NOT_ALLOWED", "COMPONENT_STRUCTURE_NOT_FOUND",
  "COMPONENT_VALIDATION_FAILED", "FUNCTION_NOT_ALLOWED", "FUNCTION_VALIDATION_FAILED",
  // A2UIPromptGenerationError
  "CATALOG_INVALID", "ACTION_NAME_INVALID", "PROMPT_TOO_LARGE", "EXAMPLE_INVALID",
  // FunctionRegistryError
  "FUNCTION_IMPLEMENTATION_ALREADY_REGISTERED", "FUNCTION_IMPLEMENTATION_NOT_FOUND",
  // FunctionEvaluationError
  "FUNCTION_EFFECT_NOT_ALLOWED", "FUNCTION_ARGUMENT_RESOLUTION_FAILED", "FUNCTION_EXECUTION_FAILED",
  "FUNCTION_RETURN_TYPE_MISMATCH", "FUNCTION_MAX_DEPTH_EXCEEDED",
  // ActionDispatchError and ActionContextResolutionError
  "ACTION_PROPERTY_NOT_ALLOWED", "ACTION_NOT_FOUND", "ACTION_INVALID", "ACTION_DATA_CONTEXT_FAILED",
  "ACTION_CHECK_EVALUATION_FAILED", "ACTION_BLOCKED_BY_CHECKS", "LOCAL_FUNCTION_FAILED",
  "CLIENT_DATA_MODEL_NOT_OBJECT", "ACTION_CONTEXT_VOID_FUNCTION", "ACTION_CONTEXT_VALUE_UNAVAILABLE",
  "ACTION_CONTEXT_RESOLUTION_FAILED",
  // CheckEvaluatorError
  "CHECK_DATA_CONTEXT_RECONSTRUCTION_FAILED",
  // ComponentInstanceError
  "RESOLUTION_BUDGET_EXCEEDED",
  // ComponentPropertyError
  "CATALOG_PROPERTY_METADATA_FAILED", "DATA_CONTEXT_RECONSTRUCTION_FAILED",
  // DataContextError
  "INVALID_PATH", "INVALID_POINTER_ESCAPE", "RELATIVE_PATH_OUTSIDE_COLLECTION", "COLLECTION_NOT_FOUND",
  "COLLECTION_NOT_ARRAY", "INVALID_COLLECTION_INDEX", "COLLECTION_INDEX_OUT_OF_RANGE",
  // DataModelError
  "INVALID_POINTER", "TYPE_MISMATCH", "INVALID_ARRAY_INDEX", "ARRAY_INDEX_TOO_LARGE",
  "ARRAY_INDEX_DELETE_UNSUPPORTED",
  // SurfaceStoreError
  "SURFACE_ALREADY_EXISTS", "DUPLICATE_COMPONENT_ID", "DATA_MODEL_ERROR",
  // InputBindingWriteError
  "SOURCE_COMPONENT_NOT_FOUND", "INPUT_PROPERTY_NOT_FOUND", "INPUT_PROPERTY_NOT_DYNAMIC",
  "INPUT_PROPERTY_NOT_BOUND", "INPUT_VALUE_TYPE_MISMATCH", "BINDING_PATH_RESOLUTION_FAILED",
] as const;

type WeaverErrorCode = (typeof ALL_CODES)[number];

type UnionCodes =
  | MessageProcessorError["code"]
  | ValidationIssue["code"]
  | JsonlDecodeError["code"]
  | WeaverSurfaceResolutionError["code"]
  | WeaverRuntimeInteractionError["code"]
  | WeaverRuntimeConfigurationError["code"]
  | WeaverRuntimeSafetyConfigurationError["code"]
  | CatalogRegistryErrorCode
  | FunctionRegistryErrorCode
  | FunctionEvaluationErrorCode
  | ActionDispatchErrorCode
  | ActionContextResolutionError["code"]
  | CheckEvaluatorErrorCode
  | ComponentInstanceErrorCode
  | ComponentPropertyErrorCode
  | ComponentTreeErrorCode
  | ResolutionBudgetExceededError["code"]
  | DataContextError["code"]
  | DataModelError["code"]
  | SurfaceStoreError["code"]
  | InputBindingWriteError["code"]
  | A2UIPromptGenerationError["code"];

// Compile-time: these fail the typecheck if a code is missing from ALL_CODES
// or if ALL_CODES names something no errors.ts union defines.
const missingCodes: Exclude<UnionCodes, WeaverErrorCode> extends never ? true : never = true;
const unknownCodes: Exclude<WeaverErrorCode, UnionCodes> extends never ? true : never = true;
void missingCodes;
void unknownCodes;

// ---------------------------------------------------------------------------
// Shared fixture values.
// ---------------------------------------------------------------------------

const catalogCodes: CatalogRegistryError[] = [
  { code: "INVALID_CATALOG_SCHEMA", message: "bad schema", catalogId: "catalog", issues: [{ path: "/components", message: "must be an object" }] },
  { code: "CATALOG_ALREADY_REGISTERED", message: "registered", catalogId: "catalog" },
  { code: "CATALOG_NOT_FOUND", message: "missing", catalogId: "catalog" },
  { code: "THEME_SCHEMA_NOT_FOUND", message: "no theme", catalogId: "catalog" },
  { code: "THEME_VALIDATION_FAILED", message: "bad theme", catalogId: "catalog", issues: [{ path: "/primary", message: "must be a string" }] },
  { code: "COMPONENT_NOT_ALLOWED", message: "not allowed", catalogId: "catalog", componentId: "danger", component: "ExecuteJavaScript" },
  { code: "COMPONENT_STRUCTURE_NOT_FOUND", message: "no structure", catalogId: "catalog", component: "Text" },
  { code: "COMPONENT_VALIDATION_FAILED", message: "invalid component", catalogId: "catalog", componentId: "title", component: "Text", issues: [{ path: "/text", message: "must be a string" }] },
  { code: "FUNCTION_NOT_ALLOWED", message: "function not allowed", catalogId: "catalog", functionName: "fetch" },
  { code: "FUNCTION_VALIDATION_FAILED", message: "bad call", catalogId: "catalog", functionName: "formatDate", issues: [{ path: "/args/0", message: "must be a string" }] },
];

const functionEvaluationCodes: FunctionEvaluationError[] = [
  { code: "FUNCTION_IMPLEMENTATION_NOT_FOUND", message: "no impl", catalogId: "catalog", functionName: "format" },
  { code: "FUNCTION_EFFECT_NOT_ALLOWED", message: "effect", catalogId: "catalog", functionName: "save" },
  { code: "FUNCTION_ARGUMENT_RESOLUTION_FAILED", message: "arg", catalogId: "catalog", functionName: "format", cause: { code: "INVALID_PATH", path: "/name" } },
  { code: "FUNCTION_EXECUTION_FAILED", message: "threw", catalogId: "catalog", functionName: "format" },
  { code: "FUNCTION_RETURN_TYPE_MISMATCH", message: "return", catalogId: "catalog", functionName: "count", expected: "string", actual: "number" },
  { code: "FUNCTION_MAX_DEPTH_EXCEEDED", message: "depth", catalogId: "catalog", functionName: "wrap" },
];

const functionRegistryCodes: FunctionRegistryError[] = [
  { code: "FUNCTION_IMPLEMENTATION_ALREADY_REGISTERED", message: "again", catalogId: "catalog", functionName: "format" },
  { code: "FUNCTION_IMPLEMENTATION_NOT_FOUND", message: "missing", catalogId: "catalog", functionName: "format" },
  ...catalogCodes,
];

const checkEvaluatorError: CheckEvaluatorError = {
  code: "CHECK_DATA_CONTEXT_RECONSTRUCTION_FAILED",
  message: "check data",
  sourceComponentId: "submit",
  scopePath: "/items/0",
  cause: { code: "COLLECTION_NOT_FOUND", path: "/items" },
};

const blockedSnapshot: ComponentCheckSnapshot = {
  sourceComponentId: "submit",
  scopePath: "/",
  checkable: true,
  status: "invalid",
  checks: [{ index: 0, status: "failed", message: "Name is required", issues: [] }],
};

const actionDispatchCodes: ActionDispatchError[] = [
  { code: "ACTION_PROPERTY_NOT_ALLOWED", message: "not allowed", actionProperty: "onPress", cause: catalogCodes[5]! },
  { code: "ACTION_NOT_FOUND", message: "no action", actionProperty: "onPress" },
  { code: "ACTION_INVALID", message: "invalid", actionProperty: "onPress" },
  { code: "ACTION_DATA_CONTEXT_FAILED", message: "data", cause: { code: "COLLECTION_NOT_ARRAY", path: "/items" } },
  { code: "ACTION_CHECK_EVALUATION_FAILED", message: "checks", cause: checkEvaluatorError },
  { code: "ACTION_BLOCKED_BY_CHECKS", message: "blocked", checks: blockedSnapshot },
  { code: "LOCAL_FUNCTION_FAILED", message: "local", cause: functionEvaluationCodes[3]! },
  { code: "CLIENT_DATA_MODEL_NOT_OBJECT", message: "not object" },
  { code: "ACTION_CONTEXT_VOID_FUNCTION", message: "void", key: "name", functionName: "noop" },
  { code: "ACTION_CONTEXT_VALUE_UNAVAILABLE", message: "unavailable", key: "name" },
  { code: "ACTION_CONTEXT_RESOLUTION_FAILED", message: "resolve", key: "name", cause: functionEvaluationCodes[0]! },
];

const dataContextCodes: DataContextError[] = [
  { code: "INVALID_PATH", path: "/a/~" },
  { code: "INVALID_POINTER_ESCAPE", path: "/a~2" },
  { code: "RELATIVE_PATH_OUTSIDE_COLLECTION", path: "name" },
  { code: "COLLECTION_NOT_FOUND", path: "/items" },
  { code: "COLLECTION_NOT_ARRAY", path: "/items" },
  { code: "INVALID_COLLECTION_INDEX", index: -1 },
  { code: "COLLECTION_INDEX_OUT_OF_RANGE", path: "/items", index: 5, length: 2 },
];

const dataModelCodes: DataModelError[] = [
  { code: "INVALID_POINTER", path: "user/name" },
  { code: "INVALID_POINTER_ESCAPE", path: "/a~2" },
  { code: "TYPE_MISMATCH", path: "/user/name" },
  { code: "INVALID_ARRAY_INDEX", path: "/items/x" },
  { code: "ARRAY_INDEX_TOO_LARGE", path: "/items/9", index: 9 },
  { code: "ARRAY_INDEX_DELETE_UNSUPPORTED", path: "/items/0" },
];

const surfaceStoreCodes: SurfaceStoreError[] = [
  { code: "SURFACE_ALREADY_EXISTS", surfaceId: "main" },
  { code: "SURFACE_NOT_FOUND", surfaceId: "main" },
  { code: "DUPLICATE_COMPONENT_ID", surfaceId: "main", componentId: "title" },
  { code: "DATA_MODEL_ERROR", dataModelError: dataModelCodes[0]! },
];

const componentTreeCodes: ComponentTreeError[] = [
  { code: "CATALOG_NOT_FOUND", message: "no catalog", catalogId: "catalog", cause: catalogCodes[2]! },
  { code: "COMPONENT_STRUCTURE_NOT_FOUND", message: "no structure", catalogId: "catalog", component: "Text", cause: catalogCodes[6]! },
  { code: "RESOLUTION_BUDGET_EXCEEDED", message: "too many", budget: "instances", limit: 1000, observed: 1001, phase: "component-tree", componentId: "root" },
];

const componentInstanceCodes: ComponentInstanceError[] = [
  { code: "COMPONENT_TREE_RESOLUTION_FAILED", message: "tree", cause: componentTreeCodes[0]! },
  { code: "RESOLUTION_BUDGET_EXCEEDED", message: "deep", budget: "depth", limit: 32, observed: 33, phase: "component-instances", componentId: "deep" },
];

const componentPropertyCodes: ComponentPropertyError[] = [
  { code: "CATALOG_PROPERTY_METADATA_FAILED", message: "metadata", cause: catalogCodes[6]! },
  {
    code: "DATA_CONTEXT_RECONSTRUCTION_FAILED",
    message: "scope",
    cause: { sourceComponentId: "row", scopePath: "/items/1", cause: { code: "COLLECTION_INDEX_OUT_OF_RANGE", path: "/items", index: 1, length: 1 } },
  },
];

const inputWriteCodes: InputBindingWriteError[] = [
  { code: "SURFACE_NOT_FOUND", surfaceId: "main" },
  { code: "SOURCE_COMPONENT_NOT_FOUND", surfaceId: "main", sourceComponentId: "field" },
  { code: "INPUT_PROPERTY_NOT_FOUND", sourceComponentId: "field", property: "value" },
  { code: "INPUT_PROPERTY_NOT_DYNAMIC", sourceComponentId: "field", property: "value" },
  { code: "INPUT_PROPERTY_NOT_BOUND", sourceComponentId: "field", property: "value" },
  { code: "INPUT_VALUE_TYPE_MISMATCH", sourceComponentId: "field", property: "value", expected: "dynamicString", actual: "number" },
  { code: "CATALOG_REGISTRY_ERROR", cause: catalogCodes[7]! },
  { code: "BINDING_PATH_RESOLUTION_FAILED", cause: dataContextCodes[0]! },
  { code: "SURFACE_STORE_ERROR", cause: surfaceStoreCodes[0]! },
];

const validationIssues: ValidationIssue[] = [
  { code: "VALIDATION_FAILED", path: "/updateComponents/components/0/text", message: "must be a string", surfaceId: "main" },
];

const safetyConfigCodes: WeaverRuntimeSafetyConfigurationError[] = [
  { code: "INVALID_SAFETY_LIMIT", limit: "maxResolutionDepth", reason: "MUST_BE_POSITIVE_SAFE_INTEGER" },
  { code: "INVALID_SAFETY_CONFIGURATION", reason: "MUST_BE_OBJECT" },
];

interface Fixture {
  code: WeaverErrorCode;
  error: DescribableWeaverError;
  context?: DescribeWeaverErrorContext;
}

/** Wraps each nested error in its parent so the describer reaches it the way a host would. */
const fixtures: Fixture[] = [
  // MessageProcessorError (top level)
  {
    code: "PROTOCOL_VALIDATION_FAILED",
    error: {
      code: "PROTOCOL_VALIDATION_FAILED",
      issues: [
        ...validationIssues,
        { code: "VALIDATION_FAILED", path: "", message: "missing version" },
      ],
    },
  },
  { code: "SURFACE_STORE_ERROR", error: { code: "SURFACE_STORE_ERROR", storeError: surfaceStoreCodes[0]! } },
  { code: "CATALOG_REGISTRY_ERROR", error: { code: "CATALOG_REGISTRY_ERROR", catalogError: catalogCodes[2]! } },

  // JsonlDecodeError (top level)
  { code: "INVALID_JSON", error: { code: "INVALID_JSON", frame: 3 } },
  { code: "FRAME_TOO_LARGE", error: { code: "FRAME_TOO_LARGE", frame: 4, maxFrameCharacters: 100 } },

  // WeaverSurfaceResolutionError (top level)
  { code: "SURFACE_NOT_FOUND", error: { code: "SURFACE_NOT_FOUND", surfaceId: "main" } },
  { code: "COMPONENT_TREE_RESOLUTION_FAILED", error: { code: "COMPONENT_TREE_RESOLUTION_FAILED", cause: componentTreeCodes[0]! } },
  { code: "COMPONENT_INSTANCE_RESOLUTION_FAILED", error: { code: "COMPONENT_INSTANCE_RESOLUTION_FAILED", cause: componentInstanceCodes[1]! } },
  { code: "COMPONENT_PROPERTY_RESOLUTION_FAILED", error: { code: "COMPONENT_PROPERTY_RESOLUTION_FAILED", cause: componentPropertyCodes[1]! } },
  { code: "CHECK_EVALUATION_FAILED", error: { code: "CHECK_EVALUATION_FAILED", cause: checkEvaluatorError } },

  // WeaverRuntimeInteractionError (top level)
  { code: "INSTANCE_RESOLUTION_FAILED", error: { code: "INSTANCE_RESOLUTION_FAILED", cause: componentInstanceCodes[0]! } },
  {
    code: "INSTANCE_NOT_FOUND",
    error: { code: "INSTANCE_NOT_FOUND", surfaceId: "main", sourceComponentId: "row", scopePath: "/items/9" },
  },
  { code: "INPUT_WRITE_FAILED", error: { code: "INPUT_WRITE_FAILED", cause: inputWriteCodes[0]! } },
  { code: "ACTION_DISPATCH_FAILED", error: { code: "ACTION_DISPATCH_FAILED", cause: actionDispatchCodes[0]! } },

  // WeaverRuntimeConfigurationError (top level)
  { code: "CATALOG_CONFIGURATION_FAILED", error: { code: "CATALOG_CONFIGURATION_FAILED", catalogError: catalogCodes[2]! } },
  {
    code: "FUNCTION_CONFIGURATION_FAILED",
    error: { code: "FUNCTION_CONFIGURATION_FAILED", functionError: functionRegistryCodes[0]! },
  },
  { code: "SAFETY_CONFIGURATION_FAILED", error: { code: "SAFETY_CONFIGURATION_FAILED", safetyError: safetyConfigCodes[0]! } },

  // FunctionRegistryError (top level)
  ...functionRegistryCodes.map((functionError) => ({ code: functionError.code, error: functionError })),

  // Nested codes, each reached through its parent.
  ...validationIssues.map(() => ({
    code: "VALIDATION_FAILED" as const,
    error: { code: "PROTOCOL_VALIDATION_FAILED" as const, issues: validationIssues },
  })),
  ...catalogCodes.map((catalogError) => ({
    code: catalogError.code,
    error: { code: "CATALOG_REGISTRY_ERROR" as const, catalogError },
  })),
  ...functionEvaluationCodes.map((cause) => ({
    code: cause.code,
    error: {
      code: "ACTION_DISPATCH_FAILED" as const,
      cause: { code: "LOCAL_FUNCTION_FAILED" as const, message: "local", cause },
    },
  })),
  ...actionDispatchCodes.map((cause) => ({
    code: cause.code,
    error: { code: "ACTION_DISPATCH_FAILED" as const, cause },
  })),
  ...dataContextCodes.map((cause) => ({
    code: cause.code,
    error: { code: "CHECK_EVALUATION_FAILED" as const, cause: { ...checkEvaluatorError, cause } },
  })),
  ...dataModelCodes.map((dataModelError) => ({
    code: dataModelError.code,
    error: { code: "SURFACE_STORE_ERROR" as const, storeError: { code: "DATA_MODEL_ERROR" as const, dataModelError } },
  })),
  ...surfaceStoreCodes.map((storeError) => ({
    code: storeError.code,
    error: { code: "SURFACE_STORE_ERROR" as const, storeError },
  })),
  ...componentTreeCodes.map((tree) => ({
    code: tree.code,
    error: { code: "COMPONENT_TREE_RESOLUTION_FAILED" as const, cause: tree },
  })),
  ...componentInstanceCodes.map((instance) => ({
    code: instance.code,
    error: { code: "INSTANCE_RESOLUTION_FAILED" as const, cause: instance },
  })),
  ...componentPropertyCodes.map((property) => ({
    code: property.code,
    error: { code: "COMPONENT_PROPERTY_RESOLUTION_FAILED" as const, cause: property },
  })),
  ...inputWriteCodes.map((cause) => ({
    code: cause.code,
    error: { code: "INPUT_WRITE_FAILED" as const, cause },
  })),
  ...safetyConfigCodes.map((safetyError) => ({
    code: safetyError.code,
    error: { code: "SAFETY_CONFIGURATION_FAILED" as const, safetyError },
  })),
  {
    code: "RESOLUTION_BUDGET_EXCEEDED",
    error: { code: "COMPONENT_INSTANCE_RESOLUTION_FAILED", cause: componentInstanceCodes[1]! },
  },
];

// The two shared codes that need a dedicated top-level fixture each.
fixtures.push(
  { code: "CATALOG_NOT_FOUND", error: { code: "CATALOG_REGISTRY_ERROR", catalogError: catalogCodes[2]! } },
  { code: "COMPONENT_STRUCTURE_NOT_FOUND", error: { code: "CATALOG_REGISTRY_ERROR", catalogError: catalogCodes[6]! } },
  { code: "SURFACE_NOT_FOUND", error: { code: "INPUT_WRITE_FAILED", cause: { code: "SURFACE_NOT_FOUND", surfaceId: "main" } } },
  { code: "SURFACE_NOT_FOUND", error: { code: "SURFACE_STORE_ERROR", storeError: { code: "SURFACE_NOT_FOUND", surfaceId: "main" } } },
);

// A2UIPromptGenerationError: one fixture per code. CATALOG_INVALID also
// carries its CatalogRegistryError cause so the chain is exercised.
fixtures.push(
  {
    code: "CATALOG_INVALID",
    error: {
      code: "CATALOG_INVALID",
      message: "Catalog failed registry validation",
      catalogId: "basic",
      cause: catalogCodes[2]!,
    } satisfies A2UIPromptGenerationError,
  },
  {
    code: "ACTION_NAME_INVALID",
    error: { code: "ACTION_NAME_INVALID", message: "Action name is empty", actionName: "", reason: "empty" },
  },
  {
    code: "PROMPT_TOO_LARGE",
    error: { code: "PROMPT_TOO_LARGE", message: "Prompt is too large", characters: 90000, maxCharacters: 65536 },
  },
  {
    code: "EXAMPLE_INVALID",
    error: {
      code: "EXAMPLE_INVALID",
      message: "Example has no root component",
      exampleTitle: "Login",
      exampleIndex: 0,
      stage: "resolve",
      surfaceId: "main",
      cause: { code: "SURFACE_NOT_READY", surfaceId: "main", treeReady: false, checksReady: false, issues: { tree: [], instances: [], properties: [] } },
    },
  },
);

// The describer reports each fixture's full tree, so a code counts as covered
// when it appears at the top or anywhere in `causes`.
const treeCodes = (description: WeaverErrorDescription): string[] => [
  description.code,
  ...description.causes.map((cause) => cause.code),
];

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

test("every code in the errors.ts inventory has a fixture that reaches it", () => {
  const described = fixtures.map((fixture) => ({
    fixture,
    codes: treeCodes(describeWeaverError(fixture.error, fixture.context)),
  }));
  for (const code of ALL_CODES) {
    const hit = described.some(({ codes }) => codes.includes(code));
    assert.ok(hit, `no fixture reaches error code ${code}`);
  }
});

test("every fixture produces a real description, never the unknown-code fallback", () => {
  for (const fixture of fixtures) {
    const description = describeWeaverError(fixture.error, fixture.context);
    for (const entry of [description, ...description.causes]) {
      assert.ok(entry.summary.length > 0, `${entry.code} has no summary`);
      assert.ok(
        !entry.summary.includes("cannot describe"),
        `${entry.code} fell back to the unknown-code description`,
      );
    }
    assert.equal(description.code, fixture.error.code, `top-level code for ${fixture.code}`);
  }
});

test("flattens a nested cause chain in pre-order, and each entry carries no further causes", () => {
  const description = describeWeaverError({
    code: "ACTION_DISPATCH_FAILED",
    cause: {
      code: "LOCAL_FUNCTION_FAILED",
      message: "local",
      cause: {
        code: "FUNCTION_ARGUMENT_RESOLUTION_FAILED",
        message: "arg",
        catalogId: "catalog",
        functionName: "format",
        cause: { code: "INVALID_PATH", path: "/name" },
      },
    },
  });
  assert.deepEqual(description.causes.map((cause) => cause.code), [
    "LOCAL_FUNCTION_FAILED",
    "FUNCTION_ARGUMENT_RESOLUTION_FAILED",
    "INVALID_PATH",
  ]);
  for (const cause of description.causes) assert.deepEqual(cause.causes, []);
});

test("keeps sibling causes in their original order", () => {
  const description = describeWeaverError({
    code: "PROTOCOL_VALIDATION_FAILED",
    issues: [
      { code: "VALIDATION_FAILED", path: "/first", message: "first problem" },
      { code: "VALIDATION_FAILED", path: "/second", message: "second problem" },
    ],
  });
  assert.deepEqual(description.causes.map((cause) => cause.dataPath), ["/first", "/second"]);
});

test("a catalog-validation failure names the component id and the offending property path", () => {
  const catalogs = new CatalogRegistry();
  const registered = catalogs.register({
    catalogId: "catalog",
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      catalogId: "catalog",
      components: {
        Text: {
          type: "object",
          properties: { id: { type: "string" }, component: { const: "Text" }, text: { type: "string" } },
          required: ["id", "component", "text"],
          additionalProperties: false,
        },
      },
      $defs: { theme: { type: "object" } },
    },
  });
  assert.equal(registered.ok, true);

  const store = new SurfaceStore();
  const processor = new A2UIMessageProcessor(store, catalogs);
  assert.equal(processor.process({ version: "v0.9.1", createSurface: { surfaceId: "main", catalogId: "catalog" } }).ok, true);
  const result = processor.process({
    version: "v0.9.1",
    updateComponents: { surfaceId: "main", components: [{ id: "title", component: "Text", text: 123 }] },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;

  const description = describeWeaverError(result.error);
  const failed = description.causes.find((cause) => cause.code === "COMPONENT_VALIDATION_FAILED");
  assert.ok(failed, "COMPONENT_VALIDATION_FAILED is in the cause chain");
  assert.equal(failed.componentId, "title");
  assert.equal(failed.dataPath, "/text");
  assert.match(failed.summary, /"title"/);
  assert.match(failed.summary, /\/text/);
  assert.equal(description.componentId, "title");
  assert.equal(description.dataPath, "/text");
});

test("a JSONL decode error reports its own frame", () => {
  assert.equal(describeWeaverError({ code: "INVALID_JSON", frame: 3 }).frame, 3);
});

test("a stream error takes its frame from the context", () => {
  const description = describeWeaverError(
    { code: "SURFACE_STORE_ERROR", storeError: { code: "SURFACE_NOT_FOUND", surfaceId: "main" } },
    { frame: 7 },
  );
  assert.equal(description.frame, 7);
  assert.equal(description.surfaceId, "main");
});

test("a blocked action is a warning, and every other code is an error", () => {
  const blocked = describeWeaverError({ code: "ACTION_DISPATCH_FAILED", cause: actionDispatchCodes[5]! });
  assert.equal(blocked.causes.find((cause) => cause.code === "ACTION_BLOCKED_BY_CHECKS")?.severity, "warning");
  assert.equal(blocked.componentId, "submit");

  for (const fixture of fixtures) {
    const description = describeWeaverError(fixture.error, fixture.context);
    for (const entry of [description, ...description.causes]) {
      if (entry.code === "ACTION_BLOCKED_BY_CHECKS") continue;
      assert.equal(entry.severity, "error", `${entry.code} severity`);
    }
  }
});

test("a code from a newer JavaScript caller gets a generic description rather than a crash", () => {
  const description = describeWeaverError({ code: "FUTURE_CODE" } as unknown as DescribableWeaverError);
  assert.equal(description.code, "FUTURE_CODE");
  assert.match(description.summary, /cannot describe/);
  assert.deepEqual(description.causes, []);
});

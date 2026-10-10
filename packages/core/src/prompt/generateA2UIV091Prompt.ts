import {
  CatalogRegistry,
  type CatalogRegistration,
  type CatalogRegistryError,
  type CatalogSnapshot,
  type DynamicPropertyKind,
} from "../catalog/index.js";
import { cloneJson } from "../data-model/clone.js";
import type { FunctionRegistration } from "../functions/index.js";
import type { JsonObject, JsonValue } from "../protocol/index.js";
import type { A2UIPromptGenerationError } from "./errors.js";
import type {
  A2UIPromptAction,
  A2UIPromptExample,
  A2UIPromptSection,
  A2UIPromptSectionId,
  A2UIV091PromptConfig,
  A2UIV091PromptResult,
} from "./types.js";

const DEFAULT_MAX_CHARACTERS = 24_000;

const BINDING_NOTE =
  'Properties marked "binding allowed" accept a literal value, a data binding such as {"path": "/json/pointer"}, or a function call such as {"call": "<name>", "args": {...}}, as the property schema allows.';

const DYNAMIC_TYPE_LABEL: Readonly<Record<DynamicPropertyKind, string>> = {
  dynamicString: "string",
  dynamicNumber: "number",
  dynamicBoolean: "boolean",
  dynamicStringList: "string list",
};

type Outcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: A2UIPromptGenerationError };

interface RegisteredCatalogs {
  registry: CatalogRegistry;
  snapshots: readonly CatalogSnapshot[];
}

/**
 * Compiles a trusted A2UI v0.9.1 catalog into deterministic model instructions.
 * The output depends only on the input: keys are sorted, nothing is timestamped,
 * and nothing is truncated silently.
 */
export function generateA2UIV091Prompt(
  config: A2UIV091PromptConfig,
): A2UIV091PromptResult {
  const mode = config.mode ?? "create";
  const maxCharacters = config.maxCharacters ?? DEFAULT_MAX_CHARACTERS;

  const catalogs = registerCatalogs(config.catalogs);
  if (!catalogs.ok) return { ok: false, error: catalogs.error };
  const { registry, snapshots } = catalogs.value;

  const actions = actionsSection(config.actions ?? []);
  if (!actions.ok) return { ok: false, error: actions.error };

  const components = componentsSection(registry, snapshots);
  if (!components.ok) return { ok: false, error: components.error };

  const functions = functionsSection(registry, snapshots, config.functions ?? []);
  if (!functions.ok) return { ok: false, error: functions.error };

  const built: Partial<Record<A2UIPromptSectionId, string>> = {
    envelope: envelopeSection(snapshots),
    components: components.value,
    functions: functions.value,
    actions: actions.value,
    edit: mode === "edit" ? editSection() : undefined,
    examples: examplesSection(config.examples ?? []),
  };

  const sections: A2UIPromptSection[] = [];
  for (const id of SECTION_ORDER) {
    const text = built[id];
    if (text !== undefined) sections.push({ id, title: SECTION_TITLES[id], text });
  }

  const text = sections.map((section) => section.text).join("\n\n");
  if (text.length > maxCharacters) {
    return {
      ok: false,
      error: {
        code: "PROMPT_TOO_LARGE",
        message: `Prompt is ${text.length} characters, above the ${maxCharacters} character budget.`,
        characters: text.length,
        maxCharacters,
      },
    };
  }
  return { ok: true, value: { text, sections } };
}

const SECTION_ORDER: readonly A2UIPromptSectionId[] = [
  "envelope",
  "components",
  "functions",
  "actions",
  "edit",
  "examples",
];

const SECTION_TITLES: Readonly<Record<A2UIPromptSectionId, string>> = {
  envelope: "Envelope rules",
  components: "Components",
  functions: "Functions",
  actions: "Actions",
  edit: "Edit mode",
  examples: "Examples",
};

function registerCatalogs(
  registrations: readonly CatalogRegistration[],
): Outcome<RegisteredCatalogs> {
  if (registrations.length === 0) {
    return fail({
      code: "CATALOG_INVALID",
      message: "At least one catalog is required.",
    });
  }
  const registry = new CatalogRegistry();
  for (const registration of registrations) {
    const result = registry.register(registration);
    if (!result.ok) {
      return fail(catalogFailure(registration.catalogId, result.error));
    }
  }
  const snapshots = registry.list().sort((left, right) =>
    compareStrings(left.catalogId, right.catalogId),
  );
  return { ok: true, value: { registry, snapshots } };
}

function envelopeSection(snapshots: readonly CatalogSnapshot[]): string {
  const catalogIds = snapshots
    .map((snapshot) => JSON.stringify(snapshot.catalogId))
    .join(", ");
  return [
    `## ${SECTION_TITLES.envelope}`,
    "",
    '- Output A2UI v0.9.1 messages as JSON Lines: one complete JSON object per line, with no prose and no code fences.',
    '- Every message has `"version": "v0.9.1"` and exactly one of `createSurface`, `updateComponents`, `updateDataModel` or `deleteSurface`.',
    `- \`createSurface\` takes \`surfaceId\` and \`catalogId\`. The \`catalogId\` must equal one of these catalog ids: ${catalogIds}.`,
    '- `updateComponents` takes `surfaceId` and `components`. Components are flat objects. Each has a unique `id` and a `component` name from the catalog. Refer to children by id.',
    '- The component tree is rooted at the component with id `"root"`.',
    '- `updateDataModel` takes `surfaceId`, `path` (a JSON Pointer such as `"/form/name"`) and `value`.',
    '- `deleteSurface` takes `surfaceId`.',
  ].join("\n");
}

function componentsSection(
  registry: CatalogRegistry,
  snapshots: readonly CatalogSnapshot[],
): Outcome<string> {
  const lines = [`## ${SECTION_TITLES.components}`, "", BINDING_NOTE];
  for (const snapshot of snapshots) {
    const components = snapshot.schema.components;
    if (!isJsonObject(components)) continue;
    lines.push("", `Catalog \`${snapshot.catalogId}\``);
    for (const name of sortedKeys(components)) {
      const componentSchema = components[name];
      if (!isJsonObject(componentSchema)) continue;

      const dynamic = registry.getDynamicProperties(snapshot.catalogId, name);
      if (!dynamic.ok) return fail(catalogFailure(snapshot.catalogId, dynamic.error));
      const bindable = registry.getBindableValueLocations(snapshot.catalogId, name);
      if (!bindable.ok) return fail(catalogFailure(snapshot.catalogId, bindable.error));

      const dynamicKinds = new Map(
        dynamic.value.map(({ property, valueKind }) => [property, valueKind]),
      );
      const bindableProperties = new Set(
        bindable.value
          .filter(({ path }) => path.length === 1 && path[0]!.kind === "property")
          .map(({ path }) => (path[0] as { name: string }).name),
      );

      lines.push("", `### ${name}`);
      if (typeof componentSchema.description === "string") {
        lines.push(componentSchema.description);
      }
      lines.push(...propertyLines(componentSchema, dynamicKinds, bindableProperties));
    }
  }
  return { ok: true, value: lines.join("\n") };
}

function propertyLines(
  componentSchema: JsonObject,
  dynamicKinds: ReadonlyMap<string, DynamicPropertyKind>,
  bindableProperties: ReadonlySet<string>,
): string[] {
  const properties = isJsonObject(componentSchema.properties)
    ? componentSchema.properties
    : {};
  const required = new Set(
    Array.isArray(componentSchema.required)
      ? componentSchema.required.filter((item): item is string => typeof item === "string")
      : [],
  );
  const lines: string[] = [];
  for (const name of sortedKeys(properties)) {
    const schema = properties[name];
    if (!isJsonObject(schema)) continue;
    const kind = dynamicKinds.get(name);
    const parts = [
      kind === undefined ? describeSchemaType(schema) : DYNAMIC_TYPE_LABEL[kind],
      required.has(name) ? "required" : "optional",
    ];
    if (Array.isArray(schema.enum)) {
      parts.push(`enum ${schema.enum.map(canonicalJson).join(", ")}`);
    }
    if (kind !== undefined || bindableProperties.has(name)) {
      parts.push("binding allowed");
    }
    const description =
      typeof schema.description === "string" ? ` ${schema.description}` : "";
    lines.push(`- \`${name}\`: ${parts.join("; ")}.${description}`);
  }
  return lines;
}

function functionsSection(
  registry: CatalogRegistry,
  snapshots: readonly CatalogSnapshot[],
  registrations: readonly FunctionRegistration[],
): Outcome<string> {
  const snapshotById = new Map(snapshots.map((snapshot) => [snapshot.catalogId, snapshot]));
  const seen = new Set<string>();
  const listed: { catalogId: string; name: string }[] = [];
  for (const { catalogId, name } of registrations) {
    // Only functions the catalog declares AND the host registered are listed.
    if (!snapshotById.has(catalogId) || !registry.hasFunction(catalogId, name)) continue;
    const identity = JSON.stringify([catalogId, name]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    listed.push({ catalogId, name });
  }
  listed.sort((left, right) =>
    compareStrings(left.catalogId, right.catalogId) ||
    compareStrings(left.name, right.name),
  );

  const lines = [
    `## ${SECTION_TITLES.functions}`,
    "",
    listed.length === 0
      ? "No functions are available. Do not emit function calls."
      : "Only these functions may be called. No other function names are allowed.",
  ];
  for (const { catalogId, name } of listed) {
    const definition = registry.getFunctionDefinition(catalogId, name);
    if (!definition.ok) return fail(catalogFailure(catalogId, definition.error));
    const functionSchema = functionSchemaOf(snapshotById.get(catalogId)!, name);
    const description =
      typeof functionSchema.description === "string" ? ` ${functionSchema.description}` : "";
    lines.push(
      "",
      `- \`${name}\` returns ${definition.value.returnType}.${description}`,
    );
    lines.push(...argumentLines(definition.value.arguments, functionSchema));
  }
  return { ok: true, value: lines.join("\n") };
}

function argumentLines(
  argumentKinds: Readonly<Record<string, { kind: string }>>,
  functionSchema: JsonObject,
): string[] {
  const argsSchema = isJsonObject(functionSchema.properties)
    && isJsonObject(functionSchema.properties.args)
    ? functionSchema.properties.args
    : undefined;
  const argProperties = argsSchema !== undefined && isJsonObject(argsSchema.properties)
    ? argsSchema.properties
    : {};
  const required = new Set(
    argsSchema !== undefined && Array.isArray(argsSchema.required)
      ? argsSchema.required.filter((item): item is string => typeof item === "string")
      : [],
  );
  return sortedKeys(argumentKinds).map((argName) => {
    const schema = argProperties[argName];
    const description =
      isJsonObject(schema) && typeof schema.description === "string"
        ? ` ${schema.description}`
        : "";
    return `  - \`${argName}\`: ${argumentKinds[argName]!.kind}; ${required.has(argName) ? "required" : "optional"}.${description}`;
  });
}

function functionSchemaOf(snapshot: CatalogSnapshot, name: string): JsonObject {
  const functions = snapshot.schema.functions;
  const schema = isJsonObject(functions) ? functions[name] : undefined;
  return isJsonObject(schema) ? schema : {};
}

function actionsSection(actions: readonly A2UIPromptAction[]): Outcome<string> {
  const seen = new Set<string>();
  for (const action of actions) {
    if (typeof action.name !== "string" || action.name.trim() === "") {
      return fail({
        code: "ACTION_NAME_INVALID",
        message: "Action names must be non-empty.",
        actionName: String(action.name),
        reason: "empty",
      });
    }
    if (seen.has(action.name)) {
      return fail({
        code: "ACTION_NAME_INVALID",
        message: `Action name "${action.name}" is declared more than once.`,
        actionName: action.name,
        reason: "duplicate",
      });
    }
    seen.add(action.name);
  }

  const sorted = [...actions].sort((left, right) => compareStrings(left.name, right.name));
  const lines = [`## ${SECTION_TITLES.actions}`, ""];
  if (sorted.length === 0) {
    lines.push("No host actions are declared. Do not emit any action event; no action names are allowed.");
    return { ok: true, value: lines.join("\n") };
  }
  lines.push(
    "Only these action names may appear in an event. No other action names are allowed. Context values may be literals or data bindings.",
  );
  for (const action of sorted) {
    const context =
      action.context === undefined
        ? "Context: none."
        : `Context: ${canonicalJson(cloneJson(action.context))}.`;
    lines.push(`- \`${action.name}\`: ${action.description} ${context}`);
  }
  return { ok: true, value: lines.join("\n") };
}

function editSection(): string {
  return [
    `## ${SECTION_TITLES.edit}`,
    "",
    "Emit only changed components with `updateComponents` (upsert by id) and data changes with `updateDataModel`. Do not re-send unchanged components or recreate the surface.",
  ].join("\n");
}

function examplesSection(examples: readonly A2UIPromptExample[]): string {
  const lines = [`## ${SECTION_TITLES.examples}`];
  for (const example of examples) {
    lines.push(
      "",
      `### ${example.title}`,
      "```jsonl",
      ...example.messages.map(canonicalJson),
      "```",
    );
  }
  return lines.join("\n");
}

function describeSchemaType(schema: JsonValue | undefined): string {
  if (!isJsonObject(schema)) return "any";
  if ("const" in schema) return `const ${canonicalJson(schema.const)}`;
  if (typeof schema.type === "string") {
    if (schema.type === "array" && isJsonObject(schema.items)) {
      return `array of ${describeSchemaType(schema.items)}`;
    }
    return schema.type;
  }
  if (typeof schema.$ref === "string") {
    return `reference ${schema.$ref.slice(schema.$ref.lastIndexOf("/") + 1)}`;
  }
  for (const key of ["oneOf", "anyOf"] as const) {
    const members = schema[key];
    if (Array.isArray(members)) {
      return [...new Set(members.map(describeSchemaType))].join(" or ");
    }
  }
  return "any";
}

/** Serializes JSON with sorted object keys, so equal values always print identically. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.keys(value)
    .sort(compareStrings)
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
    );
  return `{${entries.join(",")}}`;
}

function sortedKeys(record: object): string[] {
  return Object.keys(record).sort(compareStrings);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail<T>(error: A2UIPromptGenerationError): Outcome<T> {
  return { ok: false, error };
}

function catalogFailure(
  catalogId: string,
  cause: CatalogRegistryError,
): A2UIPromptGenerationError {
  return {
    code: "CATALOG_INVALID",
    message: `Catalog ${catalogId} is invalid: ${cause.message}`,
    catalogId,
    cause,
  };
}

import type {
  CallToolResult,
  McpServer,
  RegisteredTool,
  ServerContext,
  StandardSchemaWithJSON,
  ToolAnnotations,
  ToolCallback,
} from "@modelcontextprotocol/server";
import type { JsonValue } from "@weaver/core";

const TOOL_NAME = /^[A-Za-z0-9_.-]{1,128}$/;
const UNEXPECTED_FAILURE = "Application capability failed.";
const INVALID_DATA = "Application capability returned invalid structured data.";
const MISSING_DATA = "Application capability returned no structured data.";

export type McpApplicationCapabilityResult =
  | { success: true; text: string; data?: JsonValue }
  | { success: true; data: JsonValue; text?: string }
  | { success: false; message: string };

export interface McpApplicationCapability<
  InputSchema extends StandardSchemaWithJSON = StandardSchemaWithJSON,
  OutputSchema extends StandardSchemaWithJSON | undefined = StandardSchemaWithJSON | undefined,
> {
  name: string;
  title?: string;
  description: string;
  inputSchema: InputSchema;
  outputSchema?: OutputSchema;
  annotations?: ToolAnnotations;
  execute(
    input: StandardSchemaWithJSON.InferOutput<InputSchema>,
    context: ServerContext,
  ): McpApplicationCapabilityResult | Promise<McpApplicationCapabilityResult>;
}

export interface McpApplicationCapabilityDiagnostic {
  capabilityName: string;
  error: unknown;
}

export interface McpApplicationCapabilityRegistrationOptions {
  onDiagnostic?: (diagnostic: McpApplicationCapabilityDiagnostic) => void;
}

/** Registers one trusted host capability as an ordinary official MCP tool. */
export function registerMcpApplicationCapability<
  InputSchema extends StandardSchemaWithJSON,
  OutputSchema extends StandardSchemaWithJSON | undefined,
>(
  server: McpServer,
  capability: McpApplicationCapability<InputSchema, OutputSchema>,
  options: McpApplicationCapabilityRegistrationOptions = {},
): RegisteredTool {
  preflight(capability);
  const config = {
    ...(capability.title === undefined ? {} : { title: capability.title }),
    description: capability.description,
    inputSchema: capability.inputSchema,
    ...(capability.outputSchema === undefined ? {} : { outputSchema: capability.outputSchema }),
    ...(capability.annotations === undefined ? {} : { annotations: capability.annotations }),
  };

  const callback = async (input: StandardSchemaWithJSON.InferOutput<InputSchema>, context: ServerContext): Promise<CallToolResult> => {
    try {
      const result = await capability.execute(input, context);
      if (!result.success) return toolError(result.message);
      if (capability.outputSchema !== undefined && (!("data" in result) || result.data === undefined)) return toolError(MISSING_DATA);
      if (!("data" in result) || result.data === undefined) return typeof result.text === "string"
        ? { content: [{ type: "text", text: result.text }] }
        : toolError(INVALID_DATA);

      let data: JsonValue;
      try { data = cloneJson(result.data); }
      catch { return toolError(INVALID_DATA); }
      return {
        content: [{ type: "text", text: result.text ?? JSON.stringify(data) }],
        structuredContent: data,
      };
    } catch (error) {
      try { options.onDiagnostic?.({ capabilityName: capability.name, error }); }
      catch { /* A trusted diagnostic must not alter the wire result. */ }
      return toolError(UNEXPECTED_FAILURE);
    }
  };
  return server.registerTool<StandardSchemaWithJSON, InputSchema>(capability.name, config, callback as ToolCallback<InputSchema>);
}

/** Preflights the complete batch, then registers it in definition order. */
export function registerMcpApplicationCapabilities(
  server: McpServer,
  capabilities: readonly McpApplicationCapability<any, any>[],
  options: McpApplicationCapabilityRegistrationOptions = {},
): RegisteredTool[] {
  const names = new Set<string>();
  for (const capability of capabilities) {
    preflight(capability);
    if (names.has(capability.name)) throw new TypeError(`Duplicate MCP application capability name: ${capability.name}`);
    names.add(capability.name);
  }
  return capabilities.map((capability) => registerMcpApplicationCapability(server, capability, options));
}

function preflight(capability: McpApplicationCapability<any, any>): void {
  if (!TOOL_NAME.test(capability.name)) throw new TypeError("MCP application capability name must be 1..128 characters using only A-Z, a-z, 0-9, _, -, or .");
  if (typeof capability.description !== "string" || capability.description.trim().length === 0) throw new TypeError(`MCP application capability '${capability.name}' requires a non-empty description`);
  if (capability.inputSchema === undefined) throw new TypeError(`MCP application capability '${capability.name}' requires an input schema`);
}

function toolError(message: string) {
  return { isError: true as const, content: [{ type: "text" as const, text: message }] };
}

function cloneJson(value: JsonValue): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Non-finite number");
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => cloneJson(entry));
  if (typeof value !== "object") throw new TypeError("Not JSON-safe");
  const output: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || typeof entry === "function" || typeof entry === "symbol" || typeof entry === "bigint") throw new TypeError("Not JSON-safe");
    output[key] = cloneJson(entry as JsonValue);
  }
  return output;
}

import { WEAVER_CORE_VERSION, createWeaverRuntime, type WeaverRuntime } from "@weaver/core";
import { RendererRegistry, createBrowserA2UIHttpSseTransport, createBasicCatalogRendererRegistrations, type DateTimeInputLocalValueRequest, type DateTimeInputLocalValueResult } from "@weaver/web";
import { createA2UIMcpClientBridge, registerMcpApplicationCapabilities } from "@weaver/mcp";

const version: string = WEAVER_CORE_VERSION;
const runtimeFactory: typeof createWeaverRuntime = createWeaverRuntime;
const runtimeType = null as WeaverRuntime | null;
const rendererRegistry = RendererRegistry;
const browserTransport = createBrowserA2UIHttpSseTransport;
const mcpBridge = createA2UIMcpClientBridge;
const applicationCapabilities = registerMcpApplicationCapabilities;

const resolver = (request: DateTimeInputLocalValueRequest): DateTimeInputLocalValueResult => ({ status: "accept", value: request.rawValue });
const basicRegistrations = createBasicCatalogRendererRegistrations({ catalogId: "basic", dateTimeInputLocalValueResolver: resolver });

void [version, runtimeFactory, runtimeType, rendererRegistry, browserTransport, mcpBridge, applicationCapabilities, basicRegistrations];

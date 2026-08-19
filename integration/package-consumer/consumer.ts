import { WEAVER_CORE_VERSION, createWeaverRuntime, type WeaverRuntime } from "@weaver/core";
import { RendererRegistry, createBasicWebRuntime, createBrowserA2UIHttpSseTransport, createBasicCatalogRendererRegistrations, type BasicWebRuntime, type BasicWebRuntimeConfig, type DateTimeInputLocalValueRequest, type DateTimeInputLocalValueResult } from "@weaver/web";
import { createA2UIMcpClientBridge, registerMcpApplicationCapabilities } from "@weaver/mcp";

const version: string = WEAVER_CORE_VERSION;
const runtimeFactory: typeof createWeaverRuntime = createWeaverRuntime;
const runtimeType = null as WeaverRuntime | null;
const rendererRegistry = RendererRegistry;
const basicWebRuntimeFactory: typeof createBasicWebRuntime = createBasicWebRuntime;
const basicWebRuntimeType = null as BasicWebRuntime | null;
const basicWebRuntimeConfigType = null as BasicWebRuntimeConfig | null;
const browserTransport = createBrowserA2UIHttpSseTransport;
const mcpBridge = createA2UIMcpClientBridge;
const applicationCapabilities = registerMcpApplicationCapabilities;

const resolver = (request: DateTimeInputLocalValueRequest): DateTimeInputLocalValueResult => ({ status: "accept", value: request.rawValue });
const basicRegistrations = createBasicCatalogRendererRegistrations({ catalogId: "basic", dateTimeInputLocalValueResolver: resolver });

void [version, runtimeFactory, runtimeType, rendererRegistry, basicWebRuntimeFactory, basicWebRuntimeType, basicWebRuntimeConfigType, browserTransport, mcpBridge, applicationCapabilities, basicRegistrations];

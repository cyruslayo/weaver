import { createA2UIV091Producer, createA2UIV091StreamIngestion, WEAVER_CORE_VERSION, createWeaverRuntime, type A2UIV091StreamIngestionEvent, type WeaverRuntime } from "@weaver/core";
import { RendererRegistry, createBasicWebRuntime, createBrowserA2UIHttpSseTransport, createBasicCatalogRendererRegistrations, type BasicWebRuntime, type BasicWebRuntimeConfig, type DateTimeInputLocalValueRequest, type DateTimeInputLocalValueResult } from "@weaver/web";
import { createA2UIMcpClientBridge, registerMcpApplicationCapabilities } from "@weaver/mcp";

const version: string = WEAVER_CORE_VERSION;
const producer = createA2UIV091Producer();
const producerMessages = [
  producer.createSurface({ surfaceId: "consumer", catalogId: "catalog" }),
  producer.updateComponents({ surfaceId: "consumer", components: [{ id: "root", component: "Text", text: "consumer" }] }),
  producer.updateDataModel({ surfaceId: "consumer", path: "/name", value: "Ada" }),
  producer.deleteSurface({ surfaceId: "consumer" }),
];
const runtimeFactory: typeof createWeaverRuntime = createWeaverRuntime;
const runtimeType = null as WeaverRuntime | null;
const streamIngestionFactory: typeof createA2UIV091StreamIngestion = createA2UIV091StreamIngestion;
const streamIngestionEventType = null as A2UIV091StreamIngestionEvent | null;
const emptyRuntime = createWeaverRuntime({ catalogs: [] });
if (!emptyRuntime.ok) throw new Error("consumer runtime configuration failed");
const streamIngestion = createA2UIV091StreamIngestion({ runtime: emptyRuntime.value });
const streamEvents = streamIngestion.push("not-json\\n");
const rendererRegistry = RendererRegistry;
const basicWebRuntimeFactory: typeof createBasicWebRuntime = createBasicWebRuntime;
const basicWebRuntimeType = null as BasicWebRuntime | null;
const basicWebRuntimeConfigType = null as BasicWebRuntimeConfig | null;
const browserTransport = createBrowserA2UIHttpSseTransport;
const mcpBridge = createA2UIMcpClientBridge;
const applicationCapabilities = registerMcpApplicationCapabilities;

const resolver = (request: DateTimeInputLocalValueRequest): DateTimeInputLocalValueResult => ({ status: "accept", value: request.rawValue });
const basicRegistrations = createBasicCatalogRendererRegistrations({ catalogId: "basic", dateTimeInputLocalValueResolver: resolver });

void [version, producerMessages, runtimeFactory, runtimeType, streamIngestionFactory, streamIngestionEventType, streamEvents, rendererRegistry, basicWebRuntimeFactory, basicWebRuntimeType, basicWebRuntimeConfigType, browserTransport, mcpBridge, applicationCapabilities, basicRegistrations];

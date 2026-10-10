import { createA2UIV091Producer, createA2UIV091StreamIngestion, WEAVER_CORE_VERSION, createWeaverRuntime, type A2UIV091StreamIngestionEvent, type WeaverRuntime, type WeaverRuntimeSafetyConfig, type ResolutionBudgetExceededError } from "@cylayo/weaver-core";
import { RendererRegistry, createBasicWebRuntime, createBrowserA2UIHttpSseTransport, createBasicCatalogRendererRegistrations, type BasicWebRuntime, type BasicWebRuntimeConfig, type DateTimeInputLocalValueRequest, type DateTimeInputLocalValueResult } from "@cylayo/weaver-web";
import { createA2UIMcpClientBridge, registerMcpApplicationCapabilities } from "@cylayo/weaver-mcp";
import { A2UI_V091_BASIC_CATALOG_ID, A2UI_V091_BASIC_PROMPT_EXAMPLES, WEAVER_TRACE_FORMAT, WEAVER_TRACE_REPLAY_INVALID_INPUT, createBasicCatalogV091Registration, createWeaverTraceRecorder, defineCatalog, describeWeaverError, generateA2UIV091Prompt, parseWeaverTrace, replayWeaverTrace, type A2UIV091PromptExampleInvalidError, type A2UIV091PromptGenerationError, type A2UIV091PromptGenerationErrorCode, type A2UIV091CatalogSchema, type A2UIV091PromptResult, type CatalogDefinition, type DescribableWeaverError, type WeaverErrorDescription, type WeaverRuntimeEvent, type WeaverRuntimeObserver, type WeaverTrace, type WeaverTraceEntry, type WeaverTraceParseResult, type WeaverTraceRecorder, type WeaverTraceRecorderOptions, type WeaverTraceReplayOptions, type WeaverTraceReplayResult, type WeaverTraceReplayStep } from "@cylayo/weaver-core";
import { describeWebRenderError, type DescribableWebError, type WebRenderError } from "@cylayo/weaver-web";

const version: string = WEAVER_CORE_VERSION;
const producer = createA2UIV091Producer();
const producerMessages = [
  producer.createSurface({ surfaceId: "consumer", catalogId: "catalog" }),
  producer.updateComponents({ surfaceId: "consumer", components: [{ id: "root", component: "Text", text: "consumer" }] }),
  producer.updateDataModel({ surfaceId: "consumer", path: "/name", value: "Ada" }),
  producer.deleteSurface({ surfaceId: "consumer" }),
];
const runtimeFactory: typeof createWeaverRuntime = createWeaverRuntime;
const safetyConfig: WeaverRuntimeSafetyConfig = { maxResolutionDepth: 8, maxResolvedInstances: 64 };
const budgetErrorCode: ResolutionBudgetExceededError["code"] = "RESOLUTION_BUDGET_EXCEEDED";
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

void [version, producerMessages, runtimeFactory, safetyConfig, budgetErrorCode, runtimeType, streamIngestionFactory, streamIngestionEventType, streamEvents, rendererRegistry, basicWebRuntimeFactory, basicWebRuntimeType, basicWebRuntimeConfigType, browserTransport, mcpBridge, applicationCapabilities, basicRegistrations];

// Prompt generation, runtime observer, trace recorder and replay, and error descriptions (added in 0.3.0).
const promptCodeType: A2UIV091PromptGenerationErrorCode = "CATALOG_INVALID";
const promptErrorType = null as A2UIV091PromptGenerationError | null;
const exampleInvalidType = null as A2UIV091PromptExampleInvalidError | null;
const promptResultType = null as A2UIV091PromptResult | null;
const catalogSchemaType = null as A2UIV091CatalogSchema | null;
const catalogDefinitionType = null as CatalogDefinition | null;
const observerType = null as WeaverRuntimeObserver | null;
const runtimeEventType = null as WeaverRuntimeEvent | null;
const traceType = null as WeaverTrace | null;
const traceEntryType = null as WeaverTraceEntry | null;
const traceRecorderType = null as WeaverTraceRecorder | null;
const traceRecorderOptionsType = null as WeaverTraceRecorderOptions | null;
const traceParseResultType = null as WeaverTraceParseResult | null;
const traceReplayOptionsType = null as WeaverTraceReplayOptions | null;
const traceReplayResultType = null as WeaverTraceReplayResult | null;
const traceReplayStepType = null as WeaverTraceReplayStep | null;
const weaverErrorDescriptionType = null as WeaverErrorDescription | null;
const describableCoreErrorType = null as DescribableWeaverError | null;
const describableWebErrorType = null as DescribableWebError | null;
const webRenderErrorType = null as WebRenderError | null;
const traceFormat: "weaver-trace" = WEAVER_TRACE_FORMAT;
const replayInvalidInputCode: typeof WEAVER_TRACE_REPLAY_INVALID_INPUT = WEAVER_TRACE_REPLAY_INVALID_INPUT;
const promptGenerator: typeof generateA2UIV091Prompt = generateA2UIV091Prompt;
const basicPromptExamples: typeof A2UI_V091_BASIC_PROMPT_EXAMPLES = A2UI_V091_BASIC_PROMPT_EXAMPLES;
const basicCatalogId: typeof A2UI_V091_BASIC_CATALOG_ID = A2UI_V091_BASIC_CATALOG_ID;
const defineCatalogFactory: typeof defineCatalog = defineCatalog;
const traceRecorderFactory: typeof createWeaverTraceRecorder = createWeaverTraceRecorder;
const traceParser: typeof parseWeaverTrace = parseWeaverTrace;
const traceReplayer: typeof replayWeaverTrace = replayWeaverTrace;
const coreErrorDescriber: typeof describeWeaverError = describeWeaverError;
const webErrorDescriber: typeof describeWebRenderError = describeWebRenderError;
const promptOutcome: A2UIV091PromptResult = promptGenerator({ catalogs: [createBasicCatalogV091Registration()], examples: basicPromptExamples, mode: "edit" });
const parsedTrace: WeaverTraceParseResult = traceParser({});
const recorder: WeaverTraceRecorder = traceRecorderFactory({ maxEntries: 10 });
const describedCoreError: WeaverErrorDescription = coreErrorDescriber({ code: "INVALID_JSON", frame: 1 });
const describedWebError: WeaverErrorDescription = webErrorDescriber({ code: "THEME_ADAPTER_FAILED" });

void [promptCodeType, promptErrorType, exampleInvalidType, promptResultType, catalogSchemaType, catalogDefinitionType, observerType, runtimeEventType, traceType, traceEntryType, traceRecorderType, traceRecorderOptionsType, traceParseResultType, traceReplayOptionsType, traceReplayResultType, traceReplayStepType, weaverErrorDescriptionType, describableCoreErrorType, describableWebErrorType, webRenderErrorType, traceFormat, replayInvalidInputCode, basicCatalogId, defineCatalogFactory, traceReplayer, promptOutcome, parsedTrace, recorder, describedCoreError, describedWebError];

/**
 * Sample A2UI v1.0 agent messages. Every valid sample must also validate against
 * the pinned upstream agent_to_renderer.json schema (see validation tests).
 */
export const validA2UIFixtures = {
  createSurface: {
    version: "1.0",
    createSurface: {
      surfaceId: "main",
      catalogId: "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json",
      sendDataModel: true,
    },
  },
  createSurfaceWithContent: {
    version: "1.0",
    createSurface: {
      surfaceId: "main",
      catalogId: "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json",
      components: [{ id: "root", component: "Text", text: "Hello" }],
      dataModel: { title: "Hello" },
    },
  },
  createSurfaceWithMetadata: {
    version: "1.0",
    createSurface: {
      surfaceId: "main",
      catalogId: "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json",
      metadata: { extensions: { example_vendor: { enabled: true } } },
    },
  },
  createSurfaceWithoutCatalog: {
    version: "1.0",
    createSurface: { surfaceId: "main" },
  },
  updateComponents: {
    version: "1.0",
    updateComponents: { surfaceId: "main", components: [{ id: "root", component: "Text", text: "Hello" }] },
  },
  updateDataModel: {
    version: "1.0",
    updateDataModel: { surfaceId: "main", path: "/title", value: "Hello" },
  },
  updateDataModelRoot: {
    version: "1.0",
    updateDataModel: { surfaceId: "main", value: { title: "Hello" } },
  },
  updateDataModelNullValue: {
    version: "1.0",
    updateDataModel: { surfaceId: "main", path: "/title", value: null },
  },
  deleteSurface: { version: "1.0", deleteSurface: { surfaceId: "main" } },
  callRendererFunction: {
    version: "1.0",
    callRendererFunction: {
      surfaceId: "main",
      functionCallId: "call-1",
      callFunction: { "@call": "formatDate", catalogId: "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json", args: { value: "2026-01-01T00:00:00Z", format: "yyyy" } },
    },
  },
  agentFunctionResponse: {
    version: "1.0",
    agentFunctionResponse: { functionCallId: "call-1", value: "2026" },
  },
} as const;

export const invalidA2UIFixtures = {
  wrongVersionV091: { version: "v0.9.1", deleteSurface: { surfaceId: "main" } },
  wrongVersionV09: { version: "v0.9", deleteSurface: { surfaceId: "main" } },
  wrongVersionV10: { version: "v1.0", deleteSurface: { surfaceId: "main" } },
  missingVersion: { deleteSurface: { surfaceId: "main" } },
  unknownMessageType: { version: "1.0", unknownMessage: {} },
  multipleMessageTypes: { version: "1.0", createSurface: { surfaceId: "main" }, deleteSurface: { surfaceId: "main" } },
  missingSurfaceId: { version: "1.0", deleteSurface: {} },
  createSurfaceTheme: {
    version: "1.0",
    createSurface: { surfaceId: "main", catalogId: "basic", theme: { primaryColor: "#123456" } },
  },
  createSurfaceEmptyComponents: { version: "1.0", createSurface: { surfaceId: "main", components: [] } },
  createSurfaceUnknownProperty: { version: "1.0", createSurface: { surfaceId: "main", extra: true } },
  createSurfaceNonObjectDataModel: { version: "1.0", createSurface: { surfaceId: "main", dataModel: [] } },
  createSurfaceBadExtensionKey: {
    version: "1.0",
    createSurface: { surfaceId: "main", metadata: { extensions: { "bad-key": true } } },
  },
  createSurfaceSurfaceComponent: {
    version: "1.0",
    createSurface: { surfaceId: "main", components: [{ id: "root", component: "Surface" }] },
  },
  componentsNotArray: { version: "1.0", updateComponents: { surfaceId: "main", components: {} } },
  componentMissingId: { version: "1.0", updateComponents: { surfaceId: "main", components: [{ component: "Text" }] } },
  componentMissingComponent: { version: "1.0", updateComponents: { surfaceId: "main", components: [{ id: "title" }] } },
  componentHyphenId: { version: "1.0", updateComponents: { surfaceId: "main", components: [{ id: "user-card", component: "Text" }] } },
  componentDigitLeadId: { version: "1.0", updateComponents: { surfaceId: "main", components: [{ id: "1st_item", component: "Text" }] } },
  componentEmptyId: { version: "1.0", updateComponents: { surfaceId: "main", components: [{ id: "", component: "Text" }] } },
  updateComponentsSurfaceComponent: {
    version: "1.0",
    updateComponents: { surfaceId: "main", components: [{ id: "root", component: "Surface" }] },
  },
  oldWrapperComponent: { version: "1.0", updateComponents: { surfaceId: "main", components: [{ id: "title", component: { Text: { text: "Hello" } } }] } },
  nonJsonPropertyValue: { version: "1.0", updateComponents: { surfaceId: "main", components: [{ id: "title", component: "Text", handler: undefined }] } },
  updateDataModelMissingValue: { version: "1.0", updateDataModel: { surfaceId: "main", path: "/title" } },
  legacyBeginRendering: { version: "1.0", beginRendering: { surfaceId: "main" } },
  legacySurfaceUpdate: { version: "1.0", surfaceUpdate: { surfaceId: "main" } },
  callRendererFunctionMissingCatalogId: {
    version: "1.0",
    callRendererFunction: { functionCallId: "call-1", callFunction: { "@call": "formatDate" } },
  },
  agentFunctionResponseBothValueAndError: {
    version: "1.0",
    agentFunctionResponse: { functionCallId: "call-1", value: 1, error: { code: "E", message: "m" } },
  },
  agentFunctionResponseNeither: { version: "1.0", agentFunctionResponse: { functionCallId: "call-1" } },
} as const;

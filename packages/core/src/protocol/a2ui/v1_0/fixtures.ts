export const validA2UIFixtures = {
  createSurface: { version: "v0.9.1", createSurface: { surfaceId: "main", catalogId: "basic", theme: { color: "blue" }, sendDataModel: true } },
  updateComponents: { version: "v0.9.1", updateComponents: { surfaceId: "main", components: [{ id: "title", component: "Text", text: "Hello" }] } },
  updateDataModel: { version: "v0.9.1", updateDataModel: { surfaceId: "main", path: "/title", value: "Hello" } },
  updateDataModelOmittedValue: { version: "v0.9.1", updateDataModel: { surfaceId: "main", path: "/title" } },
  updateDataModelNullValue: { version: "v0.9.1", updateDataModel: { surfaceId: "main", path: "/title", value: null } },
  deleteSurface: { version: "v0.9.1", deleteSurface: { surfaceId: "main" } },
} as const;

export const invalidA2UIFixtures = {
  wrongVersion: { version: "v1.0", deleteSurface: { surfaceId: "main" } },
  missingVersion: { deleteSurface: { surfaceId: "main" } },
  unknownMessageType: { version: "v0.9.1", unknownMessage: {} },
  multipleMessageTypes: { version: "v0.9.1", createSurface: {}, deleteSurface: {} },
  missingSurfaceId: { version: "v0.9.1", deleteSurface: {} },
  missingCatalogId: { version: "v0.9.1", createSurface: { surfaceId: "main" } },
  componentsNotArray: { version: "v0.9.1", updateComponents: { surfaceId: "main", components: {} } },
  componentMissingId: { version: "v0.9.1", updateComponents: { surfaceId: "main", components: [{ component: "Text" }] } },
  componentMissingComponent: { version: "v0.9.1", updateComponents: { surfaceId: "main", components: [{ id: "title" }] } },
  oldWrapperComponent: { version: "v0.9.1", updateComponents: { surfaceId: "main", components: [{ id: "title", component: { Text: { text: "Hello" } } }] } },
  nonJsonPropertyValue: { version: "v0.9.1", updateComponents: { surfaceId: "main", components: [{ id: "title", component: "Text", handler: undefined }] } },
  legacyBeginRendering: { version: "v0.9.1", beginRendering: { surfaceId: "main" } },
  legacySurfaceUpdate: { version: "v0.9.1", surfaceUpdate: { surfaceId: "main" } },
} as const;

export class RendererRegistryConfigurationError extends Error {
  readonly code = "RENDERER_ALREADY_REGISTERED" as const;
  readonly catalogId: string;
  readonly component: string;

  constructor(catalogId: string, component: string) {
    super(`A renderer is already registered for ${catalogId} / ${component}`);
    this.name = "RendererRegistryConfigurationError";
    this.catalogId = catalogId;
    this.component = component;
  }
}

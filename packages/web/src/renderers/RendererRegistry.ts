import { RendererRegistryConfigurationError } from "./errors.js";
import type { RendererMetadata, RendererRegistration, WebComponentRenderer } from "./types.js";

const key = (catalogId: string, component: string): string => JSON.stringify([catalogId, component]);

/** Immutable allowlist of host-provided, trusted browser implementations. */
export class RendererRegistry {
  readonly #renderers = new Map<string, WebComponentRenderer>();
  readonly #metadata: RendererMetadata[];

  constructor(registrations: readonly RendererRegistration[]) {
    const metadata: RendererMetadata[] = [];
    for (const registration of registrations) {
      const identity = key(registration.catalogId, registration.component);
      if (this.#renderers.has(identity)) {
        throw new RendererRegistryConfigurationError(registration.catalogId, registration.component);
      }
      this.#renderers.set(identity, registration.render);
      metadata.push({ catalogId: registration.catalogId, component: registration.component });
    }
    this.#metadata = metadata;
  }

  get(catalogId: string, component: string): WebComponentRenderer | undefined {
    return this.#renderers.get(key(catalogId, component));
  }

  has(catalogId: string, component: string): boolean {
    return this.#renderers.has(key(catalogId, component));
  }

  list(): RendererMetadata[] {
    return this.#metadata.map((entry) => ({ ...entry }));
  }
}

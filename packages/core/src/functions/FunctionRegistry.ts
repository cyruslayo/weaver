import type { CatalogRegistry } from "../catalog/index.js";
import type {
  FunctionImplementationMetadata,
  FunctionRegistration,
  FunctionRegistrationResult,
} from "./types.js";

const key = (catalogId: string, name: string): string => JSON.stringify([catalogId, name]);

/** Stores only host-supplied trusted implementations, isolated by catalog. */
export class FunctionRegistry {
  readonly #catalogs: CatalogRegistry;
  readonly #implementations = new Map<string, Readonly<FunctionRegistration>>();

  constructor(catalogs: CatalogRegistry) {
    this.#catalogs = catalogs;
  }

  register(registration: FunctionRegistration): FunctionRegistrationResult {
    const declaration = this.#catalogs.getFunctionDefinition(registration.catalogId, registration.name);
    if (!declaration.ok) return { ok: false, error: declaration.error };

    const identity = key(registration.catalogId, registration.name);
    if (this.#implementations.has(identity)) {
      return {
        ok: false,
        error: {
          code: "FUNCTION_IMPLEMENTATION_ALREADY_REGISTERED",
          message: "A function implementation is already registered",
          catalogId: registration.catalogId,
          functionName: registration.name,
        },
      };
    }

    this.#implementations.set(identity, Object.freeze({ ...registration }));
    return {
      ok: true,
      value: {
        catalogId: registration.catalogId,
        name: registration.name,
        returnType: declaration.value.returnType,
        effect: registration.effect,
      },
    };
  }

  has(catalogId: string, functionName: string): boolean {
    return this.#implementations.has(key(catalogId, functionName));
  }

  list(catalogId: string): FunctionImplementationMetadata[] {
    const result: FunctionImplementationMetadata[] = [];
    for (const [identity] of this.#implementations) {
      const [registeredCatalogId, name] = JSON.parse(identity) as [string, string];
      if (registeredCatalogId !== catalogId) continue;
      const definition = this.#catalogs.getFunctionDefinition(catalogId, name);
      const registration = this.#implementations.get(identity);
      if (definition.ok && registration !== undefined) {
        result.push({ catalogId, name, returnType: definition.value.returnType, effect: registration.effect });
      }
    }
    return result;
  }

  /** Internal evaluator seam; listing APIs never expose this reference. */
  getRegistration(catalogId: string, functionName: string): Readonly<FunctionRegistration> | undefined {
    return this.#implementations.get(key(catalogId, functionName));
  }
}

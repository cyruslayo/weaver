import type { A2UIComponent } from "../protocol/index.js";
import { cloneJson } from "./clone.js";
import type { SurfaceStoreResult } from "./errors.js";
import type {
  CreateSurfaceInput,
  SurfaceChange,
  SurfaceSnapshot,
  SurfaceSubscriber,
  Unsubscribe,
} from "./types.js";

interface StoredSurface {
  surfaceId: string;
  catalogId: string;
  theme?: SurfaceSnapshot["theme"];
  sendDataModel: boolean;
  components: Map<string, A2UIComponent>;
}

const success = <T>(value: T): SurfaceStoreResult<T> => ({ ok: true, value });

export class SurfaceStore {
  readonly #surfaces = new Map<string, StoredSurface>();
  readonly #subscribers = new Map<string, Set<SurfaceSubscriber>>();

  create(input: CreateSurfaceInput): SurfaceStoreResult<SurfaceSnapshot> {
    if (this.#surfaces.has(input.surfaceId)) {
      return {
        ok: false,
        error: { code: "SURFACE_ALREADY_EXISTS", surfaceId: input.surfaceId },
      };
    }

    const surface: StoredSurface = {
      surfaceId: input.surfaceId,
      catalogId: input.catalogId,
      ...(input.theme === undefined ? {} : { theme: cloneJson(input.theme) }),
      sendDataModel: input.sendDataModel ?? false,
      components: new Map(),
    };
    this.#surfaces.set(input.surfaceId, surface);
    const snapshot = this.#snapshot(surface);
    this.#notify(input.surfaceId, () => ({ type: "created", surface: this.#snapshot(surface) }));
    return success(snapshot);
  }

  has(surfaceId: string): boolean {
    return this.#surfaces.has(surfaceId);
  }

  get(surfaceId: string): SurfaceSnapshot | undefined {
    const surface = this.#surfaces.get(surfaceId);
    return surface === undefined ? undefined : this.#snapshot(surface);
  }

  list(): SurfaceSnapshot[] {
    return Array.from(this.#surfaces.values(), (surface) => this.#snapshot(surface));
  }

  hasRoot(surfaceId: string): boolean {
    return this.#surfaces.get(surfaceId)?.components.has("root") ?? false;
  }

  updateComponents(
    surfaceId: string,
    components: readonly A2UIComponent[],
  ): SurfaceStoreResult<SurfaceSnapshot> {
    const surface = this.#surfaces.get(surfaceId);
    if (surface === undefined) {
      return { ok: false, error: { code: "SURFACE_NOT_FOUND", surfaceId } };
    }

    const ids = new Set<string>();
    for (const component of components) {
      if (ids.has(component.id)) {
        return {
          ok: false,
          error: {
            code: "DUPLICATE_COMPONENT_ID",
            surfaceId,
            componentId: component.id,
          },
        };
      }
      ids.add(component.id);
    }

    for (const component of components) {
      surface.components.set(component.id, cloneJson(component));
    }
    const componentIds = [...ids];
    const snapshot = this.#snapshot(surface);
    this.#notify(surfaceId, () => ({
      type: "componentsUpdated",
      surface: this.#snapshot(surface),
      componentIds: [...componentIds],
    }));
    return success(snapshot);
  }

  delete(surfaceId: string): SurfaceStoreResult<void> {
    if (!this.#surfaces.delete(surfaceId)) {
      return { ok: false, error: { code: "SURFACE_NOT_FOUND", surfaceId } };
    }
    this.#notify(surfaceId, () => ({ type: "deleted", surfaceId }));
    return success(undefined);
  }

  subscribe(surfaceId: string, subscriber: SurfaceSubscriber): Unsubscribe {
    let subscribers = this.#subscribers.get(surfaceId);
    if (subscribers === undefined) {
      subscribers = new Set();
      this.#subscribers.set(surfaceId, subscribers);
    }
    subscribers.add(subscriber);

    return () => {
      subscribers.delete(subscriber);
      if (subscribers.size === 0) this.#subscribers.delete(surfaceId);
    };
  }

  #snapshot(surface: StoredSurface): SurfaceSnapshot {
    const components: Record<string, A2UIComponent> = {};
    for (const [id, component] of surface.components) {
      components[id] = cloneJson(component);
    }
    return {
      surfaceId: surface.surfaceId,
      catalogId: surface.catalogId,
      ...(surface.theme === undefined ? {} : { theme: cloneJson(surface.theme) }),
      sendDataModel: surface.sendDataModel,
      components,
    };
  }

  #notify(surfaceId: string, createChange: () => SurfaceChange): void {
    const subscribers = this.#subscribers.get(surfaceId);
    if (subscribers === undefined) return;

    // Mutations are already committed. Every current subscriber is attempted;
    // callback failures are isolated and never roll state back.
    for (const subscriber of [...subscribers]) {
      try {
        subscriber(createChange());
      } catch {
        // Subscriber error handling belongs to the subscribing framework.
      }
    }
  }
}

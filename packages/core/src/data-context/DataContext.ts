import type { JsonValue } from "../protocol/index.js";
import { cloneJson } from "../data-model/clone.js";
import { formatPointer, readTokens } from "../data-model/pointer.js";
import type { DataContextResult } from "./errors.js";
import { resolveScopedPath } from "./path.js";
import type { DataPathBinding } from "./types.js";

const success = <T>(value: T): DataContextResult<T> => ({ ok: true, value });

/** Immutable, snapshot-based data evaluation scope. */
export class DataContext {
  readonly #dataModel: JsonValue;
  readonly #scopeTokens: readonly string[];
  readonly #collectionIndex: number | undefined;

  private constructor(
    dataModel: JsonValue,
    scopeTokens: readonly string[],
    collectionIndex: number | undefined,
    owned: boolean,
  ) {
    this.#dataModel = owned ? dataModel : cloneJson(dataModel);
    this.#scopeTokens = Object.freeze([...scopeTokens]);
    this.#collectionIndex = collectionIndex;
  }

  static root(dataModel: JsonValue): DataContext {
    return new DataContext(dataModel, [], undefined, false);
  }

  get scopePath(): string {
    return formatPointer(this.#scopeTokens);
  }

  get collectionIndex(): number | undefined {
    return this.#collectionIndex;
  }

  resolvePath(path: string): DataContextResult<string> {
    const resolved = resolveScopedPath(path, this.#scopeTokens);
    return resolved.ok ? success(resolved.value.absolutePath) : resolved;
  }

  get(path: string): DataContextResult<JsonValue | undefined> {
    const resolved = resolveScopedPath(path, this.#scopeTokens);
    if (!resolved.ok) return resolved;
    const value = readTokens(this.#dataModel, resolved.value.tokens);
    return success(value === undefined ? undefined : cloneJson(value));
  }

  resolveBinding(binding: DataPathBinding): DataContextResult<JsonValue | undefined> {
    return this.get(binding.path);
  }

  resolveBindingPath(binding: DataPathBinding): DataContextResult<string> {
    return this.resolvePath(binding.path);
  }

  createCollectionItemContext(
    collectionPath: string,
    index: number,
  ): DataContextResult<DataContext> {
    if (!Number.isSafeInteger(index) || index < 0) {
      return { ok: false, error: { code: "INVALID_COLLECTION_INDEX", index } };
    }

    const resolved = resolveScopedPath(collectionPath, this.#scopeTokens);
    if (!resolved.ok) return resolved;
    const collection = readTokens(this.#dataModel, resolved.value.tokens);
    if (collection === undefined) {
      return {
        ok: false,
        error: { code: "COLLECTION_NOT_FOUND", path: resolved.value.absolutePath },
      };
    }
    if (!Array.isArray(collection)) {
      return {
        ok: false,
        error: { code: "COLLECTION_NOT_ARRAY", path: resolved.value.absolutePath },
      };
    }
    if (index >= collection.length) {
      return {
        ok: false,
        error: {
          code: "COLLECTION_INDEX_OUT_OF_RANGE",
          path: resolved.value.absolutePath,
          index,
          length: collection.length,
        },
      };
    }

    return success(
      new DataContext(this.#dataModel, [...resolved.value.tokens, String(index)], index, true),
    );
  }
}

import type { JsonValue } from "../protocol/index.js";
import { cloneJson, equalJson } from "./clone.js";
import type { DataModelError, DataModelResult } from "./errors.js";
import { isArrayIndex, parsePointer, pointersRelated, readTokens } from "./pointer.js";
import type {
  DataModelChange,
  DataModelSubscriber,
  DataModelUnsubscribe,
} from "./types.js";

interface Subscription {
  tokens: string[];
  subscriber: DataModelSubscriber;
}

const success = <T>(value: T): DataModelResult<T> => ({ ok: true, value });

/** Independent, defensively-owned reactive JSON state for one future surface. */
export class DataModel {
  #state: JsonValue = {};
  readonly #subscriptions = new Set<Subscription>();

  get(path = "/"): DataModelResult<JsonValue | undefined> {
    const parsed = parsePointer(path);
    if (!parsed.ok) return parsed;
    const resolved = this.#readValidated(this.#state, parsed.value, path);
    if (!resolved.ok) return resolved;
    return success(resolved.value === undefined ? undefined : cloneJson(resolved.value));
  }

  replace(value: JsonValue): DataModelResult<DataModelChange> {
    return this.set("/", value);
  }

  set(path: string, value: JsonValue): DataModelResult<DataModelChange> {
    const parsed = parsePointer(path);
    if (!parsed.ok) return parsed;
    const beforeState = this.#state;
    const nextState = cloneJson(this.#state);
    const storedValue = cloneJson(value);
    const previousValue = readTokens(beforeState, parsed.value);

    let committed: JsonValue;
    if (parsed.value.length === 0) {
      committed = storedValue;
    } else {
      const applied = this.#applySet(nextState, parsed.value, storedValue, path);
      if (!applied.ok) return applied;
      committed = nextState;
    }

    this.#state = committed;
    const change = this.#change(path, previousValue, value);
    this.#notify(parsed.value, beforeState, change);
    return success(this.#cloneChange(change));
  }

  delete(path: string): DataModelResult<DataModelChange | undefined> {
    const parsed = parsePointer(path);
    if (!parsed.ok) return parsed;
    const beforeState = this.#state;

    if (parsed.value.length === 0) {
      if (equalJson(beforeState, {})) return success(undefined);
      this.#state = {};
      const change = this.#change(path, beforeState, {});
      this.#notify(parsed.value, beforeState, change);
      return success(this.#cloneChange(change));
    }

    const nextState = cloneJson(this.#state);
    const removed = this.#applyDelete(nextState, parsed.value, path);
    if (!removed.ok) return removed;
    if (!removed.value) return success(undefined);

    this.#state = nextState;
    const previousValue = readTokens(beforeState, parsed.value);
    const change = this.#change(path, previousValue, undefined);
    this.#notify(parsed.value, beforeState, change);
    return success(this.#cloneChange(change));
  }

  subscribe(subscriber: DataModelSubscriber): DataModelUnsubscribe;
  subscribe(path: string, subscriber: DataModelSubscriber): DataModelUnsubscribe;
  subscribe(
    pathOrSubscriber: string | DataModelSubscriber,
    possibleSubscriber?: DataModelSubscriber,
  ): DataModelUnsubscribe {
    const path = typeof pathOrSubscriber === "string" ? pathOrSubscriber : "/";
    const subscriber =
      typeof pathOrSubscriber === "function" ? pathOrSubscriber : possibleSubscriber;
    if (subscriber === undefined) throw new TypeError("A subscriber is required");
    const parsed = parsePointer(path);
    if (!parsed.ok) throw new DataModelSubscriptionError(parsed.error.code, path);

    const subscription = { tokens: parsed.value, subscriber };
    this.#subscriptions.add(subscription);
    return () => this.#subscriptions.delete(subscription);
  }

  #readValidated(
    root: JsonValue,
    tokens: readonly string[],
    path: string,
  ): DataModelResult<JsonValue | undefined> {
    let current: JsonValue | undefined = root;
    for (const token of tokens) {
      if (current === null || typeof current !== "object") return success(undefined);
      if (Array.isArray(current)) {
        if (!isArrayIndex(token)) {
          return { ok: false, error: { code: "INVALID_ARRAY_INDEX", path } };
        }
        const index = Number(token);
        if (!Number.isSafeInteger(index)) {
          return { ok: false, error: { code: "ARRAY_INDEX_TOO_LARGE", path, index } };
        }
        if (index >= current.length) return success(undefined);
        current = current[index];
      } else {
        current = Object.prototype.hasOwnProperty.call(current, token) ? current[token] : undefined;
      }
    }
    return success(current);
  }

  #applySet(
    root: JsonValue,
    tokens: readonly string[],
    value: JsonValue,
    path: string,
  ): DataModelResult<void> {
    let current = root;
    for (let position = 0; position < tokens.length; position += 1) {
      const token = tokens[position]!;
      const final = position === tokens.length - 1;
      if (current === null || typeof current !== "object") {
        return { ok: false, error: { code: "TYPE_MISMATCH", path } };
      }

      if (Array.isArray(current)) {
        if (!isArrayIndex(token)) {
          return { ok: false, error: { code: "INVALID_ARRAY_INDEX", path } };
        }
        const index = Number(token);
        if (!Number.isSafeInteger(index) || index > current.length) {
          return { ok: false, error: { code: "ARRAY_INDEX_TOO_LARGE", path, index } };
        }
        if (final) {
          if (index === current.length) current.push(value);
          else current[index] = value;
          return success(undefined);
        }
        if (index === current.length) {
          const container: JsonValue = isArrayIndex(tokens[position + 1]!) ? [] : {};
          current.push(container);
          current = container;
        } else {
          current = current[index]!;
        }
        continue;
      }

      if (final) {
        current[token] = value;
        return success(undefined);
      }
      if (!Object.prototype.hasOwnProperty.call(current, token)) {
        current[token] = isArrayIndex(tokens[position + 1]!) ? [] : {};
      }
      current = current[token]!;
    }
    return success(undefined);
  }

  #applyDelete(
    root: JsonValue,
    tokens: readonly string[],
    path: string,
  ): DataModelResult<boolean> {
    let current = root;
    for (let position = 0; position < tokens.length - 1; position += 1) {
      const token = tokens[position]!;
      if (current === null || typeof current !== "object") return success(false);
      if (Array.isArray(current)) {
        if (!isArrayIndex(token)) {
          return { ok: false, error: { code: "INVALID_ARRAY_INDEX", path } };
        }
        const index = Number(token);
        if (!Number.isSafeInteger(index)) {
          return { ok: false, error: { code: "ARRAY_INDEX_TOO_LARGE", path, index } };
        }
        if (index >= current.length) return success(false);
        current = current[index]!;
      } else {
        if (!Object.prototype.hasOwnProperty.call(current, token)) return success(false);
        current = current[token]!;
      }
    }

    if (current === null || typeof current !== "object") return success(false);
    const target = tokens[tokens.length - 1]!;
    if (Array.isArray(current)) {
      if (!isArrayIndex(target)) {
        return { ok: false, error: { code: "INVALID_ARRAY_INDEX", path } };
      }
      const index = Number(target);
      if (!Number.isSafeInteger(index)) {
        return { ok: false, error: { code: "ARRAY_INDEX_TOO_LARGE", path, index } };
      }
      if (index >= current.length) return success(false);
      return { ok: false, error: { code: "ARRAY_INDEX_DELETE_UNSUPPORTED", path } };
    }
    if (!Object.prototype.hasOwnProperty.call(current, target)) return success(false);
    delete current[target];
    return success(true);
  }

  #change(
    path: string,
    previousValue: JsonValue | undefined,
    value: JsonValue | undefined,
  ): DataModelChange {
    return {
      path,
      previousValue: previousValue === undefined ? undefined : cloneJson(previousValue),
      value: value === undefined ? undefined : cloneJson(value),
    };
  }

  #cloneChange(change: DataModelChange): DataModelChange {
    return this.#change(change.path, change.previousValue, change.value);
  }

  #notify(tokens: readonly string[], beforeState: JsonValue, change: DataModelChange): void {
    for (const subscription of [...this.#subscriptions]) {
      if (!pointersRelated(tokens, subscription.tokens)) continue;
      const before = readTokens(beforeState, subscription.tokens);
      const after = readTokens(this.#state, subscription.tokens);
      if (equalJson(before, after)) continue;
      try {
        subscription.subscriber(
          after === undefined ? undefined : cloneJson(after),
          this.#cloneChange(change),
        );
      } catch {
        // State is committed; subscriber failures are isolated.
      }
    }
  }
}

/** Invalid subscription pointers are programmer errors; mutations use results. */
export class DataModelSubscriptionError extends Error {
  constructor(readonly code: DataModelError["code"], readonly path: string) {
    super(`${code}: ${path}`);
    this.name = "DataModelSubscriptionError";
  }
}

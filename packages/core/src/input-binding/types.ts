import type { DynamicPropertyKind } from "../catalog/index.js";
import type { ResolvedComponentInstance } from "../component-instances/index.js";
import type { JsonValue } from "../protocol/index.js";
import type { InputBindingWriteError } from "./errors.js";

export interface InputBindingWriteRequest {
  surfaceId: string;
  instance: ResolvedComponentInstance;
  property: string;
  value: JsonValue;
}

export interface InputBindingWriteSuccess {
  surfaceId: string;
  sourceComponentId: string;
  property: string;
  path: string;
  value: JsonValue;
}

export type InputBindingWriteResult =
  | { ok: true; value: InputBindingWriteSuccess }
  | { ok: false; error: InputBindingWriteError };

export interface InputBindingTypeMismatchDetails {
  expected: DynamicPropertyKind;
  actual: string;
}

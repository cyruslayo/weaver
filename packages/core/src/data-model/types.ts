import type { JsonValue } from "../protocol/index.js";

export interface DataModelChange {
  /** A2UI pointer for the mutation; `/` denotes the model root. */
  path: string;
  previousValue: JsonValue | undefined;
  value: JsonValue | undefined;
}

export type DataModelSubscriber = (
  value: JsonValue | undefined,
  change: DataModelChange,
) => void;

export type DataModelUnsubscribe = () => void;

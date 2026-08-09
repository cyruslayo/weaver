export type DataContextError =
  | { code: "INVALID_PATH"; path: string }
  | { code: "INVALID_POINTER_ESCAPE"; path: string }
  | { code: "RELATIVE_PATH_OUTSIDE_COLLECTION"; path: string }
  | { code: "COLLECTION_NOT_FOUND"; path: string }
  | { code: "COLLECTION_NOT_ARRAY"; path: string }
  | { code: "INVALID_COLLECTION_INDEX"; index: number }
  | {
      code: "COLLECTION_INDEX_OUT_OF_RANGE";
      path: string;
      index: number;
      length: number;
    };

export type DataContextResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: DataContextError };

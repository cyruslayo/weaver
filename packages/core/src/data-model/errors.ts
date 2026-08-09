export type DataModelError =
  | { code: "INVALID_POINTER"; path: string }
  | { code: "INVALID_POINTER_ESCAPE"; path: string }
  | { code: "TYPE_MISMATCH"; path: string }
  | { code: "INVALID_ARRAY_INDEX"; path: string }
  | { code: "ARRAY_INDEX_TOO_LARGE"; path: string; index: number }
  | { code: "ARRAY_INDEX_DELETE_UNSUPPORTED"; path: string };

export type DataModelResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: DataModelError };

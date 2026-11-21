export interface ValidationIssue {
  code: "VALIDATION_FAILED";
  path: string;
  message: string;
  surfaceId?: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

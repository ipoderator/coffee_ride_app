import { VALIDATION_TERMS } from 'ui';

/**
 * The part of a Zod issue a field line is built from — structural, so a
 * schema's `safeParse` issues pass straight in without `apps/web` importing
 * Zod itself.
 */
export interface ValidationIssue {
  readonly code: string;
  readonly origin?: string;
  readonly minimum?: number | bigint;
  readonly maximum?: number | bigint;
  readonly inclusive?: boolean;
  readonly expected?: string;
  readonly format?: string;
}

const NUMERIC_ORIGINS = new Set(['number', 'int', 'bigint']);
const COLLECTION_ORIGINS = new Set(['array', 'set']);

/**
 * KI-085: the Russian line for one failed check, from the issue's code and
 * bounds — never `issue.message`, which `packages/types` writes in English
 * for the API. `specific` is the field's own wording for a shape rule (a
 * phone, a Telegram handle, two fields that go together) and replaces the
 * generic line for `custom` and `invalid_format` issues only: an empty or
 * too long value still says so.
 */
export function fieldErrorMessage(
  issue: ValidationIssue,
  specific?: string,
): string {
  switch (issue.code) {
    case 'too_small': {
      const min = Number(issue.minimum);
      if (issue.origin === 'string') {
        return min <= 1
          ? VALIDATION_TERMS.required
          : VALIDATION_TERMS.tooShort(min);
      }
      if (NUMERIC_ORIGINS.has(issue.origin ?? '')) {
        if (min === 0) {
          return issue.inclusive === false
            ? VALIDATION_TERMS.positive
            : VALIDATION_TERMS.notNegative;
        }
        return VALIDATION_TERMS.atLeast(min);
      }
      if (COLLECTION_ORIGINS.has(issue.origin ?? '')) {
        return VALIDATION_TERMS.tooFewItems(min);
      }
      return VALIDATION_TERMS.invalid;
    }
    case 'too_big': {
      const max = Number(issue.maximum);
      if (issue.origin === 'string') return VALIDATION_TERMS.tooLong(max);
      if (NUMERIC_ORIGINS.has(issue.origin ?? '')) {
        return VALIDATION_TERMS.atMost(max);
      }
      if (COLLECTION_ORIGINS.has(issue.origin ?? '')) {
        return VALIDATION_TERMS.tooManyItems(max);
      }
      return VALIDATION_TERMS.invalid;
    }
    case 'invalid_type':
      if (issue.expected === 'int') return VALIDATION_TERMS.integer;
      if (NUMERIC_ORIGINS.has(issue.expected ?? '')) {
        return VALIDATION_TERMS.number;
      }
      // A missing value: the form sent nothing where the schema wants one.
      return VALIDATION_TERMS.required;
    case 'invalid_value':
      return VALIDATION_TERMS.choose;
    case 'invalid_format':
      return (
        specific ??
        (issue.format === 'email'
          ? VALIDATION_TERMS.email
          : VALIDATION_TERMS.format)
      );
    case 'custom':
      return specific ?? VALIDATION_TERMS.invalid;
    default:
      return VALIDATION_TERMS.invalid;
  }
}

/**
 * KI-085: a server `validation_error` entry carries only a path and the
 * API's English text — the field's own wording when it has one, otherwise a
 * neutral «проверьте поле». The client runs the same schema first, so this
 * is the rare case of a rule only the server knows.
 */
export function serverFieldErrorMessage(specific?: string): string {
  return specific ?? VALIDATION_TERMS.invalid;
}

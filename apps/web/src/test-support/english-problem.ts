import { expect } from 'vitest';
import type { ProblemDetails } from 'types';
import { ApiError } from '@/lib/api/errors';

/**
 * CR-194: what the API really sends — `application/problem+json` with English
 * `title`/`detail` and (for a failed field) English `errors[].message` copied
 * from `packages/types`. A form must turn all of it into Russian or drop it.
 */
export const ENGLISH_API_TEXTS = {
  title: 'Something went wrong',
  detail: 'The request payload is invalid.',
  field: 'Invalid email address',
  password: 'Password must be at least 12 characters.',
  name: 'Organizer name cannot be empty.',
  comment: 'Comment must be at most 2000 characters.',
} as const;

interface EnglishProblemOptions {
  status?: number;
  /** `errors[]` entries, each carrying the English text an API sends. */
  fields?: readonly string[];
}

/** A rejected API call, worded the way the real API words it (English). */
export function englishProblem(
  code: string,
  { status = 422, fields }: EnglishProblemOptions = {},
): ApiError {
  const problem: ProblemDetails = {
    type: `https://coffee-ride.example/errors/${code}`,
    title: ENGLISH_API_TEXTS.title,
    status,
    detail: ENGLISH_API_TEXTS.detail,
    instance: '/v1/test',
    code,
    ...(fields
      ? {
          errors: fields.map((path) => ({
            path,
            message: ENGLISH_API_TEXTS.field,
          })),
        }
      : {}),
  };
  return new ApiError(problem);
}

/** Nothing the API wrote in English may be anywhere on the screen. */
export function expectNoEnglishApiText(): void {
  const text = document.body.textContent ?? '';
  for (const english of Object.values(ENGLISH_API_TEXTS)) {
    expect(text).not.toContain(english);
  }
}

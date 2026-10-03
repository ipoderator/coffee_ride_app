import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as shared from 'types';
import { fieldErrorMessage, type ValidationIssue } from './field-errors';

/**
 * CR-194 guard rails. `packages/types` and the API speak English to machines
 * (Zod messages, problem+json `detail`/`errors[].message`); `apps/web` must
 * never put any of it in front of a Russian-speaking user. The behaviour is
 * tested form by form; these two tests catch the next form that forgets.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Stories and test support stage English API replies on purpose.
      return ['stories', 'test-support', 'node_modules'].includes(entry.name)
        ? []
        : sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry.name) &&
      !/\.(test|stories)\.(ts|tsx)$/.test(entry.name)
      ? [path]
      : [];
  });
}

function name(path: string): string {
  return relative(SRC, path).split(sep).join('/');
}

const FILES = sourceFiles(SRC).map((path) => ({
  name: name(path),
  text: readFileSync(path, 'utf8'),
}));

/** A line that is a comment says nothing about what renders. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('no English API text reaches a user (CR-194)', () => {
  it('finds the app source it is meant to guard', () => {
    expect(FILES.length).toBeGreaterThan(100);
    expect(
      FILES.some((file) => file.name === 'lib/forms/field-errors.ts'),
    ).toBe(true);
  });

  // `issue.message` is the Zod text from `packages/types`; `problem.detail`,
  // `problem.title` and `errors[].message` are the API's; `error.message` of
  // an `ApiError` is that same `detail`. Forms word the failure themselves
  // (`fieldErrorMessage`, `serverFieldErrorMessage`, `*_TERMS`).
  const FORBIDDEN: Array<[RegExp, string]> = [
    [/\bissues?(\[[^\]]*\])?\??\.message\b/, 'a Zod issue’s message'],
    [/\.problem\??\.(detail|title|message)\b/, 'a problem+json detail/title'],
    [/\b(error|err|cause)\??\.message\b/, 'a caught error’s message'],
    [/\.errors\b[^;{}]*\.message\b/, 'a problem+json errors[] message'],
  ];

  it.each(FORBIDDEN)('no source reads %s', (pattern, what) => {
    const offenders = FILES.filter(
      // `ApiError` itself carries `detail` as its `message` for logs/devtools.
      (file) =>
        file.name !== 'lib/api/errors.ts' && pattern.test(code(file.text)),
    ).map((file) => file.name);
    expect(offenders, `${what} would be shown as-is`).toEqual([]);
  });

  // Native validation bubbles use the browser's own language. Every form
  // validates itself (`noValidate`) and words its lines in Russian instead.
  it('every <form> opts out of native validation bubbles', () => {
    const offenders: string[] = [];
    let forms = 0;
    for (const file of FILES) {
      const text = code(file.text);
      for (const match of text.matchAll(/<form\b/g)) {
        forms += 1;
        // The opening tag's props, up to its first child element.
        const tag = text
          .slice(match.index, match.index + 600)
          .split(/\n\s*</)[0];
        if (!tag?.includes('noValidate')) offenders.push(file.name);
      }
    }
    expect(forms).toBeGreaterThan(8);
    expect(offenders).toEqual([]);
  });

  it('no control carries a native `required`/`pattern` rule', () => {
    const NATIVE_RULE = /^\s*(required|pattern)(=\{?[^\n]*)?$/m;
    const INLINE_RULE =
      /<(input|Input|textarea|Textarea|select|Select)\b[^\n]*\s(required|pattern)(\s|=|\/?>)/;
    const offenders = FILES.filter((file) => {
      const text = code(file.text);
      return NATIVE_RULE.test(text) || INLINE_RULE.test(text);
    }).map((file) => file.name);
    expect(offenders).toEqual([]);
  });
});

describe('every shared schema issue has a Russian line (CR-194)', () => {
  type SafeParser = { safeParse: (input: unknown) => unknown };
  const isSchema = (value: unknown): value is SafeParser =>
    typeof (value as { safeParse?: unknown } | null | undefined)?.safeParse ===
    'function';
  const schemas = Object.entries(shared as Record<string, unknown>).flatMap(
    ([schemaName, value]): Array<[string, SafeParser]> =>
      /Schema$/.test(schemaName) && isSchema(value)
        ? [[schemaName, value]]
        : [],
  );

  // Not valid for anything: the failures a form can meet are the schema's own,
  // not these values'. Field names cover the auth/organizer/ride/review
  // contracts so object schemas fail on their fields, not only on the shape.
  const JUNK: unknown[] = [
    undefined,
    null,
    42,
    'x',
    [],
    {},
    {
      email: 'not an email',
      password: 'x',
      token: '',
      name: '',
      title: '',
      label: '',
      message: '',
      description: 'x'.repeat(5000),
      comment: 'x'.repeat(5000),
      rating: 99,
      lat: 999,
      lng: 999,
      startsAt: 'tomorrow',
      startTimezone: 'Mars/Base',
      bicycleType: 'bmx',
      type: 'nope',
      participantLimit: -3.5,
      priceRub: -1,
      distanceKm: 'far',
      paceKmh: Number.NaN,
      durationMinutes: -1,
      requirements: Array.from({ length: 200 }, () => 'x'),
      contact: { type: 'phone', value: 'abc' },
      position: -1,
      phone: 'abc',
      bio: 'x'.repeat(5000),
    },
  ];

  it('covers a meaningful set of schemas and issue codes', () => {
    expect(schemas.length).toBeGreaterThan(20);
  });

  it('words every issue in Russian, never with the schema’s own text', () => {
    const seenCodes = new Set<string>();
    for (const [schemaName, schema] of schemas) {
      for (const input of JUNK) {
        const result = schema.safeParse(input) as {
          success: boolean;
          error?: { issues: Array<ValidationIssue & { message: string }> };
        };
        if (result.success) continue;
        for (const issue of result.error?.issues ?? []) {
          seenCodes.add(issue.code);
          const line = fieldErrorMessage(issue);
          expect(line, `${schemaName}: ${issue.code}`).toMatch(/[А-Яа-яЁё]/);
          expect(line, `${schemaName}: ${issue.code}`).not.toBe(issue.message);
          expect(line, `${schemaName}: ${issue.code}`).not.toMatch(
            /\b(Invalid|must|cannot|required|expected)\b/i,
          );
        }
      }
    }
    for (const code of [
      'too_small',
      'too_big',
      'invalid_type',
      'invalid_format',
      'invalid_value',
    ]) {
      expect(
        [...seenCodes],
        'the sweep should exercise this issue code',
      ).toContain(code);
    }
  });
});

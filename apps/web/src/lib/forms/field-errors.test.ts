import { describe, expect, it } from 'vitest';
import {
  loginRequestSchema,
  registerRequestSchema,
  updateRideRequestSchema,
} from 'types';
import { fieldErrorMessage, serverFieldErrorMessage } from './field-errors';

const NBSP = ' ';

/** The first issue a real shared schema reports for `field`. */
function issueFor(
  result: { success: boolean; error?: { issues: readonly unknown[] } },
  field: string,
) {
  const issue = result.error?.issues.find(
    (candidate) => (candidate as { path: unknown[] }).path[0] === field,
  );
  if (!issue) throw new Error(`no issue for ${field}`);
  return issue as Parameters<typeof fieldErrorMessage>[0];
}

describe('fieldErrorMessage (KI-085)', () => {
  it('words string bounds from the issue, not the schema’s English text', () => {
    const empty = updateRideRequestSchema.safeParse({ title: '  ' });
    expect(fieldErrorMessage(issueFor(empty, 'title'))).toBe(
      'Заполните это поле.',
    );

    const long = updateRideRequestSchema.safeParse({ title: 'x'.repeat(141) });
    expect(fieldErrorMessage(issueFor(long, 'title'))).toBe(
      'Не длиннее 140 символов.',
    );

    const description = updateRideRequestSchema.safeParse({
      description: 'x'.repeat(2001),
    });
    expect(fieldErrorMessage(issueFor(description, 'description'))).toBe(
      `Не длиннее 2${NBSP}000 символов.`,
    );

    const password = registerRequestSchema.safeParse({
      email: 'a@b.ru',
      password: 'short',
    });
    expect(fieldErrorMessage(issueFor(password, 'password'))).toBe(
      'Не короче 12 символов.',
    );
  });

  it('words numeric bounds and types', () => {
    const negative = updateRideRequestSchema.safeParse({ distanceKm: -1 });
    expect(fieldErrorMessage(issueFor(negative, 'distanceKm'))).toBe(
      'Не может быть меньше нуля.',
    );

    const fraction = updateRideRequestSchema.safeParse({
      participantLimit: 2.5,
    });
    expect(fieldErrorMessage(issueFor(fraction, 'participantLimit'))).toBe(
      'Введите целое число.',
    );

    const notANumber = updateRideRequestSchema.safeParse({ paceKmh: NaN });
    expect(fieldErrorMessage(issueFor(notANumber, 'paceKmh'))).toBe(
      'Введите число.',
    );

    const latitude = updateRideRequestSchema.safeParse({
      startLat: 91,
      startLng: 37,
    });
    expect(fieldErrorMessage(issueFor(latitude, 'startLat'))).toBe(
      'Не больше 90.',
    );

    expect(
      fieldErrorMessage({
        code: 'too_small',
        origin: 'number',
        minimum: 0,
        inclusive: false,
      }),
    ).toBe('Должно быть больше нуля.');
  });

  it('uses a field’s own wording only for shape rules', () => {
    const pair = updateRideRequestSchema.safeParse({ startLat: 55 });
    expect(fieldErrorMessage(issueFor(pair, 'startLng'), 'своё')).toBe('своё');
    expect(fieldErrorMessage(issueFor(pair, 'startLng'))).toBe(
      'Проверьте это поле.',
    );

    const email = loginRequestSchema.safeParse({
      email: 'не почта',
      password: 'x'.repeat(12),
    });
    expect(fieldErrorMessage(issueFor(email, 'email'))).toBe(
      'Введите адрес почты, например name@example.ru.',
    );

    // An empty value still says so, whatever the field's shape rule.
    const empty = updateRideRequestSchema.safeParse({ title: '' });
    expect(fieldErrorMessage(issueFor(empty, 'title'), 'своё')).toBe(
      'Заполните это поле.',
    );

    const choice = updateRideRequestSchema.safeParse({ bicycleType: 'bmx' });
    expect(fieldErrorMessage(issueFor(choice, 'bicycleType'))).toBe(
      'Выберите вариант из списка.',
    );

    const requirements = updateRideRequestSchema.safeParse({
      requirements: Array.from({ length: 30 }, (_, i) => `Пункт ${i}`),
    });
    expect(fieldErrorMessage(issueFor(requirements, 'requirements'))).toMatch(
      /^Не больше \d+ (строки|строк)\.$/,
    );
  });

  it.each([
    [{ code: 'too_small', origin: 'number', minimum: 1 }, 'Не меньше 1.'],
    [
      { code: 'too_small', origin: 'int', minimum: 0n },
      'Не может быть меньше нуля.',
    ],
    [
      { code: 'too_small', origin: 'array', minimum: 2 },
      'Нужно хотя бы 2 значения.',
    ],
    [{ code: 'too_small', origin: 'date', minimum: 0 }, 'Проверьте это поле.'],
    [{ code: 'too_big', origin: 'number', maximum: 5 }, 'Не больше 5.'],
    [{ code: 'too_big', origin: 'set', maximum: 1 }, 'Не больше 1 строки.'],
    [{ code: 'too_big', origin: 'file', maximum: 9 }, 'Проверьте это поле.'],
    [{ code: 'invalid_type', expected: 'string' }, 'Заполните это поле.'],
    [{ code: 'invalid_type', expected: 'bigint' }, 'Введите число.'],
    [
      { code: 'invalid_format', format: 'regex' },
      'Проверьте, как заполнено поле.',
    ],
    [{ code: 'custom' }, 'Проверьте это поле.'],
    [{ code: 'unrecognized_keys' }, 'Проверьте это поле.'],
  ])('words %o', (issue, expected) => {
    expect(fieldErrorMessage(issue)).toBe(expected);
  });

  it('never repeats the API’s English text for a server error', () => {
    expect(serverFieldErrorMessage()).toBe('Проверьте это поле.');
    expect(serverFieldErrorMessage('своё')).toBe('своё');
  });
});

import { describe, expect, it } from 'vitest';
import { registerRequestSchema } from 'types';
import { PASSWORD_MIN_LENGTH, passwordStrength } from './strength';

describe('passwordStrength (CR-262)', () => {
  it('shows nothing for an empty field', () => {
    expect(passwordStrength('')).toBeNull();
  });

  it('uses the same 12-character floor as the API schema', () => {
    const short = 'x'.repeat(PASSWORD_MIN_LENGTH - 1);
    expect(passwordStrength(short)).toBe('too_short');
    expect(
      registerRequestSchema.safeParse({ email: 'a@b.ru', password: short })
        .success,
    ).toBe(false);
    expect(
      registerRequestSchema.safeParse({
        email: 'a@b.ru',
        password: 'x'.repeat(PASSWORD_MIN_LENGTH),
      }).success,
    ).toBe(true);
  });

  it.each([
    ['one repeated character', 'aaaaaaaaaaaa'],
    ['a repeated chunk', 'abcabcabcabc'],
    ['digits only, short of 16', '839201746381'],
    ['the word password', 'Password-2026!'],
    ['a keyboard run', 'qwerty-rider-1'],
    ['Cyrillic «пароль»', 'мойпароль2026'],
  ])('calls %s weak', (_label, password) => {
    expect(passwordStrength(password)).toBe('weak');
  });

  it.each([
    ['mixed, 12–15 characters', 'velo Ride 42x'],
    ['one class but long and varied', 'velosipednayagonka'],
  ])('calls %s good', (_label, password) => {
    expect(passwordStrength(password)).toBe('good');
  });

  it.each([
    ['the mockup example', 'coffee-ride-2026'],
    ['a long Russian phrase', 'утренний заезд у реки'],
  ])('calls %s strong', (_label, password) => {
    expect(passwordStrength(password)).toBe('strong');
  });
});

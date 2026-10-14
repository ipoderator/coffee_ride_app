import { describe, expect, it } from 'vitest';
import { CAPTCHA_ERROR_CODES } from 'types';
import { AUTH_TERMS, CAPTCHA_TERMS } from './terminology';

describe('CAPTCHA_TERMS (CR-261)', () => {
  it('words every reCAPTCHA refusal of the API in Russian', () => {
    for (const code of CAPTCHA_ERROR_CODES) {
      expect(CAPTCHA_TERMS.apiError[code]).toMatch(/[а-яё]/i);
    }
  });

  it('names the check the way Google’s widget does, in «»', () => {
    for (const line of [
      CAPTCHA_TERMS.label,
      CAPTCHA_TERMS.required,
      CAPTCHA_TERMS.expired,
      CAPTCHA_TERMS.loadFailed,
      ...Object.values(CAPTCHA_TERMS.apiError),
    ]) {
      expect(line).toContain('«Я не робот»');
    }
  });

  it('asks for the missing tick the same way on the client and from the API', () => {
    expect(CAPTCHA_TERMS.apiError.captcha_required).toBe(
      CAPTCHA_TERMS.required,
    );
  });
});

describe('AUTH_TERMS confirm password (CR-261)', () => {
  it('labels the second field apart from the first and words the mismatch', () => {
    expect(AUTH_TERMS.confirmPasswordLabel).toBe('Повторите пароль');
    expect(AUTH_TERMS.confirmPasswordLabel).not.toBe(AUTH_TERMS.passwordLabel);
    expect(AUTH_TERMS.passwordsMismatch).toBe('Пароли не совпадают.');
  });
});

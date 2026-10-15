import { describe, expect, it } from 'vitest';
import {
  AUTH_TERMS,
  GOOGLE_SIGN_IN_TERMS,
  PASSWORD_TERMS,
  YANDEX_SIGN_IN_TERMS,
} from './terminology';

// CR-262: `/register` to the auth mockup, and the API's no-enumeration register.
describe('register screen terms (CR-262)', () => {
  it('words the success card so it fits a new and an already-registered email alike', () => {
    const body = AUTH_TERMS.registerSuccessBody('rider@example.ru');
    expect(body).toContain('rider@example.ru');
    expect(body).toContain('Если аккаунт с этим адресом уже есть');
    expect(AUTH_TERMS.registerSuccessTitle).not.toMatch(/создан/i);
    expect(AUTH_TERMS).not.toHaveProperty('emailAlreadyRegistered');
  });

  it('names every strength level in Russian, lower-case after the label', () => {
    for (const level of Object.values(PASSWORD_TERMS.strength)) {
      expect(level).toMatch(/^[а-яё ]+$/);
    }
  });

  it('labels both provider buttons the way the mockup does', () => {
    expect(GOOGLE_SIGN_IN_TERMS.continueButton).toBe('Продолжить с Google');
    expect(YANDEX_SIGN_IN_TERMS.continueButton).toBe('Продолжить с Яндекс ID');
  });

  it('keeps the hint on the same 12-character policy as the schema', () => {
    expect(AUTH_TERMS.passwordHint).toContain('12 символов');
  });
});

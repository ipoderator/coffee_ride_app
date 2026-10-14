import { describe, expect, it } from 'vitest';
import {
  AUTH_TERMS,
  GOOGLE_SIGN_IN_TERMS,
  LOGIN_PAGE_TERMS,
  OAUTH_SIGN_IN_TERMS,
  YANDEX_SIGN_IN_TERMS,
} from './terminology';

// CR-264: `/login` to the auth mockup's «Вход» tab.
describe('login screen terms (CR-264)', () => {
  it('labels both provider buttons the way the mockup does', () => {
    expect(GOOGLE_SIGN_IN_TERMS.button).toBe('Войти через Google');
    expect(YANDEX_SIGN_IN_TERMS.button).toBe('Войти с Яндекс ID');
  });

  it('names the Yandex button by its current label in the retry hints', () => {
    expect(YANDEX_SIGN_IN_TERMS.outcome.expired).toContain(
      `«${YANDEX_SIGN_IN_TERMS.button}»`,
    );
    expect(YANDEX_SIGN_IN_TERMS.outcome.state).toContain(
      `«${YANDEX_SIGN_IN_TERMS.button}»`,
    );
  });

  it('builds the consent line from the shared provider terms', () => {
    expect(
      `${OAUTH_SIGN_IN_TERMS.consentPrefix}${OAUTH_SIGN_IN_TERMS.consentTerms}${OAUTH_SIGN_IN_TERMS.consentJoin}${OAUTH_SIGN_IN_TERMS.consentPrivacy}${OAUTH_SIGN_IN_TERMS.consentEnd}`,
    ).toBe(
      'Продолжая, вы принимаете условия использования и политику конфиденциальности.',
    );
  });

  it('words the page like the mockup', () => {
    expect(AUTH_TERMS.loginTitle).toBe('Вход');
    expect(LOGIN_PAGE_TERMS.divider).toBe('или через email');
    expect(
      `${LOGIN_PAGE_TERMS.switchPrompt} ${LOGIN_PAGE_TERMS.switchLink}`,
    ).toBe('Нет аккаунта? Зарегистрироваться');
    expect(AUTH_TERMS.passwordPlaceholder).toBe('Введите пароль');
  });
});

import { describe, expect, it } from 'vitest';
import {
  AUTH_TERMS,
  GOOGLE_SIGN_IN_TERMS,
  LOGIN_PAGE_TERMS,
  LEGAL_TERMS,
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

  // CR-269 (ADR-041): signing in accepts nothing — the line only names the documents.
  it('names the documents as information, without implying acceptance', () => {
    const line = `${LEGAL_TERMS.infoPrefix}${LEGAL_TERMS.infoTerms}${LEGAL_TERMS.infoJoin}${LEGAL_TERMS.infoPrivacy}${LEGAL_TERMS.infoEnd}`;
    expect(line).toBe(
      'Документы сервиса: условия использования, политика конфиденциальности.',
    );
    expect(line).not.toMatch(/принима/);
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

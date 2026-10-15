import { describe, expect, it } from 'vitest';
import { LEGAL_ERROR_CODES } from 'types';
import {
  LEGAL_CONSENT_TERMS,
  LEGAL_TERMS,
  LEGAL_UPDATE_TERMS,
  OAUTH_SIGNUP_TERMS,
} from './terminology';

// CR-268 (ADR-041): two separate consents, the first-sign-in consent step and
// re-consent.
describe('legal consent terms (CR-268)', () => {
  it('words the two consents as separate first-person statements', () => {
    expect(
      `${LEGAL_CONSENT_TERMS.termsPrefix}${LEGAL_CONSENT_TERMS.termsLink}`,
    ).toBe('Я принимаю условия использования');
    expect(
      `${LEGAL_CONSENT_TERMS.personalDataPrefix}${LEGAL_CONSENT_TERMS.personalDataLink}`,
    ).toBe('Я даю согласие на обработку персональных данных');
    // The consent links its own document, not the privacy policy.
    expect(LEGAL_TERMS.personalDataConsentTitle.toLowerCase()).toBe(
      LEGAL_CONSENT_TERMS.personalDataLink,
    );
  });

  it('gives the privacy h1 a soft hyphen at a correct Russian break only', () => {
    expect(LEGAL_TERMS.privacyHeading.replace('\u00AD', '')).toBe(
      LEGAL_TERMS.privacyTitle,
    );
    expect(LEGAL_TERMS.privacyHeading).toContain('конфиден\u00ADциальности');
  });

  it('asks for one or both boxes by count', () => {
    expect(LEGAL_CONSENT_TERMS.hint(2)).toBe(
      'Отметьте оба согласия, чтобы продолжить.',
    );
    expect(LEGAL_CONSENT_TERMS.hint(1)).toBe(
      'Отметьте согласие, чтобы продолжить.',
    );
  });

  it('has a Russian message for every consent refusal a form can show', () => {
    expect(LEGAL_ERROR_CODES).toContain('consent_required');
    expect(LEGAL_ERROR_CODES).toContain('legal_version_outdated');
    expect(LEGAL_CONSENT_TERMS.consentRequired).toMatch(/[а-яё]/i);
    expect(LEGAL_CONSENT_TERMS.versionOutdated).toMatch(/обновите страницу/i);
  });

  it('names the provider and the address on the consent step', () => {
    expect(
      OAUTH_SIGNUP_TERMS.lead(
        OAUTH_SIGNUP_TERMS.provider.yandex,
        'rider@yandex.ru',
      ),
    ).toBe(
      'Вы входите через Яндекс ID как rider@yandex.ru. Чтобы создать аккаунт Coffee Ride, примите документы.',
    );
  });

  it('tells a person re-accepting what stays open meanwhile', () => {
    expect(LEGAL_UPDATE_TERMS.lead).toMatch(/выйти/);
    expect(LEGAL_UPDATE_TERMS.lead).toMatch(/удаление аккаунта/);
  });
});

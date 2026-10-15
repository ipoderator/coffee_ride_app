import { describe, expect, it } from 'vitest';
import { GOOGLE_SIGN_IN_OUTCOMES, YANDEX_SIGN_IN_OUTCOMES } from 'types';
import {
  AUTH_TERMS,
  GOOGLE_SIGN_IN_TERMS,
  LEGAL_TERMS,
  YANDEX_SIGN_IN_TERMS,
} from './terminology';

describe.each([
  [
    'GOOGLE_SIGN_IN_TERMS (CR-247)',
    GOOGLE_SIGN_IN_TERMS,
    GOOGLE_SIGN_IN_OUTCOMES,
  ],
  [
    'YANDEX_SIGN_IN_TERMS (CR-260)',
    YANDEX_SIGN_IN_TERMS,
    YANDEX_SIGN_IN_OUTCOMES,
  ],
] as const)('%s', (_name, terms, outcomes) => {
  const outcome = terms.outcome as Record<string, string>;

  it('words every callback outcome in Russian', () => {
    for (const key of outcomes) {
      expect(outcome[key]).toMatch(/[а-яё]/i);
    }
  });

  it('names the button the way the retry messages refer to it', () => {
    expect(outcome.expired).toContain(`«${terms.button}»`);
    expect(outcome.state).toContain(`«${terms.button}»`);
  });

  it('says «blocked» exactly as the password login does', () => {
    expect(outcome.blocked).toBe(AUTH_TERMS.accountBlocked);
  });
});

describe('LEGAL_TERMS (CR-269)', () => {
  it('names the documents in the info line by their page titles', () => {
    expect(LEGAL_TERMS.termsTitle.toLowerCase()).toBe(LEGAL_TERMS.infoTerms);
    expect(LEGAL_TERMS.privacyTitle.toLowerCase()).toBe(
      LEGAL_TERMS.infoPrivacy,
    );
  });

  it('words a version line and a history entry with the version and date', () => {
    expect(LEGAL_TERMS.versionLine('1.0', '15 октября 2026 г.')).toBe(
      'Версия 1.0, действует с 15 октября 2026 г.',
    );
    expect(LEGAL_TERMS.historyVersion('1.0', '15 октября 2026 г.')).toBe(
      'Версия 1.0 от 15 октября 2026 г.',
    );
  });
});

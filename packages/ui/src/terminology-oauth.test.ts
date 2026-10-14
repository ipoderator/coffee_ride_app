import { describe, expect, it } from 'vitest';
import { GOOGLE_SIGN_IN_OUTCOMES, YANDEX_SIGN_IN_OUTCOMES } from 'types';
import {
  AUTH_TERMS,
  GOOGLE_SIGN_IN_TERMS,
  LEGAL_TERMS,
  OAUTH_SIGN_IN_TERMS,
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

describe('OAUTH_SIGN_IN_TERMS', () => {
  it('builds the consent line from the legal page names', () => {
    const line = `${OAUTH_SIGN_IN_TERMS.consentPrefix}${OAUTH_SIGN_IN_TERMS.consentTerms}${OAUTH_SIGN_IN_TERMS.consentJoin}${OAUTH_SIGN_IN_TERMS.consentPrivacy}`;
    expect(line).toBe(
      'Продолжая, вы принимаете условия использования и политику конфиденциальности',
    );
    expect(LEGAL_TERMS.termsTitle.toLowerCase()).toBe(
      OAUTH_SIGN_IN_TERMS.consentTerms,
    );
  });
});

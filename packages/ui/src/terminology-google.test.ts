import { describe, expect, it } from 'vitest';
import { GOOGLE_SIGN_IN_OUTCOMES } from 'types';
import { AUTH_TERMS, GOOGLE_SIGN_IN_TERMS, LEGAL_TERMS } from './terminology';

describe('GOOGLE_SIGN_IN_TERMS (CR-247)', () => {
  it('words every callback outcome in Russian', () => {
    for (const outcome of GOOGLE_SIGN_IN_OUTCOMES) {
      expect(GOOGLE_SIGN_IN_TERMS.outcome[outcome]).toMatch(/[а-яё]/i);
    }
  });

  it('names the button the way the retry messages refer to it', () => {
    expect(GOOGLE_SIGN_IN_TERMS.outcome.expired).toContain(
      `«${GOOGLE_SIGN_IN_TERMS.button}»`,
    );
    expect(GOOGLE_SIGN_IN_TERMS.outcome.state).toContain(
      `«${GOOGLE_SIGN_IN_TERMS.button}»`,
    );
  });

  it('says «blocked» exactly as the password login does', () => {
    expect(GOOGLE_SIGN_IN_TERMS.outcome.blocked).toBe(
      AUTH_TERMS.accountBlocked,
    );
  });

  it('builds the consent line from the legal page names', () => {
    const line = `${GOOGLE_SIGN_IN_TERMS.consentPrefix}${GOOGLE_SIGN_IN_TERMS.consentTerms}${GOOGLE_SIGN_IN_TERMS.consentJoin}${GOOGLE_SIGN_IN_TERMS.consentPrivacy}`;
    expect(line).toBe(
      'Продолжая, вы принимаете условия использования и политику конфиденциальности',
    );
    expect(LEGAL_TERMS.termsTitle.toLowerCase()).toBe(
      GOOGLE_SIGN_IN_TERMS.consentTerms,
    );
  });
});

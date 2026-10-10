import { describe, expect, it } from 'vitest';
import { describeAdminCliResult } from './admin-cli-messages.js';

describe('describeAdminCliResult (CR-232)', () => {
  it('exits 0 for a change or a no-op repeat', () => {
    for (const result of [
      'granted',
      'already_admin',
      'revoked',
      'not_admin',
    ] as const) {
      expect(describeAdminCliResult(result).exitCode).toBe(0);
    }
  });

  it('exits non-zero with an explicit message for an unverified email', () => {
    const outcome = describeAdminCliResult('email_not_verified');
    expect(outcome.exitCode).toBe(1);
    expect(outcome.message).toMatch(/not confirmed their email/);
    expect(outcome.message).toMatch(/not granted/);
  });

  it('exits non-zero for an unknown email', () => {
    expect(describeAdminCliResult('user_not_found')).toEqual({
      message: 'No user with this email.',
      exitCode: 1,
    });
  });
});

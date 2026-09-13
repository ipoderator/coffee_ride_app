import { createHash, randomBytes } from 'node:crypto';

// Same pattern as ADR-013's session token: the raw value is handed to the caller
// once (here: the dev-only verification link) and never stored; only its SHA-256
// hash is persisted (`email_verification_tokens.tokenHash`), so a database leak
// alone can't be used to verify anyone's email.
export function generateVerificationToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

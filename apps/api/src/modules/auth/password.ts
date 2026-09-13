import * as argon2 from 'argon2';

// Argon2id (`.claude/rules/security.md`'s preferred choice over bcrypt), default
// parameters — argon2's own defaults already target argon2id at a current-guidance
// cost factor; no manual tuning has a justified reason yet. Never log/return the
// plaintext password or a hash anywhere (`.claude/rules/security.md`).
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  return argon2.verify(hash, password);
}

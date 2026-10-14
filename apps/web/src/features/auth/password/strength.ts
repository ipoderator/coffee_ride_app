/**
 * CR-262: the register form's strength meter. Advisory only — the rule that
 * refuses a password is `registerRequestSchema`'s 12+ characters
 * (`.claude/rules/security.md`: length over forced complexity), checked by the
 * browser and the API alike. This only tells a person how far past that floor
 * they are, without a dictionary dependency: length first, then variety, and a
 * penalty for the obvious (one repeated character, a keyboard/number run, the
 * word «password»).
 */
export const PASSWORD_MIN_LENGTH = 12;

export type PasswordStrength = 'too_short' | 'weak' | 'good' | 'strong';

/** Filled segments of the four-step meter for each level. */
export const STRENGTH_STEPS: Record<PasswordStrength, number> = {
  too_short: 1,
  weak: 2,
  good: 3,
  strong: 4,
};

const OBVIOUS = ['password', 'пароль', 'qwerty', 'йцукен', '123456', 'abcdef'];

function characterClasses(password: string): number {
  return [
    /\p{Ll}/u, // lower-case letter, Latin or Cyrillic
    /\p{Lu}/u,
    /\p{N}/u,
    /[^\p{L}\p{N}]/u, // space, punctuation, symbol
  ].filter((pattern) => pattern.test(password)).length;
}

function isObvious(password: string): boolean {
  const lower = password.toLowerCase();
  const compact = lower.replace(/[^\p{L}\p{N}]/gu, '');
  if (OBVIOUS.some((word) => compact.includes(word))) return true;
  // The same short chunk over and over: «abcabcabcabc», «1111…».
  return /^(.{1,4})\1+$/u.test(compact);
}

/** `null` for an empty field — the meter shows nothing yet. */
export function passwordStrength(password: string): PasswordStrength | null {
  if (password.length === 0) return null;
  if (password.length < PASSWORD_MIN_LENGTH) return 'too_short';

  const unique = new Set(password.toLowerCase()).size;
  const classes = characterClasses(password);
  if (isObvious(password) || unique < 6) return 'weak';
  if (password.length < 16 && classes < 2) return 'weak';

  if (
    (password.length >= 16 && classes >= 2 && unique >= 8) ||
    (password.length >= 20 && unique >= 10)
  ) {
    return 'strong';
  }
  return 'good';
}

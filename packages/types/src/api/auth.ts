import { z } from 'zod';
import type { User } from '../domain/user.js';

// CR-011: the register/verify-email contract, shared so `apps/web`'s client-side
// validation and `apps/api`'s server-side validation are the exact same schema —
// no drift between the two. `.claude/rules/security.md`: minimum password policy
// favors length over forced complexity — 12+ characters, nothing else required.
// CR-261 (ADR-038): the token the reCAPTCHA v2 widget issued. Optional in the
// shape — the API demands it only while `RECAPTCHA_SECRET_KEY` is set, and the
// web forms validate their own fields before a token exists. Bounded so a junk
// body can't make the API forward megabytes to Google.
export const captchaTokenSchema = z.string().min(1).max(10_000);

// The `code`s of the API's reCAPTCHA refusals (ADR-038): no token (`400`), a
// token Google refused or that expired (`400`), Google unreachable (`503`).
export const CAPTCHA_ERROR_CODES = [
  'captcha_required',
  'captcha_invalid',
  'captcha_unavailable',
] as const;
export type CaptchaErrorCode = (typeof CAPTCHA_ERROR_CODES)[number];

export function isCaptchaErrorCode(
  code: string | undefined,
): code is CaptchaErrorCode {
  return (CAPTCHA_ERROR_CODES as readonly string[]).includes(code ?? '');
}

export const registerRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12, 'Password must be at least 12 characters.'),
  // CR-244 (KI-089): the page to return to after verifying and signing in,
  // appended to the emailed verification link. Optional and never a reason to
  // refuse a registration — the API keeps it only if `safeNextPath` accepts it.
  next: z.string().optional(),
  captchaToken: captchaTokenSchema.optional(),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export interface RegisterResponse {
  user: User;
  // Dev-only: the raw email-verification link, returned only outside production
  // (`.claude/rules/security.md` forbids logging the token; ADR-007/notifications
  // is Pending so there is no real delivery channel yet — see the CR-011 plan's
  // scope boundaries). Absent in production responses.
  verificationUrl?: string;
}

export const verifyEmailRequestSchema = z.object({
  token: z.string().min(1),
});
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

export interface VerifyEmailResponse {
  user: User;
}

// CR-012 (`docs/decisions.md` ADR-013). Deliberately no password-length check
// here unlike `registerRequestSchema` — a login attempt against an account
// created before a policy tightened must still be checked against its real
// hash, not rejected by client-side shape before it reaches the service
// layer. `.claude/rules/security.md`: the generic `invalid_credentials`
// error is what actually prevents account enumeration, not request shape.
export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  captchaToken: captchaTokenSchema.optional(),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export interface LoginResponse {
  user: User;
}

export interface MeResponse {
  user: User;
}

// CR-060 (`.claude/rules/security.md`). Deliberately no `email` format
// requirement stricter than register's — the endpoint must behave
// identically whether or not the address belongs to a real account, so there
// is nothing useful to reject beyond "is this shaped like an email."
export const forgotPasswordRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  captchaToken: captchaTokenSchema.optional(),
});
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

// `POST /v1/auth/forgot-password` always returns `204 No Content` — no
// body, so there is nothing that could differ between an existing and a
// non-existent email (`.claude/context/current-task.md`). No response type
// exported for it for that reason.

export const resetPasswordRequestSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(12, 'Password must be at least 12 characters.'),
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export interface ResetPasswordResponse {
  user: User;
}

// CR-247 (ADR-034): Google sign-in. `GET /v1/auth/google/callback` sends a failed
// sign-in back to `/login?oauth=<outcome>` (keeping `next`); the login page shows it.
export const GOOGLE_SIGN_IN_OUTCOMES = [
  // Declined on Google's consent screen.
  'cancelled',
  // The sign-in cookie is missing, expired or forged (took too long, another tab).
  'expired',
  // `state` from Google doesn't match the cookie's.
  'state',
  // Google refused the code or the ID token failed a check.
  'failed',
  // Not configured here, or Google unreachable.
  'unavailable',
  // Google didn't vouch for the email address.
  'email_unverified',
  // An account with this email exists but never confirmed it.
  'account_unverified',
  'blocked',
] as const;
export type GoogleSignInOutcome = (typeof GOOGLE_SIGN_IN_OUTCOMES)[number];

export interface GoogleSignInStatusResponse {
  available: boolean;
}

// CR-260 (ADR-037): Yandex ID sign-in, the same flow and account rules as Google.
// `GET /v1/auth/yandex/callback` sends a failed sign-in back to
// `/login?oauth=<outcome>&provider=yandex` (keeping `next`).
export const YANDEX_SIGN_IN_OUTCOMES = [
  // Declined on Yandex's consent screen.
  'cancelled',
  // The sign-in cookie is missing, expired or forged (took too long, another tab).
  'expired',
  // `state` from Yandex doesn't match the cookie's.
  'state',
  // Yandex refused the code or its profile failed a check.
  'failed',
  // Not configured here, or Yandex unreachable.
  'unavailable',
  // The Yandex account has no email address to sign in with.
  'email_unverified',
  'blocked',
] as const;
export type YandexSignInOutcome = (typeof YANDEX_SIGN_IN_OUTCOMES)[number];

/** `?provider=` on `/login` next to `?oauth=`; absent means Google (CR-247 links). */
export const OAUTH_OUTCOME_PROVIDER_PARAM = 'provider';

export interface YandexSignInStatusResponse {
  available: boolean;
}

import { z } from 'zod';
import type { User } from '../domain/user.js';

// CR-011: the register/verify-email contract, shared so `apps/web`'s client-side
// validation and `apps/api`'s server-side validation are the exact same schema —
// no drift between the two. `.claude/rules/security.md`: minimum password policy
// favors length over forced complexity — 12+ characters, nothing else required.
export const registerRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12, 'Password must be at least 12 characters.'),
  // CR-244 (KI-089): the page to return to after verifying and signing in,
  // appended to the emailed verification link. Optional and never a reason to
  // refuse a registration — the API keeps it only if `safeNextPath` accepts it.
  next: z.string().optional(),
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

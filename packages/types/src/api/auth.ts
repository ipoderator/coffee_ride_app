import { z } from 'zod';
import type { User } from '../domain/user.js';

// CR-011: the register/verify-email contract, shared so `apps/web`'s client-side
// validation and `apps/api`'s server-side validation are the exact same schema —
// no drift between the two. `.claude/rules/security.md`: minimum password policy
// favors length over forced complexity — 12+ characters, nothing else required.
export const registerRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12, 'Password must be at least 12 characters.'),
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

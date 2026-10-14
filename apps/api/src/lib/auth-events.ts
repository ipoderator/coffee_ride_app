import type { FastifyBaseLogger } from 'fastify';

// CR-256 (security audit 1.4). A taken-over account must be traceable: who
// signed in, verified, reset the password or signed out, and when. The request
// logger already carries the `reqId` that ties this line to the request's IP and
// user agent; this line adds the account. Only the opaque user id — never an
// email, a token or a password (`.claude/rules/security.md`, CR-250/CR-251).
// A refused sign-in needs no line of its own: `error-handler.ts` already logs
// every 4xx with its `code` (`invalid_credentials`, `account_rate_limited`).
export type AuthEvent =
  | 'register'
  | 'email_verified'
  | 'login'
  | 'google_sign_in'
  | 'password_reset'
  | 'logout';

export function logAuthEvent(
  log: Pick<FastifyBaseLogger, 'info'>,
  event: AuthEvent,
  userId: string,
): void {
  log.info({ authEvent: event, userId }, 'Auth event');
}

import type { FastifyInstance } from 'fastify';
import type { EmailProvider } from '../lib/email/email-provider.js';
import { UnisenderEmailProvider } from '../lib/email/unisender-provider.js';
import type { Env } from '../env.js';

declare module 'fastify' {
  interface FastifyInstance {
    // `null` when Unisender isn't configured (`UNISENDER_API_KEY`/
    // `EMAIL_FROM_ADDRESS` both optional — ADR-007/CR-100). Auth email-
    // sending producers (`modules/notifications/notifications.service.ts`)
    // treat `null` as "no-op, nothing to send" — same degraded-mode shape
    // as `app.s3`/`app.notificationQueue`, never a boot-time crash.
    emailProvider: EmailProvider | null;
  }
}

// First real consumer of `lib/email/unisender-provider.ts` (CR-100, ADR-007).
// Mirrors `registerS3`'s all-or-nothing gate: both `UNISENDER_API_KEY` and
// `EMAIL_FROM_ADDRESS` must be set to activate a real provider, since a key
// with no verified sender (or vice versa) can never actually send.
export function registerEmail(app: FastifyInstance, env: Env) {
  if (env.UNISENDER_API_KEY && env.EMAIL_FROM_ADDRESS) {
    app.decorate(
      'emailProvider',
      new UnisenderEmailProvider({
        apiKey: env.UNISENDER_API_KEY,
        apiUrl: env.UNISENDER_API_URL,
        fromEmail: env.EMAIL_FROM_ADDRESS,
        fromName: env.EMAIL_FROM_NAME,
      }),
    );
  } else {
    app.decorate('emailProvider', null);
  }
}

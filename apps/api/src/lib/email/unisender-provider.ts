import {
  CircuitBreaker,
  callWithResilience,
  ResilienceError,
} from 'resilience';
import {
  EmailDeliveryError,
  type EmailMessage,
  type EmailProvider,
} from './email-provider.js';

// `.claude/rules/resilience.md`: explicit timeout + circuit breaker for
// every external call. Deliberately NO retry, unlike `route-storage.ts`'s S3
// wrapper (PUT/GET/DELETE by key are idempotent) — a transactional email
// send is not idempotency-safe: a retry after a client-side timeout could
// double-send if the first attempt actually succeeded server-side
// (`.claude/rules/resilience.md` "What NOT to do": don't retry a
// non-idempotent operation). One breaker instance, shared across every call
// this provider makes (constructed once, held on the instance) — not one
// per call.
const TIMEOUT_MS = 8000;
const BREAKER_FAILURE_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 30_000;

export interface UnisenderConfig {
  apiKey: string;
  apiUrl: string;
  fromEmail: string;
  fromName: string;
}

// Only the fields this adapter actually reads — Unisender's real response
// carries more (job_id, emails, etc.), not needed here.
interface UnisenderSendResponse {
  status: string;
  failed_emails?: Record<string, string>;
}

/**
 * Unisender Go transactional email adapter (ADR-007, CR-100). Plain REST via
 * `fetch` — Unisender ships no official Node SDK, same "no vendor SDK, just
 * `fetch`" shape `packages/maps-2gis`'s `provider.ts` uses for 2GIS's
 * Geocoder/Directions REST APIs. Request/response shape verified against the
 * real `django-anymail` Unisender Go backend source (not guessed): `POST
 * {apiUrl}email/send.json`, header `X-API-KEY`, `{ message: { from_email,
 * from_name, subject, body: { html, plaintext }, recipients: [{ email }] } }`;
 * success is `{ status: "success", ... }`.
 */
export class UnisenderEmailProvider implements EmailProvider {
  private readonly breaker = new CircuitBreaker({
    failureThreshold: BREAKER_FAILURE_THRESHOLD,
    cooldownMs: BREAKER_COOLDOWN_MS,
  });

  constructor(private readonly config: UnisenderConfig) {}

  async send(message: EmailMessage): Promise<void> {
    try {
      await callWithResilience((signal) => this.sendOnce(message, signal), {
        timeoutMs: TIMEOUT_MS,
        breaker: this.breaker,
      });
    } catch (error) {
      if (error instanceof ResilienceError) {
        throw new EmailDeliveryError(
          error.code === 'circuit_open'
            ? 'Email delivery is temporarily unavailable (circuit open).'
            : `Email delivery failed: ${error.message}`,
        );
      }
      throw error;
    }
  }

  private async sendOnce(
    message: EmailMessage,
    signal: AbortSignal,
  ): Promise<void> {
    const response = await fetch(`${this.config.apiUrl}email/send.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': this.config.apiKey,
      },
      body: JSON.stringify({
        message: {
          from_email: this.config.fromEmail,
          from_name: this.config.fromName,
          subject: message.subject,
          body: { html: message.html, plaintext: message.text },
          recipients: [{ email: message.to }],
        },
      }),
      signal,
    });

    // `.claude/rules/security.md`: never log a secret. The API key never
    // appears in an error message below — only the response's own status/
    // error fields, which are Unisender's, not ours.
    const body = (await response
      .json()
      .catch(() => null)) as UnisenderSendResponse | null;

    if (!response.ok || body?.status !== 'success') {
      throw new Error(
        `Unisender responded ${response.status} with status "${body?.status ?? 'unknown'}".`,
      );
    }

    if (body.failed_emails && Object.keys(body.failed_emails).length > 0) {
      throw new Error('Unisender rejected the recipient.');
    }
  }
}

import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import {
  CircuitBreaker,
  ResilienceError,
  callWithResilience,
} from 'resilience';
import type { Env } from '../env.js';

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * Single funnel for "an error happened and must be visible"
     * (`.claude/rules/resilience.md`, KI-006/CR-079) — used by both
     * `error-handler.ts`'s unexpected-500 branch and `queue.ts`'s
     * job-failed-after-retries handler, so both mean the same thing.
     */
    reportError(
      error: unknown,
      message: string,
      context?: Record<string, unknown>,
      logger?: FastifyBaseLogger,
    ): void;
  }
}

const WEBHOOK_TIMEOUT_MS = 2000;
const BREAKER_FAILURE_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 30_000;

/**
 * CR-079 (KI-006). Structured logging (the `logger.error` call below) is the
 * always-on mechanism — it alone satisfies "must be visible" with zero
 * external config. The optional webhook forward is a best-effort extra
 * layer for a real external error tracker: no such provider is decided yet
 * (no ADR names one — see `current-task.md`'s Investigation), so this stays
 * a generic sink behind an optional env var rather than a specific vendor
 * SDK, the same "null is a supported degraded mode" shape as S3/Redis
 * (`plugins/s3.ts`, `redis.ts`).
 */
export function registerErrorReporting(app: FastifyInstance, env: Env) {
  const webhookUrl = env.ERROR_REPORTING_WEBHOOK_URL;
  // Shared across every call, not created per call (`.claude/rules/
  // resilience.md`) — a per-call instance could never observe "N
  // consecutive failures".
  const breaker = webhookUrl
    ? new CircuitBreaker({
        failureThreshold: BREAKER_FAILURE_THRESHOLD,
        cooldownMs: BREAKER_COOLDOWN_MS,
      })
    : null;

  app.decorate(
    'reportError',
    (
      error: unknown,
      message: string,
      context: Record<string, unknown> = {},
      logger: FastifyBaseLogger = app.log,
    ) => {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error({ err, ...context, errorReport: true }, message);

      if (!webhookUrl || !breaker) return; // not configured — degraded mode.
      if (!breaker.canAttempt()) return; // open: expected noise during a
      // sustained outage, not worth logging every single call.

      // Fire-and-forget: a degraded/unreachable reporting sink must never
      // block or fail the caller (`.claude/rules/resilience.md`'s "never let
      // an external integration's failure propagate" applies even though
      // this isn't a critical-journey call).
      void callWithResilience(
        async (signal) => {
          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              message: err.message,
              name: err.name,
              stack: err.stack,
              context,
              timestamp: new Date().toISOString(),
            }),
            signal,
          });
          if (!response.ok) {
            throw new Error(
              `Error-reporting webhook responded with status ${response.status}.`,
            );
          }
        },
        { timeoutMs: WEBHOOK_TIMEOUT_MS, breaker },
      ).catch((sendErr: unknown) => {
        if (
          sendErr instanceof ResilienceError &&
          sendErr.code === 'circuit_open'
        ) {
          return;
        }
        logger.warn(
          { err: sendErr },
          'Failed to deliver error report to webhook sink.',
        );
      });
    },
  );
}

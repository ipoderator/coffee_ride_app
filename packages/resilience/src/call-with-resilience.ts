import type { CircuitBreaker } from './circuit-breaker.js';
import { ResilienceError } from './errors.js';

export interface RetryOptions {
  /** Total attempts, including the first — 1 means "no retry". */
  maxAttempts: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export interface ResilientCallOptions {
  timeoutMs: number;
  /** Only for idempotent operations (`.claude/rules/resilience.md`). */
  retries?: RetryOptions;
  /** Shared across every call to the same integration, not created per call. */
  breaker?: CircuitBreaker;
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}

function backoffDelayMs(attempt: number, retries: RetryOptions): number {
  const base = retries.baseDelayMs ?? 200;
  const max = retries.maxDelayMs ?? 2000;
  const exponential = Math.min(max, base * 2 ** (attempt - 1));
  // Full jitter within the upper half of the window, so concurrent retries
  // after a shared failure (e.g. a provider outage) don't all fire at once.
  return exponential / 2 + Math.random() * (exponential / 2);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `operation` with an explicit timeout, an optional bounded retry with
 * backoff, and an optional shared circuit breaker — the three mechanisms
 * `.claude/rules/resilience.md` requires of every external call. `operation`
 * receives the per-attempt `AbortSignal`; both `fetch` and the AWS SDK's
 * `abortSignal` request option accept it unchanged.
 *
 * Every failure mode (timeout, thrown error, exhausted retries, an open
 * breaker) surfaces as one `ResilienceError` — callers normalize that into
 * their own domain error type at the integration boundary.
 */
export async function callWithResilience<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: ResilientCallOptions,
): Promise<T> {
  const { timeoutMs, retries, breaker } = options;
  const maxAttempts = retries?.maxAttempts ?? 1;

  if (breaker && !breaker.canAttempt()) {
    throw new ResilienceError(
      'Circuit breaker is open — call short-circuited.',
      {
        code: 'circuit_open',
      },
    );
  }

  let lastError: unknown;
  let timedOut = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await operation(AbortSignal.timeout(timeoutMs));
      breaker?.recordSuccess();
      return result;
    } catch (error) {
      lastError = error;
      timedOut = isTimeoutError(error);
      if (attempt < maxAttempts) {
        await delay(backoffDelayMs(attempt, retries!));
      }
    }
  }

  breaker?.recordFailure();
  throw new ResilienceError(
    timedOut
      ? `Operation timed out after ${timeoutMs}ms.`
      : 'Operation failed after retries.',
    { cause: lastError, code: timedOut ? 'timeout' : 'exhausted' },
  );
}

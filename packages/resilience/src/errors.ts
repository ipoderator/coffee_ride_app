/**
 * Why a call ultimately failed, after `callWithResilience` has already
 * applied its timeout/retry/circuit-breaker policy. Callers normalize this
 * into their own domain error type (e.g. `MapProviderError`,
 * `RouteStorageError`) — `ResilienceError` itself never crosses a module
 * boundary as the caller-visible error, per `.claude/rules/backend.md`'s
 * "never leak ... internals".
 */
export type ResilienceErrorCode = 'timeout' | 'exhausted' | 'circuit_open';

export class ResilienceError extends Error {
  readonly code: ResilienceErrorCode;

  constructor(
    message: string,
    options: { cause?: unknown; code: ResilienceErrorCode },
  ) {
    super(message, { cause: options.cause });
    this.name = 'ResilienceError';
    this.code = options.code;
  }
}

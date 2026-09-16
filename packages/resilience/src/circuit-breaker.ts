export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  /** Consecutive failures before the breaker trips open. */
  failureThreshold: number;
  /** How long the breaker stays open before allowing one half-open trial call. */
  cooldownMs: number;
}

/**
 * Short-circuits calls to a degraded external dependency so a failing
 * provider doesn't cascade into request pileups/timeouts across the whole
 * API (`.claude/rules/resilience.md`). One instance is shared across every
 * call a given integration makes (e.g. one per `MapProvider`, one per S3
 * client) — it tracks the health of the integration as a whole, not of a
 * single call.
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private openedAt = 0;

  constructor(private readonly options: CircuitBreakerOptions) {}

  /**
   * Call before attempting the underlying operation. Transitions
   * open -> half-open once the cooldown has elapsed, allowing exactly one
   * trial call through; every other call while open is rejected without
   * reaching the network.
   */
  canAttempt(): boolean {
    if (this.state !== 'open') return true;
    if (Date.now() - this.openedAt < this.options.cooldownMs) return false;
    this.state = 'half-open';
    return true;
  }

  recordSuccess(): void {
    this.state = 'closed';
    this.consecutiveFailures = 0;
  }

  recordFailure(): void {
    this.consecutiveFailures += 1;
    // A half-open trial failing re-opens immediately, regardless of the
    // threshold — one failure is enough to know the provider isn't recovered.
    if (
      this.state === 'half-open' ||
      this.consecutiveFailures >= this.options.failureThreshold
    ) {
      this.state = 'open';
      this.openedAt = Date.now();
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

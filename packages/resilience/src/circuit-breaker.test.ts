import { describe, expect, it, vi } from 'vitest';
import { CircuitBreaker } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  it('starts closed and allows calls', () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 3,
      cooldownMs: 1000,
    });
    expect(breaker.getState()).toBe('closed');
    expect(breaker.canAttempt()).toBe(true);
  });

  it('stays closed on failures below the threshold', () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 3,
      cooldownMs: 1000,
    });
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe('closed');
    expect(breaker.canAttempt()).toBe(true);
  });

  it('trips open once consecutive failures reach the threshold', () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 3,
      cooldownMs: 1000,
    });
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe('open');
    expect(breaker.canAttempt()).toBe(false);
  });

  it('a success resets the consecutive-failure count', () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 3,
      cooldownMs: 1000,
    });
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordSuccess();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe('closed');
  });

  it('moves to half-open and allows exactly one trial call after the cooldown', () => {
    vi.useFakeTimers();
    try {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        cooldownMs: 1000,
      });
      breaker.recordFailure();
      expect(breaker.canAttempt()).toBe(false);

      vi.advanceTimersByTime(1000);
      expect(breaker.canAttempt()).toBe(true);
      expect(breaker.getState()).toBe('half-open');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a half-open trial success closes the breaker', () => {
    vi.useFakeTimers();
    try {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        cooldownMs: 1000,
      });
      breaker.recordFailure();
      vi.advanceTimersByTime(1000);
      breaker.canAttempt();
      breaker.recordSuccess();
      expect(breaker.getState()).toBe('closed');
      expect(breaker.canAttempt()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a half-open trial failure re-opens immediately, restarting the cooldown', () => {
    vi.useFakeTimers();
    try {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        cooldownMs: 1000,
      });
      breaker.recordFailure();
      vi.advanceTimersByTime(1000);
      breaker.canAttempt();
      breaker.recordFailure();
      expect(breaker.getState()).toBe('open');
      expect(breaker.canAttempt()).toBe(false);

      vi.advanceTimersByTime(999);
      expect(breaker.canAttempt()).toBe(false);
      vi.advanceTimersByTime(1);
      expect(breaker.canAttempt()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

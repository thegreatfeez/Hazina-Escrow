import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker, CircuitBreakerOpenError, getCircuitBreaker } from '../circuit-breaker';

// ── Helpers ──────────────────────────────────────────────────────────────────

const ok =
  <T>(value: T) =>
  () =>
    Promise.resolve(value);
const fail =
  (msg = 'boom') =>
  () =>
    Promise.reject(new Error(msg));

function makeBreaker(opts?: ConstructorParameters<typeof CircuitBreaker>[1]) {
  // Use a unique name per test to avoid shared-registry bleed
  return new CircuitBreaker(`test-${Math.random()}`, opts);
}

// ── CLOSED state ─────────────────────────────────────────────────────────────

describe('CircuitBreaker — CLOSED state', () => {
  it('starts CLOSED', () => {
    expect(makeBreaker().getState()).toBe('CLOSED');
  });

  it('passes through a successful call', async () => {
    const cb = makeBreaker();
    await expect(cb.execute(ok(42))).resolves.toBe(42);
  });

  it('re-throws errors without opening below the threshold', async () => {
    const cb = makeBreaker({ failureThreshold: 3 });
    await expect(cb.execute(fail())).rejects.toThrow('boom');
    await expect(cb.execute(fail())).rejects.toThrow('boom');
    expect(cb.getState()).toBe('CLOSED');
  });

  it('opens when failures reach the threshold', async () => {
    const cb = makeBreaker({ failureThreshold: 2 });
    await cb.execute(fail()).catch(() => {});
    await cb.execute(fail()).catch(() => {});
    expect(cb.getState()).toBe('OPEN');
  });

  it('resets the failure count after a success', async () => {
    const cb = makeBreaker({ failureThreshold: 3 });
    await cb.execute(fail()).catch(() => {});
    await cb.execute(fail()).catch(() => {});
    await cb.execute(ok('good')); // resets counter
    await cb.execute(fail()).catch(() => {});
    // Only 1 failure after reset — should still be CLOSED
    expect(cb.getState()).toBe('CLOSED');
  });
});

// ── OPEN state ───────────────────────────────────────────────────────────────

describe('CircuitBreaker — OPEN state', () => {
  it('throws CircuitBreakerOpenError without calling fn', async () => {
    const cb = makeBreaker({ failureThreshold: 1 });
    await cb.execute(fail()).catch(() => {});
    expect(cb.getState()).toBe('OPEN');

    const spy = vi.fn(ok('should-not-run'));
    await expect(cb.execute(spy)).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    expect(spy).not.toHaveBeenCalled();
  });
});

// ── HALF_OPEN state ───────────────────────────────────────────────────────────

describe('CircuitBreaker — HALF_OPEN state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('transitions to HALF_OPEN after resetTimeoutMs', async () => {
    const cb = makeBreaker({ failureThreshold: 1, resetTimeoutMs: 1_000 });
    await cb.execute(fail()).catch(() => {});
    expect(cb.getState()).toBe('OPEN');

    vi.advanceTimersByTime(1_001);
    // A call is needed to trigger the internal check
    await cb.execute(ok('probe')).catch(() => {});
    // Successful probe closes it
    expect(cb.getState()).toBe('CLOSED');
  });

  it('closes the circuit when the probe succeeds', async () => {
    const cb = makeBreaker({ failureThreshold: 1, resetTimeoutMs: 500 });
    await cb.execute(fail()).catch(() => {});
    vi.advanceTimersByTime(600);
    await cb.execute(ok('recovered'));
    expect(cb.getState()).toBe('CLOSED');
  });

  it('re-opens the circuit when the probe fails', async () => {
    const cb = makeBreaker({ failureThreshold: 1, resetTimeoutMs: 500 });
    await cb.execute(fail()).catch(() => {});
    vi.advanceTimersByTime(600);
    await cb.execute(fail()).catch(() => {});
    expect(cb.getState()).toBe('OPEN');
  });
});

// ── Manual reset ─────────────────────────────────────────────────────────────

describe('CircuitBreaker — reset()', () => {
  it('restores CLOSED state from OPEN', async () => {
    const cb = makeBreaker({ failureThreshold: 1 });
    await cb.execute(fail()).catch(() => {});
    expect(cb.getState()).toBe('OPEN');
    cb.reset();
    expect(cb.getState()).toBe('CLOSED');
  });

  it('allows calls to succeed after reset', async () => {
    const cb = makeBreaker({ failureThreshold: 1 });
    await cb.execute(fail()).catch(() => {});
    cb.reset();
    await expect(cb.execute(ok('back'))).resolves.toBe('back');
  });
});

// ── onStateChange callback ────────────────────────────────────────────────────

describe('CircuitBreaker — onStateChange', () => {
  it('fires on CLOSED → OPEN transition', async () => {
    const spy = vi.fn();
    const cb = makeBreaker({ failureThreshold: 1, onStateChange: spy });
    await cb.execute(fail()).catch(() => {});
    expect(spy).toHaveBeenCalledWith(expect.any(String), 'CLOSED', 'OPEN');
  });
});

// ── Registry ─────────────────────────────────────────────────────────────────

describe('getCircuitBreaker registry', () => {
  it('returns the same instance for the same name', () => {
    const a = getCircuitBreaker('shared-name-test');
    const b = getCircuitBreaker('shared-name-test');
    expect(a).toBe(b);
  });

  it('returns different instances for different names', () => {
    const a = getCircuitBreaker('svc-a');
    const b = getCircuitBreaker('svc-b');
    expect(a).not.toBe(b);
  });
});

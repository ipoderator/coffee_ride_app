import type { FastifyInstance } from 'fastify';

const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const;
type ShutdownSignal = (typeof SHUTDOWN_SIGNALS)[number];

// Defense in depth beyond queue.ts's own bounded onClose hook (3000ms) —
// covers any current/future onClose hook (e.g. db.ts's postgres.js pool
// `.end()`) that isn't individually timeout-bounded, so a degraded
// dependency at shutdown time can never hang the process indefinitely.
const FORCE_EXIT_TIMEOUT_MS = 10_000;

export interface GracefulShutdownDeps {
  // Subset of `process` actually used — injectable so tests can trigger a
  // "signal" without sending a real OS signal to the test process.
  signals: Pick<NodeJS.Process, 'on'>;
  exit: (code: number) => void;
}

const defaultDeps: GracefulShutdownDeps = {
  signals: process,
  exit: (code) => process.exit(code),
};

/**
 * KI-048/CR-094: nothing previously called `app.close()` on SIGTERM/SIGINT,
 * so `queue.ts`'s onClose hook (worker/producer disconnect) and `db.ts`'s
 * pool close never ran on a real `docker stop`/orchestrator shutdown.
 */
export function registerGracefulShutdown(
  app: FastifyInstance,
  deps: GracefulShutdownDeps = defaultDeps,
): void {
  let shuttingDown = false;

  const handleSignal = (signal: ShutdownSignal) => {
    if (shuttingDown) {
      // Second signal mid-shutdown — the operator wants out now, don't make
      // them wait on a graceful close that may itself be stuck.
      app.log.warn(
        { signal },
        'Received shutdown signal again while already shutting down; forcing exit.',
      );
      deps.exit(1);
      return;
    }
    shuttingDown = true;
    app.log.info({ signal }, 'Received shutdown signal, closing gracefully.');

    const forceExitTimer = setTimeout(() => {
      app.log.error(
        { timeoutMs: FORCE_EXIT_TIMEOUT_MS },
        'Graceful shutdown did not complete in time; forcing exit.',
      );
      deps.exit(1);
    }, FORCE_EXIT_TIMEOUT_MS);
    // Never keeps the process alive on its own — only matters while a real
    // shutdown is already in flight.
    forceExitTimer.unref();

    app.close().then(
      () => {
        clearTimeout(forceExitTimer);
        deps.exit(0);
      },
      (err: unknown) => {
        clearTimeout(forceExitTimer);
        app.log.error({ err }, 'Error during graceful shutdown.');
        deps.exit(1);
      },
    );
  };

  for (const signal of SHUTDOWN_SIGNALS) {
    deps.signals.on(signal, () => handleSignal(signal));
  }
}

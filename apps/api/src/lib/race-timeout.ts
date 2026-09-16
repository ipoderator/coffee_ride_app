// Shared by any caller whose underlying operation does not honor an
// `AbortSignal` (BullMQ's `Queue.add()`/`Worker.close()` — `modules/
// notifications/queue.ts`; a raw DB/Redis ping — `routes/health.ts`).
// `packages/resilience`'s `callWithResilience` only bounds an operation that
// itself reacts to the signal it's handed (`fetch`, the AWS SDK's
// `abortSignal` option) — for everything else, a real `Promise.race` against
// a plain timer is the only mechanism that actually bounds it. The original
// operation keeps running in the background after a timeout; nothing awaits
// it once this has already rejected.
export function raceTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = `Operation timed out after ${ms}ms.`,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

import { describe, expect, it, vi } from 'vitest';
import type { DbClient } from 'db';
import type { EmailProvider } from '../../lib/email/email-provider.js';
import {
  NotificationQueueUnavailableError,
  createRegistrationConfirmedNotification,
  notifyRideCancelled,
  processNotificationJob,
  sendAccountExistsEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  type NotificationQueue,
} from './notifications.service.js';

// KI-071: what each producer does when a configured queue rejects. No
// database needed — the direct-delivery path only calls
// `insert().values()` / `select().from().where()`, faked here; the real
// inserts are covered with Postgres by `degraded-dependencies.test.ts`.
function fakeDb(activeRegistrants: Array<{ userId: string }> = []) {
  const inserted: unknown[] = [];
  const db = {
    insert: vi.fn(() => ({
      values: vi.fn(async (values: unknown) => {
        inserted.push(values);
      }),
    })),
    select: vi.fn(() => ({
      from: () => ({ where: async () => activeRegistrants }),
    })),
  };
  return { db: db as unknown as DbClient, inserted };
}

function rejectingQueue(err: Error): NotificationQueue {
  return { add: vi.fn().mockRejectedValue(err) };
}

const unavailable = () =>
  new NotificationQueueUnavailableError('Redis not connected');
const logger = () => ({ error: vi.fn() });
const emailProvider = () => ({
  send: vi.fn<EmailProvider['send']>().mockResolvedValue(undefined),
});

describe('notification producers while the queue is down (KI-071)', () => {
  it('inserts the registration confirmation directly when the job never reached Redis', async () => {
    const { db, inserted } = fakeDb();
    const log = logger();

    await createRegistrationConfirmedNotification(
      db,
      log,
      rejectingQueue(unavailable()),
      'u1',
      'r1',
    );

    expect(inserted).toEqual([
      { userId: 'u1', rideId: 'r1', type: 'registration_confirmed' },
    ]);
    expect(log.error).not.toHaveBeenCalled();
  });

  it('does not insert when the enqueue failed after reaching Redis (duplicate risk)', async () => {
    const { db, inserted } = fakeDb();
    const log = logger();

    await createRegistrationConfirmedNotification(
      db,
      log,
      rejectingQueue(new Error('Notification enqueue timed out after 1500ms.')),
      'u1',
      'r1',
    );

    expect(inserted).toEqual([]);
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it('fans a cancellation out to active registrants directly', async () => {
    const { db, inserted } = fakeDb([{ userId: 'u1' }, { userId: 'u2' }]);

    await notifyRideCancelled(
      db,
      logger(),
      rejectingQueue(unavailable()),
      'r1',
    );

    expect(inserted).toEqual([
      [
        {
          userId: 'u1',
          rideId: 'r1',
          rideUpdateId: null,
          type: 'ride_cancelled',
        },
        {
          userId: 'u2',
          rideId: 'r1',
          rideUpdateId: null,
          type: 'ride_cancelled',
        },
      ],
    ]);
  });

  it('logs and swallows a failing direct insert', async () => {
    const { db } = fakeDb();
    (db.insert as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      values: vi.fn().mockRejectedValue(new Error('db down')),
    }));
    const log = logger();

    await expect(
      createRegistrationConfirmedNotification(
        db,
        log,
        rejectingQueue(unavailable()),
        'u1',
        'r1',
      ),
    ).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it('sends the verification email directly', async () => {
    const provider = emailProvider();

    await sendVerificationEmail(
      logger(),
      rejectingQueue(unavailable()),
      provider,
      'rider@example.com',
      'https://example.com/verify-email?token=t',
    );

    expect(provider.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'rider@example.com' }),
    );
  });

  it('never sends the password-reset email directly (no timing oracle)', async () => {
    const provider = emailProvider();
    const log = logger();

    await sendPasswordResetEmail(
      log,
      rejectingQueue(unavailable()),
      provider,
      'rider@example.com',
      'https://example.com/reset-password?token=t',
    );

    expect(provider.send).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it('does not wait on the provider for the password-reset email with no queue', async () => {
    let finishSend!: () => void;
    const provider = {
      send: vi.fn(() => new Promise<void>((resolve) => (finishSend = resolve))),
    };

    await sendPasswordResetEmail(
      logger(),
      null,
      provider,
      'rider@example.com',
      'https://example.com/reset-password?token=t',
    );

    // Resolved while the provider call is still pending.
    expect(provider.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'rider@example.com' }),
    );
    finishSend();
  });

  it('logs a failed unqueued password-reset send instead of throwing', async () => {
    const log = logger();
    const provider = {
      send: vi.fn(() => Promise.reject(new Error('provider down'))),
    };

    await sendPasswordResetEmail(
      log,
      null,
      provider,
      'rider@example.com',
      'https://example.com/reset-password?token=t',
    );
    await vi.waitFor(() => expect(log.error).toHaveBeenCalledTimes(1));
  });
});

// CR-262 (ADR-039): `/register` with a taken email notifies the owner instead.
describe('account-exists email', () => {
  it('is sent directly while the queue is down, like the verification email', async () => {
    const provider = emailProvider();

    await sendAccountExistsEmail(
      logger(),
      rejectingQueue(unavailable()),
      provider,
      'rider@example.com',
      'https://example.com/login?next=%2Fme',
      'https://example.com/forgot-password',
    );

    expect(provider.send).toHaveBeenCalledTimes(1);
    const message = provider.send.mock.calls[0]![0];
    expect(message.to).toBe('rider@example.com');
    expect(message.subject).toBe('Аккаунт уже есть — Coffee Ride');
    expect(message.text).toContain('https://example.com/login?next=%2Fme');
    expect(message.text).toContain('https://example.com/forgot-password');
  });

  it('is what the worker sends for an account_exists_email job', async () => {
    const provider = emailProvider();

    await processNotificationJob(
      {} as DbClient,
      provider,
      'account_exists_email',
      {
        email: 'rider@example.com',
        loginUrl: 'https://example.com/login',
        forgotPasswordUrl: 'https://example.com/forgot-password',
      },
    );

    expect(provider.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'rider@example.com',
        subject: 'Аккаунт уже есть — Coffee Ride',
      }),
    );
  });

  it('logs a failed send without the address and never throws', async () => {
    const log = logger();
    const provider = {
      send: vi.fn<EmailProvider['send']>().mockRejectedValue(new Error('down')),
    };

    await sendAccountExistsEmail(
      log,
      null,
      provider,
      'rider@example.com',
      'https://example.com/login',
      'https://example.com/forgot-password',
    );

    expect(log.error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.error.mock.calls)).not.toContain(
      'rider@example.com',
    );
  });
});

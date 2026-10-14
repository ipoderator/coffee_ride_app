import { describe, expect, it, vi } from 'vitest';
import { logAuthEvent } from './auth-events.js';

describe('logAuthEvent (CR-256)', () => {
  it('logs the event and the user id only', () => {
    const log = { info: vi.fn() };

    logAuthEvent(log, 'login', 'user-1');

    expect(log.info).toHaveBeenCalledWith(
      { authEvent: 'login', userId: 'user-1' },
      'Auth event',
    );
  });

  it('carries the request id when given one (CR-260)', () => {
    const log = { info: vi.fn() };

    logAuthEvent(log, 'yandex_sign_in', 'user-1', 'req-1');

    expect(log.info).toHaveBeenCalledWith(
      { authEvent: 'yandex_sign_in', userId: 'user-1', reqId: 'req-1' },
      'Auth event',
    );
  });
});

import { describe, expect, it } from 'vitest';
import { STRAVA_SYNC_OUTCOMES } from 'types';
import { FINISH_CHECKIN_TERMS, STRAVA_SYNC_TERMS } from './terminology';

describe('STRAVA_SYNC_TERMS (CR-234)', () => {
  it('labels every sync outcome in Russian', () => {
    for (const outcome of STRAVA_SYNC_OUTCOMES) {
      expect(STRAVA_SYNC_TERMS.outcome[outcome]).toMatch(/[а-яё]/i);
    }
  });

  it('promises the organizer sees only the mark', () => {
    expect(STRAVA_SYNC_TERMS.syncHint).toContain('только отметку');
    expect(STRAVA_SYNC_TERMS.syncHint).toContain(
      STRAVA_SYNC_TERMS.verifiedTitle,
    );
  });

  it('tells a cancel apart from a refused permission (QA)', () => {
    expect(STRAVA_SYNC_TERMS.outcome.cancelled).toBe(
      'Подключение Strava отменено',
    );
    expect(STRAVA_SYNC_TERMS.outcome.denied).not.toBe(
      STRAVA_SYNC_TERMS.outcome.cancelled,
    );
  });

  it('says the Strava access is one-shot, on the first visit and on a retry', () => {
    expect(STRAVA_SYNC_TERMS.syncHint).toContain('на одну проверку');
    expect(STRAVA_SYNC_TERMS.retryHint).toContain('снова спросит разрешение');
  });

  it('reuses the finish check-in wording for an organizer decision', () => {
    expect(STRAVA_SYNC_TERMS.outcome.already_decided).toBe(
      FINISH_CHECKIN_TERMS.alreadyDecided,
    );
  });
});

import { adminActionTypeValues } from 'types';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_TERMS as T,
  AUTH_TERMS,
  RIDE_WORKSPACE_TERMS,
} from './terminology';

describe('ADMIN_TERMS (CR-231, ADR-032)', () => {
  it('labels every admin action in the log', () => {
    for (const action of adminActionTypeValues) {
      expect(T.actionLabels[action]).toMatch(/\S/);
    }
  });

  it('builds the reason, rating and ride lines', () => {
    expect(T.reasonLine('Спам')).toBe('Причина: Спам');
    expect(T.ratingLabel(4)).toBe('Оценка 4 из 5');
    expect(T.reviewOnRide('Утренний гревел')).toBe(
      'К заезду «Утренний гревел»',
    );
  });

  it('does not promise privacy where the organizer sees the reason (CR-232)', () => {
    expect(T.reasonHintOrganizerVisible).toMatch(/организатор/);
    expect(T.reasonHintOrganizerVisible).not.toMatch(/только вы/);
    expect(T.reasonHintLogOnly).toMatch(/журнале/);
    expect(T.reasonHintLogOnly).not.toMatch(/организатор/);
  });

  it('builds the overview and log lines (CR-232)', () => {
    expect(T.servicesUpdatedAt('10 октября, 14:05:07')).toBe(
      'Обновлено 10 октября, 14:05:07',
    );
    expect(T.metricOpenList('Отзывы', 'Скрыты', '3')).toBe(
      'Отзывы, скрыты: 3. Открыть список',
    );
    expect(T.targetMissingWithId('3f2a')).toBe('Запись удалена · ID 3f2a');
    expect(Object.keys(T.targetTypeFilters)).toEqual([
      'any',
      'user',
      'ride',
      'review',
    ]);
  });

  it('excerpts a review for the hide dialog (CR-232)', () => {
    expect(T.reviewExcerpt(null)).toBe(T.noComment);
    expect(T.reviewExcerpt('  \n ')).toBe(T.noComment);
    expect(T.reviewExcerpt('Хороший\n\nзаезд')).toBe('Хороший заезд');
    expect(T.reviewExcerpt('абвгд', 5)).toBe('абвгд');
    expect(T.reviewExcerpt('абв где', 5)).toBe('абв…');
    expect(T.reviewExcerpt('😀😀😀😀😀😀', 4)).toBe('😀😀😀…');
  });

  it('reports revoked sessions, saying so when there were none', () => {
    expect(T.revokeSessionsDone(0)).toBe('Активных сессий не было.');
    expect(T.revokeSessionsDone(3)).toBe('Завершено сессий: 3.');
  });

  it('pairs each service status with a tone', () => {
    expect(T.serviceStatus.error).toEqual({ label: 'Ошибка', tone: 'danger' });
    expect(T.serviceStatus.not_configured.tone).toBe('neutral');
  });

  it('tells a blocked account apart from wrong credentials', () => {
    expect(AUTH_TERMS.accountBlocked).not.toBe(AUTH_TERMS.invalidCredentials);
  });

  it('tells the organizer their ride was hidden by an admin', () => {
    expect(RIDE_WORKSPACE_TERMS.hiddenByAdminTitle).toBe(
      'Заезд скрыт администратором',
    );
    expect(RIDE_WORKSPACE_TERMS.hiddenByAdminBody).toMatch(/записаться нельзя/);
    expect(RIDE_WORKSPACE_TERMS.hiddenByAdminReason('Реклама')).toBe(
      'Причина: Реклама',
    );
  });
});

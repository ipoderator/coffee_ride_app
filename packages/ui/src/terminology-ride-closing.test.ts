import { describe, expect, it } from 'vitest';
import {
  FINISH_CHECKIN_TERMS,
  ORGANIZER_LIVE_TERMS,
  PARTICIPANT_HOME_TERMS,
  RIDE_EDIT_TERMS,
} from './terminology';

// CR-181..CR-185: the finish check-in, ride closing and live-ride templates.

describe('FINISH_CHECKIN_TERMS', () => {
  it('agrees the undecided-rider count in every finish message', () => {
    expect(FINISH_CHECKIN_TERMS.unresolvedBeforeFinish(1)).toMatch(
      /^У 1 участника нет итогового статуса\./,
    );
    expect(FINISH_CHECKIN_TERMS.finishConfirmUnresolved(2)).toMatch(
      /^У 2 участников нет итогового статуса — /,
    );
    expect(FINISH_CHECKIN_TERMS.finishConfirmUnresolved(21)).toMatch(
      /^У 21 участника /,
    );
    expect(FINISH_CHECKIN_TERMS.finishedWithUnresolved(5)).toBe(
      'Заезд завершён, но у 5 участников нет итогового статуса. Отметьте их на странице «Участники».',
    );
  });

  it('fills the organizer panel and row labels', () => {
    expect(FINISH_CHECKIN_TERMS.summary(3, 2, 1, 0)).toBe(
      'Финишировали: 3 · Заявили финиш: 2 · Сошли: 1 · Не пришли: 0',
    );
    expect(FINISH_CHECKIN_TERMS.confirmAll(4)).toBe(
      'Подтвердить всех заявивших (4)',
    );
    expect(FINISH_CHECKIN_TERMS.confirmAllSuccess(1)).toBe(
      'Подтверждено: 1 участник',
    );
    expect(FINISH_CHECKIN_TERMS.confirmAllSuccess(3)).toBe(
      'Подтверждено: 3 участника',
    );
    expect(FINISH_CHECKIN_TERMS.rowActionsLabel('Анна К.')).toBe(
      'Финиш: Анна К.',
    );
  });

  it('fills the public results summary', () => {
    expect(FINISH_CHECKIN_TERMS.resultsLine(8, 10)).toBe(
      'Финишировали: 8 из 10',
    );
    expect(FINISH_CHECKIN_TERMS.resultsDnf(1)).toBe('Сошли: 1');
    expect(FINISH_CHECKIN_TERMS.resultsNoShow(1)).toBe('Не пришли: 1');
    expect(FINISH_CHECKIN_TERMS.resultsUnresolved(2)).toBe(
      'Не подтверждено: 2 — итоги ещё не закрыты',
    );
  });
});

describe('ORGANIZER_LIVE_TERMS', () => {
  it('keeps the live count on one line and agrees participant counts', () => {
    expect(ORGANIZER_LIVE_TERMS.liveCount(2)).toBe('2 идёт');
    expect(ORGANIZER_LIVE_TERMS.participantsCount(1)).toBe('1 участник');
    expect(ORGANIZER_LIVE_TERMS.participantsCount(12)).toBe('12 участников');
    expect(ORGANIZER_LIVE_TERMS.moreWithoutStatus(2)).toMatch(
      /^Ещё 2 участника без итогового статуса/,
    );
  });

  it('fills the finish-control and row lines', () => {
    expect(ORGANIZER_LIVE_TERMS.confirmedOf(3, 10)).toBe(
      '3 из 10 подтверждены',
    );
    expect(ORGANIZER_LIVE_TERMS.resolvedOf(4, 10)).toBe(
      'Итоговый статус у 4 из 10',
    );
    expect(ORGANIZER_LIVE_TERMS.claimedAt('09:41')).toBe(
      'отметил финиш · 09:41',
    );
    expect(ORGANIZER_LIVE_TERMS.overdueStart('сб, 4 окт., 09:00')).toBe(
      'Старт был сб, 4 окт., 09:00 · заезд не начат',
    );
  });

  it('states seats left only when the ride has a limit, never below zero', () => {
    expect(ORGANIZER_LIVE_TERMS.upcomingRegistered(5, null)).toBe(
      '5 записались',
    );
    expect(ORGANIZER_LIVE_TERMS.upcomingRegistered(5, 12)).toBe(
      '5 записались · мест осталось 7',
    );
    expect(ORGANIZER_LIVE_TERMS.upcomingRegistered(14, 12)).toBe(
      '14 записались · мест осталось 0',
    );
  });
});

describe('RIDE_EDIT_TERMS / PARTICIPANT_HOME_TERMS', () => {
  it('names the passed start and the organizer profile', () => {
    expect(RIDE_EDIT_TERMS.overdueStart('вчера, 09:00')).toMatch(
      /^Время старта прошло \(вчера, 09:00\), а заезд не начат\./,
    );
    expect(PARTICIPANT_HOME_TERMS.organizerDescription('Гравий')).toBe(
      'Вы организуете заезды как «Гравий». Заезды, участники и обновления — в кабинете.',
    );
  });
});

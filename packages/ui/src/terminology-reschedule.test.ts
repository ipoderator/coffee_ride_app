import { describe, expect, it } from 'vitest';
import { RIDE_RESCHEDULE_TERMS as T, RIDE_UPDATES_TERMS } from './terminology';

describe('RIDE_RESCHEDULE_TERMS (CR-190)', () => {
  it('names registrants and the waitlist with Russian plurals', () => {
    expect(T.recipients(1, 0)).toBe('1 записавшийся участник.');
    expect(T.recipients(3, 2)).toBe(
      '3 записавшихся участника и 2 человека из листа ожидания.',
    );
    expect(T.recipients(12, 5)).toBe(
      '12 записавшихся участников и 5 человек из листа ожидания.',
    );
    expect(T.recipients(0, 1)).toBe('1 человек из листа ожидания.');
  });

  it('says plainly when nobody will be notified', () => {
    expect(T.recipients(0, 0)).toBe(
      'Сейчас никто не записан и лист ожидания пуст — уведомление никому не придёт.',
    );
  });

  it('builds every «было → стало» line around the given start lines', () => {
    const was = 'сб 3 октября · 08:00 · МСК';
    const now = 'вс 4 октября · 08:00 · МСК';
    expect(T.timeZoneNote('МСК')).toBe('Время по часовому поясу старта — МСК.');
    expect(T.success(now)).toBe(
      `Заезд перенесён на ${now}. Участники получат уведомление.`,
    );
    expect(T.movedNote(was)).toBe(`Заезд перенесён. Раньше старт был ${was}.`);
    expect(T.reasonLine('Гроза.')).toBe('Причина: Гроза.');
    expect(T.ticketMoved(was)).toBe(`Перенесён, было ${was}`);
    expect(T.notificationWas(was)).toBe(`Было: ${was}`);
    expect(T.notificationNow(now)).toBe(`Стало: ${now}`);
    expect(T.historyLine(was, now)).toBe(`Было: ${was}. Стало: ${now}.`);
    expect(T.readinessExcerpt('Гроза.')).toBe('Перенос: Гроза.');
  });

  it('never suggests moving the start with a plain update message', () => {
    expect(RIDE_UPDATES_TERMS.messagePlaceholder).not.toMatch(/перенес/i);
  });
});

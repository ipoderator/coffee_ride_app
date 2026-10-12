import { describe, expect, it } from 'vitest';
import { RIDE_POSTER_TERMS, RIDE_TICKET_TERMS } from './terminology';

// CR-151: every templated string on the ride poster and its ticket — the
// Russian plural and genitive forms are the part that can read as broken.
describe('RIDE_POSTER_TERMS (CR-151)', () => {
  it('fills the timeline and riders templates', () => {
    expect(RIDE_POSTER_TERMS.startAt('07:30')).toBe('Старт · 07:30');
    expect(RIDE_POSTER_TERMS.finishAt('12:00')).toBe('Финиш · ≈ 12:00');
    expect(RIDE_POSTER_TERMS.stopFor('30 мин')).toBe('стоянка 30 мин');
    expect(RIDE_POSTER_TERMS.ridersOf(17, 24)).toBe('17 из 24');
  });
});

describe('RIDE_TICKET_TERMS (CR-151)', () => {
  it('says the start-list place in the genitive after «из»', () => {
    expect(RIDE_TICKET_TERMS.youWillBe(18, 24)).toBe(
      'Вы будете 18-м из 24 мест',
    );
    expect(RIDE_TICKET_TERMS.youWillBe(3, 21)).toBe(
      'Вы будете 3-м из 21 места',
    );
    expect(RIDE_TICKET_TERMS.youWillBe(5, null)).toBe('Вы будете 5-м');
  });

  it('agrees counts with their nouns', () => {
    expect(RIDE_TICKET_TERMS.groupNote('Бодрая', 1)).toBe(
      'Бодрая · 1 участник',
    );
    expect(RIDE_TICKET_TERMS.groupNote('Бодрая', 3)).toBe(
      'Бодрая · 3 участника',
    );
    expect(RIDE_TICKET_TERMS.groupNote('Бодрая', 11)).toBe(
      'Бодрая · 11 участников',
    );
    expect(RIDE_TICKET_TERMS.queueSize(0)).toBe('Очередь пока пуста.');
    expect(RIDE_TICKET_TERMS.queueSize(3)).toBe('В очереди 3 человека.');
    expect(RIDE_TICKET_TERMS.queueSize(5)).toBe('В очереди 5 человек.');
  });

  it('fills the seats, note, countdown and phone-bar templates', () => {
    expect(RIDE_TICKET_TERMS.participantsOf(12, 20)).toBe('12 из 20');
    expect(RIDE_TICKET_TERMS.registerNote('Бесплатно')).toBe(
      'Бесплатно · отменить можно до старта',
    );
    expect(RIDE_TICKET_TERMS.countdown('5 дн 14 ч')).toBe(
      'До старта 5 дн 14 ч',
    );
    // CR-239: the count, never a bare «№ N»; «из N» takes the genitive.
    expect(RIDE_TICKET_TERMS.barCount(14, 20)).toBe('14 из 20 участников');
    expect(RIDE_TICKET_TERMS.barCount(0, 1)).toBe('0 из 1 участника');
    expect(RIDE_TICKET_TERMS.barCount(3, 21)).toBe('3 из 21 участника');
    expect(RIDE_TICKET_TERMS.barCount(3, 22)).toBe('3 из 22 участников');
    expect(RIDE_TICKET_TERMS.barCount(1, null)).toBe('1 участник');
    expect(RIDE_TICKET_TERMS.barCount(2, null)).toBe('2 участника');
    expect(RIDE_TICKET_TERMS.barCount(5, null)).toBe('5 участников');
    expect(RIDE_TICKET_TERMS.barCount(11, null)).toBe('11 участников');
    expect(RIDE_TICKET_TERMS.barFull(3)).toBe('Мест нет · очередь 3');
    expect(RIDE_TICKET_TERMS.barRegistered(7)).toBe(
      'Вы зарегистрированы · № 7',
    );
    expect(RIDE_TICKET_TERMS.barRegistered(null)).toBe('Вы зарегистрированы');
  });
});

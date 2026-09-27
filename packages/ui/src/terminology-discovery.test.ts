import { describe, expect, it } from 'vitest';
import { RIDE_DISCOVERY_ROW_TERMS, RIDE_DISCOVERY_TERMS } from './terminology';

describe('RIDE_DISCOVERY_TERMS grid card (CR-144)', () => {
  it('pluralises «N из M участников» by the limit', () => {
    expect(RIDE_DISCOVERY_TERMS.seatsTaken(17, 20)).toBe('17 из 20 участников');
    expect(RIDE_DISCOVERY_TERMS.seatsTaken(1, 21)).toBe('1 из 21 участника');
    expect(RIDE_DISCOVERY_TERMS.seatsTaken(3, 3)).toBe('3 из 3 участников');
  });

  it('pluralises the participant count and has its own zero wording', () => {
    expect(RIDE_DISCOVERY_TERMS.participantsCount(0)).toBe(
      'Пока нет участников',
    );
    expect(RIDE_DISCOVERY_TERMS.participantsCount(1)).toBe('1 участник');
    expect(RIDE_DISCOVERY_TERMS.participantsCount(3)).toBe('3 участника');
    expect(RIDE_DISCOVERY_TERMS.participantsCount(11)).toBe('11 участников');
  });
});

// CR-118: its own file so concurrent CR-119/CR-120 edits to
// terminology.test.ts don't collide with it.
describe('RIDE_DISCOVERY_ROW_TERMS (CR-118)', () => {
  it('pluralises the seats-left chip', () => {
    expect(RIDE_DISCOVERY_ROW_TERMS.seatsLeft(1)).toBe('Осталось 1 место');
    expect(RIDE_DISCOVERY_ROW_TERMS.seatsLeft(3)).toBe('Осталось 3 места');
    expect(RIDE_DISCOVERY_ROW_TERMS.seatsLeft(6)).toBe('Осталось 6 мест');
    expect(RIDE_DISCOVERY_ROW_TERMS.seatsLeft(11)).toBe('Осталось 11 мест');
    expect(RIDE_DISCOVERY_ROW_TERMS.seatsLeft(21)).toBe('Осталось 21 место');
    expect(RIDE_DISCOVERY_ROW_TERMS.seatsLeft(22)).toBe('Осталось 22 места');
  });

  it('pluralises the pace-group count', () => {
    expect(RIDE_DISCOVERY_ROW_TERMS.groupsCount(2)).toBe('2 группы');
    expect(RIDE_DISCOVERY_ROW_TERMS.groupsCount(5)).toBe('5 групп');
    expect(RIDE_DISCOVERY_ROW_TERMS.groupsCount(12)).toBe('12 групп');
    expect(RIDE_DISCOVERY_ROW_TERMS.groupsCount(21)).toBe('21 группа');
  });
});

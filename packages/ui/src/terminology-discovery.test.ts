import { describe, expect, it } from 'vitest';
import { RIDE_DISCOVERY_ROW_TERMS } from './terminology';

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

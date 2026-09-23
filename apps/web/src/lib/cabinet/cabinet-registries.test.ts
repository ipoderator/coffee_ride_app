import { describe, expect, it } from 'vitest';
import { ORGANIZER_NAV_ITEMS } from './organizer-nav';
import { ORGANIZER_WIDGETS } from './organizer-widgets';
import { PARTICIPANT_NAV_ITEMS } from './participant-nav';

// ADR-009 (`.claude/rules/extensibility.md`): each registry sorts itself by
// `order` at module load so `AppHeader`/the widget grid can render the
// list as-is. Guards that sort, not the specific entries — a feature adding
// its own descriptor should never need to touch this test.
function expectSortedByOrder(items: ReadonlyArray<{ order: number }>) {
  const orders = items.map((item) => item.order);
  expect(orders).toEqual([...orders].sort((a, b) => a - b));
}

describe('cabinet registries', () => {
  it('sorts the organizer nav registry by order', () => {
    expect(ORGANIZER_NAV_ITEMS.length).toBeGreaterThan(0);
    expectSortedByOrder(ORGANIZER_NAV_ITEMS);
  });

  it('sorts the participant nav registry by order', () => {
    expect(PARTICIPANT_NAV_ITEMS.length).toBeGreaterThan(0);
    expectSortedByOrder(PARTICIPANT_NAV_ITEMS);
  });

  it('sorts the organizer widget registry by order', () => {
    expect(ORGANIZER_WIDGETS.length).toBeGreaterThan(0);
    expectSortedByOrder(ORGANIZER_WIDGETS);
  });
});

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CabinetNavItem } from '@/lib/cabinet/types';
import { CabinetSectionTabs } from './CabinetSectionTabs';

// CR-232: the active tab scrolls into the row on load and on navigation. jsdom
// has no layout, so the row is a 320 px window over five 120 px tabs laid out
// every 130 px, shifted by the row's own scroll offset.

let pathname = '/admin';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const ITEMS: CabinetNavItem[] = [
  { label: 'Обзор', href: '/admin', order: 0 },
  { label: 'Пользователи', href: '/admin/users', order: 10 },
  { label: 'Заезды', href: '/admin/rides', order: 20 },
  { label: 'Отзывы', href: '/admin/reviews', order: 30 },
  { label: 'Журнал', href: '/admin/actions', order: 40 },
];

const ROW_WIDTH = 320;
let scrollLeft = 0;
const scrollTo = vi.fn((options: ScrollToOptions) => {
  scrollLeft = options.left ?? scrollLeft;
});

function rect(left: number, width: number): DOMRect {
  return {
    left,
    right: left + width,
    width,
    top: 0,
    bottom: 44,
    height: 44,
    x: left,
    y: 0,
    toJSON: () => ({}),
  };
}

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduce && query.includes('reduce'),
    })),
  );
}

beforeEach(() => {
  pathname = '/admin';
  scrollLeft = 0;
  scrollTo.mockClear();
  mockReducedMotion(false);
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: scrollTo,
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollLeft', {
    configurable: true,
    get: () => scrollLeft,
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      if (this.tagName === 'UL') return rect(0, ROW_WIDTH);
      const index = ITEMS.findIndex(
        (item) => item.href === this.getAttribute('href'),
      );
      return rect(index * 130 - scrollLeft, 120);
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo;
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollLeft;
});

describe('CabinetSectionTabs keeps the active tab visible (CR-232)', () => {
  it('scrolls the last tab into view on a direct load, instantly', () => {
    pathname = '/admin/actions';
    const pageScroll = vi.spyOn(window, 'scrollTo');
    render(<CabinetSectionTabs items={ITEMS} />);

    expect(
      screen.getByRole('link', { name: 'Журнал' }).getAttribute('aria-current'),
    ).toBe('page');
    // Journal spans 520–640: the row moves by 640 − 320.
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ left: 320, behavior: 'auto' });
    expect(pageScroll).not.toHaveBeenCalled();
  });

  it('leaves the row alone when the active tab already fits', () => {
    pathname = '/admin/users';
    render(<CabinetSectionTabs items={ITEMS} />);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('follows navigation smoothly, back to an earlier tab too', () => {
    const { rerender } = render(<CabinetSectionTabs items={ITEMS} />);
    expect(scrollTo).not.toHaveBeenCalled();

    pathname = '/admin/reviews';
    rerender(<CabinetSectionTabs items={ITEMS} />);
    expect(scrollTo).toHaveBeenLastCalledWith({
      left: 190,
      behavior: 'smooth',
    });

    pathname = '/admin';
    rerender(<CabinetSectionTabs items={ITEMS} />);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: 'smooth' });
    expect(
      screen.getByRole('link', { name: 'Обзор' }).getAttribute('aria-current'),
    ).toBe('page');
  });

  it('jumps without animation when reduced motion is requested', () => {
    mockReducedMotion(true);
    const { rerender } = render(<CabinetSectionTabs items={ITEMS} />);
    pathname = '/admin/actions';
    rerender(<CabinetSectionTabs items={ITEMS} />);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 320, behavior: 'auto' });
  });
});

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomTabBar } from './BottomTabBar';

let pathname = '/';
let search = '';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
}));

function currentTab(): string | null {
  const current = screen
    .getAllByRole('link')
    .find((link) => link.getAttribute('aria-current') === 'page');
  return current?.textContent ?? null;
}

describe('BottomTabBar (CR-130)', () => {
  beforeEach(() => {
    pathname = '/';
    search = '';
  });

  afterEach(() => {
    document.documentElement.style.removeProperty('--app-bottom-inset');
  });

  it('renders the five tabs, each with a visible label', () => {
    render(<BottomTabBar />);
    const nav = screen.getByRole('navigation', { name: 'Быстрая навигация' });
    expect(nav).toBeInTheDocument();
    expect(
      screen.getAllByRole('link').map((link) => link.getAttribute('href')),
    ).toEqual(['/', '/?view=map', '/organizer/rides/new', '/me/rides', '/me']);
    for (const label of ['Заезды', 'Карта', 'Создать', 'Мои', 'Я']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it.each([
    ['/', '', 'Заезды'],
    ['/', 'view=map', 'Карта'],
    ['/organizer/rides/new', '', 'Создать'],
    ['/me/rides', '', 'Мои'],
    ['/me', '', 'Я'],
    ['/me/profile', '', 'Я'],
    ['/organizer', '', null],
  ])('marks %s?%s as «%s»', (path, query, expected) => {
    pathname = path;
    search = query;
    render(<BottomTabBar />);
    expect(currentTab()).toBe(expected);
  });

  it('steps aside on a ride page, where the sticky registration bar sits', () => {
    pathname = '/rides/ride-1';
    render(<BottomTabBar />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(
      document.documentElement.style.getPropertyValue('--app-bottom-inset'),
    ).toBe('');
  });

  it('publishes its height for toasts while mounted', () => {
    const { unmount } = render(<BottomTabBar />);
    expect(
      document.documentElement.style.getPropertyValue('--app-bottom-inset'),
    ).toBe('4rem');
    unmount();
    expect(
      document.documentElement.style.getPropertyValue('--app-bottom-inset'),
    ).toBe('');
  });
});

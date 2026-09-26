import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CabinetNavItem } from '@/lib/cabinet/types';
import { CabinetSidebar } from './CabinetSidebar';

let pathname = '/organizer';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const ITEMS: CabinetNavItem[] = [
  { label: 'Обзор', href: '/organizer', order: 0, icon: 'House' },
  { label: 'Заезды', href: '/organizer/rides', order: 20, icon: 'Bike' },
  {
    label: 'Участники',
    href: '/organizer/participants',
    order: 30,
    icon: 'Users',
  },
];

function current(): string | null {
  return (
    screen
      .getAllByRole('link')
      .find((link) => link.getAttribute('aria-current') === 'page')
      ?.textContent ?? null
  );
}

describe('CabinetSidebar active item (CR-131)', () => {
  beforeEach(() => {
    pathname = '/organizer';
  });

  it('lights «Обзор» on the cabinet root only', () => {
    render(<CabinetSidebar items={ITEMS} />);
    expect(current()).toBe('Обзор');
  });

  it('keeps «Заезды» lit on a ride sub-page, not «Обзор»', () => {
    pathname = '/organizer/rides/ride-1/edit';
    render(<CabinetSidebar items={ITEMS} />);
    expect(current()).toBe('Заезды');
  });

  it('lights nothing on an unrelated cabinet page', () => {
    pathname = '/organizer/profile';
    render(<CabinetSidebar items={ITEMS} />);
    expect(current()).toBeNull();
  });
});

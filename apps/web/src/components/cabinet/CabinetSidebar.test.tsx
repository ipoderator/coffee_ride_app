import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CabinetNavItem } from '@/lib/cabinet/types';
import { CabinetSectionTabs } from './CabinetSectionTabs';
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
    badge: 'newRegistrations',
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

describe('cabinet nav badges (CR-132)', () => {
  beforeEach(() => {
    pathname = '/organizer';
  });

  it('shows the count on the badged item, with a sentence for screen readers', () => {
    render(<CabinetSidebar items={ITEMS} badges={{ newRegistrations: 3 }} />);
    const link = screen.getByRole('link', { name: /Участники/ });
    expect(link).toHaveTextContent('3');
    expect(link).toHaveAccessibleName('Участники, 3 новые записи за сутки');
  });

  it('shows no badge while the count is unknown or zero', () => {
    const { rerender } = render(<CabinetSidebar items={ITEMS} />);
    expect(screen.getByRole('link', { name: 'Участники' })).toBeTruthy();
    rerender(<CabinetSidebar items={ITEMS} badges={{ newRegistrations: 0 }} />);
    expect(screen.getByRole('link', { name: 'Участники' })).toBeTruthy();
  });

  it('carries the same items, active state and badge in the mobile strip', () => {
    pathname = '/organizer/participants';
    render(
      <CabinetSectionTabs items={ITEMS} badges={{ newRegistrations: 5 }} />,
    );
    expect(current()).toContain('Участники');
    expect(
      screen.getByRole('link', { name: /5 новых записей за сутки/ }),
    ).toBeTruthy();
  });
});

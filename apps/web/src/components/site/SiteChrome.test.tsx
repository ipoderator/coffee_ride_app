import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { hasOwnChrome, SiteChrome } from './SiteChrome';

let pathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

function renderChrome() {
  return render(
    <SiteChrome header={<header>Общая шапка</header>}>
      <p>Страница</p>
    </SiteChrome>,
  );
}

describe('SiteChrome (CR-132)', () => {
  it('draws the shared header everywhere but the organizer cabinet', () => {
    pathname = '/rides/ride-1';
    renderChrome();
    expect(screen.getByText('Общая шапка')).toBeInTheDocument();
    expect(screen.getByText('Страница')).toBeInTheDocument();
  });

  it('leaves the organizer cabinet bare — it draws its own frame', () => {
    pathname = '/organizer/rides';
    renderChrome();
    expect(screen.queryByText('Общая шапка')).toBeNull();
    expect(screen.getByText('Страница')).toBeInTheDocument();
  });

  it('matches the cabinet root and its sub-pages, not look-alike paths', () => {
    expect(hasOwnChrome('/organizer')).toBe(true);
    expect(hasOwnChrome('/organizer/profile')).toBe(true);
    expect(hasOwnChrome('/organizers')).toBe(false);
    expect(hasOwnChrome('/me')).toBe(false);
  });
});

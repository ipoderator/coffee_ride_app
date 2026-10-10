import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_TERMS } from 'ui';
import type { CabinetNavItem } from '@/lib/cabinet/types';
import { lookupAdminAccess } from '@/lib/admin/server-admin';
import AdminLayout, { metadata } from './layout';

vi.mock('@/lib/admin/server-admin', () => ({ lookupAdminAccess: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/components/cabinet/CabinetShell', () => ({
  CabinetShell: ({
    children,
    sidebarNavItems,
  }: {
    children: ReactNode;
    sidebarNavItems: CabinetNavItem[];
  }) => (
    <div data-testid="shell" data-items={sidebarNavItems.length}>
      {children}
    </div>
  ),
}));
const lookup = vi.mocked(lookupAdminAccess);

beforeEach(() => {
  lookup.mockReset();
});

// CR-231 (ADR-032): the `/admin` gate.
describe('AdminLayout', () => {
  it('answers a real 404 to anyone who is not an admin', async () => {
    lookup.mockResolvedValue('denied');
    await expect(AdminLayout({ children: 'secret' })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });

  it('shows an error, not the section, when access cannot be checked', async () => {
    lookup.mockResolvedValue('unknown');
    render(await AdminLayout({ children: 'secret' }));
    expect(screen.getByText(ADMIN_TERMS.accessCheckFailed)).toBeInTheDocument();
    expect(screen.queryByText('secret')).toBeNull();
  });

  it('renders the section in the cabinet shell with its five sections', async () => {
    lookup.mockResolvedValue('admin');
    render(await AdminLayout({ children: 'secret' }));
    expect(screen.getByTestId('shell')).toHaveAttribute('data-items', '5');
    expect(screen.getByText('secret')).toBeInTheDocument();
  });

  it('keeps the section out of search engines', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});

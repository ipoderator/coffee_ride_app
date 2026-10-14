import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
);
vi.mock('next/navigation', () => ({ notFound }));

const { default: MaintenancePage, metadata } = await import('./page');

// CR-265: the page `src/proxy.ts` rewrites every page to.
describe('/maintenance', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    notFound.mockClear();
  });

  it('shows the maintenance screen while the mode is on', () => {
    vi.stubEnv('MAINTENANCE_MODE', 'true');
    render(<MaintenancePage />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Технический пит-стоп. Скоро снова в путь.',
      }),
    ).toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
  });

  it('does not exist while the mode is off', () => {
    expect(() => MaintenancePage()).toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it('is never indexed', () => {
    expect(metadata.robots).toEqual({ index: false });
    expect(metadata.title).toBe('Технические работы — Coffee Ride');
  });
});

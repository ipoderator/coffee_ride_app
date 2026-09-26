import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ride } from 'types';
import { fetchNearestOwnRide } from '@/lib/organizer/own-rides';
import { NearestRideRedirect } from './NearestRideRedirect';

const replaceMock = vi.fn();
// One stable object, like Next's own router — a fresh one per render would
// re-run the redirect effect on every render.
const router = { replace: replaceMock, push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/organizer/own-rides', () => ({
  fetchNearestOwnRide: vi.fn(),
}));
const nearestMock = vi.mocked(fetchNearestOwnRide);

describe('NearestRideRedirect (CR-131)', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    nearestMock.mockReset();
  });

  it('opens the nearest ride’s page, replacing the history entry', async () => {
    nearestMock.mockResolvedValue({ id: 'ride-7' } as Ride);
    render(<NearestRideRedirect target="participants" title="Участники" />);
    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(
        '/organizer/rides/ride-7/participants',
      ),
    );
  });

  it('shows an empty state linking to all rides when none is upcoming', async () => {
    nearestMock.mockResolvedValue(null);
    render(<NearestRideRedirect target="updates" title="Обновления" />);
    expect(
      await screen.findByRole('link', { name: 'Все заезды' }),
    ).toHaveAttribute('href', '/organizer/rides');
    expect(screen.getByRole('heading', { name: 'Обновления' })).toBeTruthy();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('retries after an error', async () => {
    nearestMock.mockRejectedValueOnce(new Error('network'));
    nearestMock.mockResolvedValueOnce({ id: 'ride-1' } as Ride);
    render(<NearestRideRedirect target="updates" title="Обновления" />);
    fireEvent.click(await screen.findByRole('button'));
    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(
        '/organizer/rides/ride-1/updates',
      ),
    );
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ride, RideParticipantSummary } from 'types';
import { loadOrganizerNavBadges } from './nav-badges';
import { fetchNearestOwnRide, listAllRideParticipants } from './own-rides';

vi.mock('./own-rides', async () => {
  const actual =
    await vi.importActual<typeof import('./own-rides')>('./own-rides');
  return {
    ...actual,
    fetchNearestOwnRide: vi.fn(),
    listAllRideParticipants: vi.fn(),
  };
});

const nearestMock = vi.mocked(fetchNearestOwnRide);
const participantsMock = vi.mocked(listAllRideParticipants);

const NOW = new Date('2026-09-26T12:00:00Z');

function signedUp(id: string, hoursAgo: number): RideParticipantSummary {
  return {
    id,
    userId: `user-${id}`,
    displayName: null,
    group: null,
    createdAt: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(),
  };
}

describe('loadOrganizerNavBadges (CR-132)', () => {
  beforeEach(() => {
    nearestMock.mockReset();
    participantsMock.mockReset();
  });

  it("counts the nearest ride's registrations in the last 24 hours", async () => {
    nearestMock.mockResolvedValue({ id: 'ride-1' } as Ride);
    participantsMock.mockResolvedValue([
      signedUp('a', 1),
      signedUp('b', 23),
      signedUp('c', 25),
    ]);

    await expect(loadOrganizerNavBadges(NOW)).resolves.toEqual({
      newRegistrations: 2,
    });
    expect(participantsMock).toHaveBeenCalledWith('ride-1');
  });

  it('resolves no counters without a nearest ride', async () => {
    nearestMock.mockResolvedValue(null);
    await expect(loadOrganizerNavBadges(NOW)).resolves.toEqual({});
    expect(participantsMock).not.toHaveBeenCalled();
  });
});

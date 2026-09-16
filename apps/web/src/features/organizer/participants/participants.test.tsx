import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ParticipantTable } from './components/ParticipantTable';
import { WaitlistTable } from './components/WaitlistTable';
import {
  ApiError,
  getRideParticipants,
  getRideWaitlist,
  type RideParticipantSummary,
} from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    getRideParticipants: vi.fn(),
    getRideWaitlist: vi.fn(),
  };
});

const getRideParticipantsMock = vi.mocked(getRideParticipants);
const getRideWaitlistMock = vi.mocked(getRideWaitlist);

const first: RideParticipantSummary = {
  id: 'reg-1',
  userId: 'user-1',
  displayName: 'Анна Смирнова',
  createdAt: '2027-01-01T10:00:00.000Z',
};
const second: RideParticipantSummary = {
  id: 'reg-2',
  userId: 'user-2',
  displayName: null,
  createdAt: '2027-01-02T10:00:00.000Z',
};

describe('ParticipantTable', () => {
  it('shows a loading skeleton, then the participant list', async () => {
    getRideParticipantsMock.mockResolvedValue({
      items: [first, second],
      nextCursor: null,
    });

    render(<ParticipantTable rideId="ride-1" />);

    await waitFor(() =>
      expect(screen.getByText('Анна Смирнова')).toBeInTheDocument(),
    );
    // A participant with no `displayName` falls back to placeholder text, not a
    // blank cell.
    expect(screen.getByText('Без имени')).toBeInTheDocument();
  });

  it('shows the empty state when no one has registered', async () => {
    getRideParticipantsMock.mockResolvedValue({ items: [], nextCursor: null });

    render(<ParticipantTable rideId="ride-1" />);

    await waitFor(() =>
      expect(
        screen.getByText('Пока никто не зарегистрирован'),
      ).toBeInTheDocument(),
    );
  });

  it('shows an error state when the request fails', async () => {
    getRideParticipantsMock.mockRejectedValue(
      new ApiError({
        type: 'about:blank',
        title: 'Ride not found',
        status: 404,
        detail: 'No ride with that id exists.',
        instance: '/v1/rides/ride-1/participants',
        code: 'ride_not_found',
      }),
    );

    render(<ParticipantTable rideId="ride-1" />);

    await waitFor(() =>
      expect(
        screen.getByText(
          'Не удалось загрузить список участников. Попробуйте ещё раз.',
        ),
      ).toBeInTheDocument(),
    );
  });
});

describe('WaitlistTable', () => {
  it('renders waiting entries in queue order with a position number', async () => {
    getRideWaitlistMock.mockResolvedValue({
      items: [first, second],
      nextCursor: null,
    });

    render(<WaitlistTable rideId="ride-1" />);

    await waitFor(() =>
      expect(screen.getByText(/1\.\s*Анна Смирнова/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/2\.\s*Без имени/)).toBeInTheDocument();
  });

  it('shows the empty state when the waitlist is empty', async () => {
    getRideWaitlistMock.mockResolvedValue({ items: [], nextCursor: null });

    render(<WaitlistTable rideId="ride-1" />);

    await waitFor(() =>
      expect(screen.getByText('Лист ожидания пуст')).toBeInTheDocument(),
    );
  });
});

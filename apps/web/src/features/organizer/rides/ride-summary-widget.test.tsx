import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RideSummaryWidget } from './components/RideSummaryWidget';
import { ApiError, getOwnRideSummary } from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    getOwnRideSummary: vi.fn(),
  };
});

const getOwnRideSummaryMock = vi.mocked(getOwnRideSummary);

describe('RideSummaryWidget', () => {
  beforeEach(() => {
    getOwnRideSummaryMock.mockReset();
  });

  it('shows every count once loaded', async () => {
    getOwnRideSummaryMock.mockResolvedValue({
      summary: {
        totalRides: 5,
        draftRides: 1,
        openRegistrationRides: 2,
        activeRegistrations: 12,
        waitlisted: 3,
      },
    });

    render(<RideSummaryWidget />);

    expect(await screen.findByText('Мои заезды')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows an all-zero summary as a normal ready state, not an error', async () => {
    getOwnRideSummaryMock.mockResolvedValue({
      summary: {
        totalRides: 0,
        draftRides: 0,
        openRegistrationRides: 0,
        activeRegistrations: 0,
        waitlisted: 0,
      },
    });

    render(<RideSummaryWidget />);

    await screen.findByText('Мои заезды');
    expect(screen.getAllByText('0')).toHaveLength(4);
  });

  it('shows a retryable error state on a load failure', async () => {
    getOwnRideSummaryMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/internal_error',
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected error occurred.',
        instance: '/v1/rides/mine/summary',
        code: 'internal_error',
      }),
    );

    render(<RideSummaryWidget />);

    expect(
      await screen.findByText('Не удалось загрузить сводку по заездам.'),
    ).toBeInTheDocument();

    getOwnRideSummaryMock.mockResolvedValue({
      summary: {
        totalRides: 1,
        draftRides: 0,
        openRegistrationRides: 1,
        activeRegistrations: 0,
        waitlisted: 0,
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    await waitFor(() => {
      expect(getOwnRideSummaryMock).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('Мои заезды')).toBeInTheDocument();
  });
});

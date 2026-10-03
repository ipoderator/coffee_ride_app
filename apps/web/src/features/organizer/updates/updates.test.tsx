import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ride, RideUpdate } from 'types';
import {
  RideWorkspaceContext,
  type RideWorkspaceContextValue,
} from '@/lib/cabinet/ride-workspace';
import { UpdateComposer } from './components/UpdateComposer';
import { ApiError, createRideUpdate, getRideUpdates } from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    getRideUpdates: vi.fn(),
    createRideUpdate: vi.fn(),
  };
});

const getRideUpdatesMock = vi.mocked(getRideUpdates);
const createRideUpdateMock = vi.mocked(createRideUpdate);

const existingUpdate: RideUpdate = {
  id: 'update-1',
  rideId: 'ride-1',
  message: 'Первое сообщение.',
  createdAt: '2027-01-02T00:00:00.000Z',
  reschedule: null,
};

const workspaceRide: Ride = {
  id: 'ride-1',
  organizerId: 'org-1',
  title: 'Утро на Лосином острове',
  description: null,
  coverImageUrl: null,
  bicycleType: 'gravel',
  startsAt: '2099-10-01T05:00:00.000Z',
  startTimezone: 'Europe/Moscow',
  startLat: null,
  startLng: null,
  participantLimit: null,
  priceRub: null,
  distanceKm: null,
  elevationGainMeters: null,
  paceKmh: null,
  durationMinutes: null,
  difficulty: null,
  participantsVisible: true,
  status: 'registration_open',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  updatedBy: 'user-1',
};

function workspaceValue(registrationsCount: number): RideWorkspaceContextValue {
  return {
    data: {
      ride: workspaceRide,
      route: null,
      stops: [],
      routePoints: [],
      groups: [],
      registrationsCount,
      waitlistCount: 0,
      attendanceSummary: null,
      requirements: [],
      contact: undefined,
      latestUpdate: null,
      lastReschedule: null,
    },
    sections: [],
    refresh: async () => {},
    applyRide: () => {},
  };
}

describe('UpdateComposer', () => {
  beforeEach(() => {
    getRideUpdatesMock.mockReset();
    createRideUpdateMock.mockReset();
  });

  it('shows an empty history state when no updates were sent yet', async () => {
    getRideUpdatesMock.mockResolvedValue({ items: [], nextCursor: null });

    render(<UpdateComposer rideId="ride-1" />);

    expect(await screen.findByText('Обновлений пока нет')).toBeInTheDocument();
  });

  it('shows a history load error state', async () => {
    getRideUpdatesMock.mockRejectedValue(new Error('network error'));

    render(<UpdateComposer rideId="ride-1" />);

    expect(
      await screen.findByText(
        'Не удалось загрузить историю обновлений. Попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();
  });

  it('renders previously sent updates', async () => {
    getRideUpdatesMock.mockResolvedValue({
      items: [existingUpdate],
      nextCursor: null,
    });

    render(<UpdateComposer rideId="ride-1" />);

    expect(await screen.findByText('Первое сообщение.')).toBeInTheDocument();
  });

  it('rejects an empty message client-side without calling the API', async () => {
    getRideUpdatesMock.mockResolvedValue({ items: [], nextCursor: null });

    render(<UpdateComposer rideId="ride-1" />);
    await screen.findByText('Обновлений пока нет');

    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));

    // CR-187: in Russian — the shared schema's own message is English.
    expect(await screen.findByText('Напишите сообщение.')).toBeInTheDocument();
    expect(createRideUpdateMock).not.toHaveBeenCalled();
  });

  it('sends a message, shows a success message, clears the field, and reloads history', async () => {
    getRideUpdatesMock
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockResolvedValueOnce({ items: [existingUpdate], nextCursor: null });
    createRideUpdateMock.mockResolvedValue({
      rideUpdate: existingUpdate,
      recipientsCount: 3,
    });

    render(<UpdateComposer rideId="ride-1" />);
    await screen.findByText('Обновлений пока нет');

    const textarea = screen.getByLabelText('Сообщение участникам');
    fireEvent.change(textarea, { target: { value: 'Первое сообщение.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));

    expect(
      await screen.findByText(
        'Обновление отправлено: получат 3 записавшихся участника.',
      ),
    ).toBeInTheDocument();
    expect(createRideUpdateMock).toHaveBeenCalledWith(
      'ride-1',
      'Первое сообщение.',
    );
    await waitFor(() => expect(textarea).toHaveValue(''));
    expect(getRideUpdatesMock).toHaveBeenCalledTimes(2);
  });

  // CR-192: «отправлено участникам» was shown even with nobody registered.
  it('says nobody receives the update when no one is registered, and still records it', async () => {
    getRideUpdatesMock
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockResolvedValueOnce({ items: [existingUpdate], nextCursor: null });
    createRideUpdateMock.mockResolvedValue({
      rideUpdate: existingUpdate,
      recipientsCount: 0,
    });

    render(<UpdateComposer rideId="ride-1" />);
    await screen.findByText('Обновлений пока нет');

    fireEvent.change(screen.getByLabelText('Сообщение участникам'), {
      target: { value: 'Первое сообщение.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));

    expect(
      await screen.findByText('Обновление опубликовано; получателей пока нет.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/отправлено участникам/)).not.toBeInTheDocument();
    // The update is a published record: the history reloads and lists it.
    expect(await screen.findByText('Первое сообщение.')).toBeInTheDocument();
    expect(getRideUpdatesMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [1, 'Обновление отправлено: получит 1 записавшийся участник.'],
    [2, 'Обновление отправлено: получат 2 записавшихся участника.'],
    [5, 'Обновление отправлено: получат 5 записавшихся участников.'],
  ])('reports %i recipient(s) with the right plural', async (count, text) => {
    getRideUpdatesMock.mockResolvedValue({ items: [], nextCursor: null });
    createRideUpdateMock.mockResolvedValue({
      rideUpdate: existingUpdate,
      recipientsCount: count,
    });

    render(<UpdateComposer rideId="ride-1" />);
    await screen.findByText('Обновлений пока нет');

    fireEvent.change(screen.getByLabelText('Сообщение участникам'), {
      target: { value: 'Сообщение.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));

    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it('claims no recipients when the response carries no count and none is known', async () => {
    getRideUpdatesMock.mockResolvedValue({ items: [], nextCursor: null });
    createRideUpdateMock.mockResolvedValue({ rideUpdate: existingUpdate });

    render(<UpdateComposer rideId="ride-1" />);
    await screen.findByText('Обновлений пока нет');

    fireEvent.change(screen.getByLabelText('Сообщение участникам'), {
      target: { value: 'Сообщение.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));

    expect(
      await screen.findByText('Обновление опубликовано.'),
    ).toBeInTheDocument();
  });

  it("falls back to the workspace's registrations count when the response has none", async () => {
    getRideUpdatesMock.mockResolvedValue({ items: [], nextCursor: null });
    createRideUpdateMock.mockResolvedValue({ rideUpdate: existingUpdate });

    render(
      <RideWorkspaceContext.Provider value={workspaceValue(0)}>
        <UpdateComposer rideId="ride-1" />
      </RideWorkspaceContext.Provider>,
    );
    await screen.findByText('Обновлений пока нет');

    fireEvent.change(screen.getByLabelText('Сообщение участникам'), {
      target: { value: 'Сообщение.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));

    expect(
      await screen.findByText('Обновление опубликовано; получателей пока нет.'),
    ).toBeInTheDocument();
  });

  it('shows a server-side field validation error returned after the client-side check passes', async () => {
    getRideUpdatesMock.mockResolvedValue({ items: [], nextCursor: null });
    createRideUpdateMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/validation_error',
        title: 'Validation failed',
        status: 400,
        detail: 'One or more fields failed validation.',
        instance: '/v1/rides/ride-1/updates',
        code: 'validation_error',
        errors: [
          { path: 'message', message: 'Message rejected by the server.' },
        ],
      }),
    );

    render(<UpdateComposer rideId="ride-1" />);
    await screen.findByText('Обновлений пока нет');

    fireEvent.change(screen.getByLabelText('Сообщение участникам'), {
      target: { value: 'Нормальное сообщение.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));

    expect(await screen.findByText('Проверьте это поле.')).toBeInTheDocument();
    expect(
      screen.queryByText('Message rejected by the server.'),
    ).not.toBeInTheDocument();
  });
});

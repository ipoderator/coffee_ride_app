import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ride } from 'types';
import { CreateRideForm } from './components/CreateRideForm';
import { ApiError, createRide } from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    createRide: vi.fn(),
  };
});

const createRideMock = vi.mocked(createRide);

const baseRide: Ride = {
  id: 'ride-1',
  organizerId: 'org-1',
  title: 'Утренний гравийный заезд',
  description: null,
  coverImageUrl: null,
  bicycleType: 'gravel',
  startsAt: '2027-05-01T05:00:00.000Z',
  startTimezone: 'Europe/Moscow',
  participantLimit: null,
  priceRub: null,
  distanceKm: null,
  elevationGainMeters: null,
  paceKmh: null,
  durationMinutes: null,
  difficulty: null,
  status: 'draft',
  createdAt: '2027-01-01T00:00:00.000Z',
  updatedAt: '2027-01-01T00:00:00.000Z',
  updatedBy: 'user-1',
};

function fillMinimalValidForm() {
  fireEvent.change(screen.getByLabelText('Название'), {
    target: { value: 'Утренний гравийный заезд' },
  });
  fireEvent.change(screen.getByLabelText('Дата и время старта'), {
    target: { value: '2027-05-01T08:00' },
  });
}

describe('CreateRideForm', () => {
  beforeEach(() => {
    createRideMock.mockReset();
  });

  it('shows a client-side validation error without calling the API', async () => {
    render(<CreateRideForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Создать черновик' }));

    await waitFor(() =>
      expect(
        screen.getByText('Укажите дату и время старта.'),
      ).toBeInTheDocument(),
    );
    expect(createRideMock).not.toHaveBeenCalled();
  });

  it('creates a ride and shows the inline success view', async () => {
    createRideMock.mockResolvedValue({ ride: baseRide });

    render(<CreateRideForm />);
    fillMinimalValidForm();
    fireEvent.click(screen.getByRole('button', { name: 'Создать черновик' }));

    expect(
      await screen.findByText('Черновик заезда создан'),
    ).toBeInTheDocument();
    expect(screen.getByText('Утренний гравийный заезд')).toBeInTheDocument();
    expect(screen.getByText('Черновик')).toBeInTheDocument();

    // The default timezone (Europe/Moscow) converts 08:00 local to 05:00 UTC.
    expect(createRideMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Утренний гравийный заезд',
        bicycleType: 'gravel',
        startsAt: '2027-05-01T05:00:00.000Z',
        startTimezone: 'Europe/Moscow',
      }),
    );
  });

  it('ignores a second submit while a request is already pending', async () => {
    createRideMock.mockReturnValue(new Promise(() => {}));

    render(<CreateRideForm />);
    fillMinimalValidForm();
    fireEvent.click(screen.getByRole('button', { name: 'Создать черновик' }));

    const pendingButton = await screen.findByRole('button', {
      name: 'Создание…',
    });
    expect(pendingButton).toBeDisabled();

    fireEvent.submit(pendingButton.closest('form')!);

    expect(createRideMock).toHaveBeenCalledOnce();
  });

  it('shows a guiding message when the caller has no organizer profile yet', async () => {
    createRideMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/organizer_profile_required',
        title: 'Organizer profile required',
        status: 403,
        detail: 'Create an organizer profile before creating a ride.',
        instance: '/v1/rides',
        code: 'organizer_profile_required',
      }),
    );

    render(<CreateRideForm />);
    fillMinimalValidForm();
    fireEvent.click(screen.getByRole('button', { name: 'Создать черновик' }));

    expect(
      await screen.findByText(
        /Чтобы создать заезд, сначала создайте профиль организатора/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Создать профиль организатора' }),
    ).toHaveAttribute('href', '/organizer/profile');
  });

  it('maps a server validation error onto the matching field', async () => {
    createRideMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/validation_error',
        title: 'Validation error',
        status: 400,
        detail: 'The request payload is invalid.',
        instance: '/v1/rides',
        code: 'validation_error',
        errors: [{ path: 'title', message: 'Title cannot be empty.' }],
      }),
    );

    render(<CreateRideForm />);
    fillMinimalValidForm();
    fireEvent.click(screen.getByRole('button', { name: 'Создать черновик' }));

    expect(
      await screen.findByText('Title cannot be empty.'),
    ).toBeInTheDocument();
  });
});

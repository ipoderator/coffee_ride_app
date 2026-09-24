import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ride } from 'types';
import { CreateRideForm } from './components/CreateRideForm';
import { RidesList } from './components/RidesList';
import { EditRideForm } from './components/EditRideForm';
import {
  ApiError,
  cancelRide,
  closeRegistration,
  createRide,
  finishRide,
  getRide,
  listMyRides,
  openRegistration,
  publishRide,
  startRide,
  updateRide,
} from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    createRide: vi.fn(),
    listMyRides: vi.fn(),
    getRide: vi.fn(),
    updateRide: vi.fn(),
    publishRide: vi.fn(),
    openRegistration: vi.fn(),
    closeRegistration: vi.fn(),
    cancelRide: vi.fn(),
    startRide: vi.fn(),
    finishRide: vi.fn(),
  };
});

const createRideMock = vi.mocked(createRide);
const listMyRidesMock = vi.mocked(listMyRides);
const getRideMock = vi.mocked(getRide);
const updateRideMock = vi.mocked(updateRide);
const publishRideMock = vi.mocked(publishRide);
const openRegistrationMock = vi.mocked(openRegistration);
const closeRegistrationMock = vi.mocked(closeRegistration);
const cancelRideMock = vi.mocked(cancelRide);
const startRideMock = vi.mocked(startRide);
const finishRideMock = vi.mocked(finishRide);

const baseRide: Ride = {
  id: 'ride-1',
  organizerId: 'org-1',
  title: 'Утренний гравийный заезд',
  description: null,
  coverImageUrl: null,
  bicycleType: 'gravel',
  startsAt: '2027-05-01T05:00:00.000Z',
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

describe('RidesList', () => {
  beforeEach(() => {
    listMyRidesMock.mockReset();
  });

  it('shows an empty state with a working create link when there are no rides', async () => {
    listMyRidesMock.mockResolvedValue({ items: [], nextCursor: null });

    render(<RidesList />);

    expect(
      await screen.findByText('Пока нет ни одного заезда'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Новый заезд' })).toHaveAttribute(
      'href',
      '/organizer/rides/new',
    );
  });

  it('shows an error state when the list fails to load', async () => {
    listMyRidesMock.mockRejectedValue(new Error('network error'));

    render(<RidesList />);

    expect(
      await screen.findByText(
        'Не удалось загрузить список заездов. Попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();
  });

  it('groups rides by status and links each one to its edit screen', async () => {
    listMyRidesMock.mockResolvedValue({
      items: [
        { ...baseRide, id: 'ride-draft', title: 'Черновик заезда' },
        {
          ...baseRide,
          id: 'ride-published',
          title: 'Опубликованный заезд',
          status: 'published',
        },
      ],
      nextCursor: null,
    });

    render(<RidesList />);

    expect(await screen.findByText('Черновик заезда')).toBeInTheDocument();
    expect(screen.getByText('Опубликованный заезд')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Черновик заезда/ }),
    ).toHaveAttribute('href', '/organizer/rides/ride-draft/edit');
    expect(
      screen.getByRole('link', { name: /Опубликованный заезд/ }),
    ).toHaveAttribute('href', '/organizer/rides/ride-published/edit');
  });
});

describe('EditRideForm', () => {
  beforeEach(() => {
    getRideMock.mockReset();
    updateRideMock.mockReset();
    publishRideMock.mockReset();
    openRegistrationMock.mockReset();
    closeRegistrationMock.mockReset();
    cancelRideMock.mockReset();
    startRideMock.mockReset();
    finishRideMock.mockReset();
  });

  it('shows a not-found state for a ride that does not exist or is not owned by the caller', async () => {
    getRideMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/ride_not_found',
        title: 'Ride not found',
        status: 404,
        detail: 'No ride with that id exists for this account.',
        instance: '/v1/rides/unknown',
        code: 'ride_not_found',
      }),
    );

    render(<EditRideForm rideId="unknown" />);

    expect(await screen.findByText('Заезд не найден')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'К списку заездов' }),
    ).toHaveAttribute('href', '/organizer/rides');
  });

  it('prefills the form from the loaded ride, including the local start time', async () => {
    getRideMock.mockResolvedValue({ ride: baseRide });

    render(<EditRideForm rideId="ride-1" />);

    expect(await screen.findByDisplayValue(baseRide.title)).toBeInTheDocument();
    // startsAt is 05:00 UTC; the ride's own zone is Europe/Moscow (UTC+3).
    expect(screen.getByDisplayValue('2027-05-01T08:00')).toBeInTheDocument();
  });

  it('links to the pace-groups editor next to the other ride sub-pages (CR-120)', async () => {
    getRideMock.mockResolvedValue({ ride: baseRide });

    render(<EditRideForm rideId="ride-1" />);

    expect(
      await screen.findByRole('link', { name: 'Группы →' }),
    ).toHaveAttribute('href', '/organizer/rides/ride-1/groups');
  });

  it('saves changes and shows a success message', async () => {
    getRideMock.mockResolvedValue({ ride: baseRide });
    updateRideMock.mockResolvedValue({
      ride: { ...baseRide, title: 'Обновлённое название' },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByDisplayValue(baseRide.title);

    fireEvent.change(screen.getByLabelText('Название'), {
      target: { value: 'Обновлённое название' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Изменения сохранены.')).toBeInTheDocument();
    expect(updateRideMock).toHaveBeenCalledWith(
      'ride-1',
      expect.objectContaining({ title: 'Обновлённое название' }),
    );
  });

  it('saves start coordinates (CR-026)', async () => {
    getRideMock.mockResolvedValue({ ride: baseRide });
    updateRideMock.mockResolvedValue({
      ride: { ...baseRide, startLat: 55.751244, startLng: 37.618423 },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByDisplayValue(baseRide.title);

    fireEvent.change(screen.getByLabelText('Широта старта'), {
      target: { value: '55.751244' },
    });
    fireEvent.change(screen.getByLabelText('Долгота старта'), {
      target: { value: '37.618423' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Изменения сохранены.')).toBeInTheDocument();
    expect(updateRideMock).toHaveBeenCalledWith(
      'ride-1',
      expect.objectContaining({ startLat: 55.751244, startLng: 37.618423 }),
    );
  });

  it('renders a non-draft ride read-only, with no save button', async () => {
    getRideMock.mockResolvedValue({
      ride: { ...baseRide, status: 'published' },
    });

    render(<EditRideForm rideId="ride-1" />);

    expect(
      await screen.findByText('Редактировать можно только черновик заезда.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Сохранить' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Название')).toBeDisabled();
  });

  it('maps a server validation error onto the matching field', async () => {
    getRideMock.mockResolvedValue({ ride: baseRide });
    updateRideMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/validation_error',
        title: 'Validation error',
        status: 400,
        detail: 'The request payload is invalid.',
        instance: '/v1/rides/ride-1',
        code: 'validation_error',
        errors: [{ path: 'title', message: 'Title cannot be empty.' }],
      }),
    );

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByDisplayValue(baseRide.title);
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(
      await screen.findByText('Title cannot be empty.'),
    ).toBeInTheDocument();
  });

  it('publishes a draft ride and shows a success message', async () => {
    getRideMock.mockResolvedValue({ ride: baseRide });
    publishRideMock.mockResolvedValue({
      ride: { ...baseRide, status: 'published' },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByDisplayValue(baseRide.title);

    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));

    expect(await screen.findByText('Заезд опубликован.')).toBeInTheDocument();
    expect(publishRideMock).toHaveBeenCalledWith('ride-1');
    // The form flips to read-only immediately once published.
    expect(
      screen.getByText('Редактировать можно только черновик заезда.'),
    ).toBeInTheDocument();
  });

  it('shows a guiding message when publishing requires email verification', async () => {
    getRideMock.mockResolvedValue({ ride: baseRide });
    publishRideMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/email_verification_required',
        title: 'Email verification required',
        status: 403,
        detail: 'Verify your email before publishing a ride.',
        instance: '/v1/rides/ride-1/publish',
        code: 'email_verification_required',
      }),
    );

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByDisplayValue(baseRide.title);

    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));

    expect(
      await screen.findByText(/Подтвердите email, чтобы опубликовать заезд/),
    ).toBeInTheDocument();
  });

  it('shows no publish button for a non-draft ride', async () => {
    getRideMock.mockResolvedValue({
      ride: { ...baseRide, status: 'published' },
    });

    render(<EditRideForm rideId="ride-1" />);

    await screen.findByText('Редактировать можно только черновик заезда.');
    expect(
      screen.queryByRole('button', { name: 'Опубликовать' }),
    ).not.toBeInTheDocument();
  });

  it('opens registration on a published ride and shows a success message', async () => {
    getRideMock.mockResolvedValue({
      ride: { ...baseRide, status: 'published' },
    });
    openRegistrationMock.mockResolvedValue({
      ride: { ...baseRide, status: 'registration_open' },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByDisplayValue(baseRide.title);

    fireEvent.click(
      screen.getByRole('button', { name: 'Открыть регистрацию' }),
    );

    expect(await screen.findByText('Регистрация открыта.')).toBeInTheDocument();
    expect(openRegistrationMock).toHaveBeenCalledWith('ride-1');
    // The badge/action flips: the open button is gone, the close button appears.
    expect(
      screen.queryByRole('button', { name: 'Открыть регистрацию' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Закрыть регистрацию' }),
    ).toBeInTheDocument();
  });

  it('shows no open-registration button for a draft or registration_open ride', async () => {
    getRideMock.mockResolvedValue({ ride: baseRide });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByDisplayValue(baseRide.title);

    expect(
      screen.queryByRole('button', { name: 'Открыть регистрацию' }),
    ).not.toBeInTheDocument();
  });

  it('closes registration on a registration_open ride and shows a success message', async () => {
    getRideMock.mockResolvedValue({
      ride: { ...baseRide, status: 'registration_open' },
    });
    closeRegistrationMock.mockResolvedValue({
      ride: { ...baseRide, status: 'registration_closed' },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByDisplayValue(baseRide.title);

    fireEvent.click(
      screen.getByRole('button', { name: 'Закрыть регистрацию' }),
    );

    expect(await screen.findByText('Регистрация закрыта.')).toBeInTheDocument();
    expect(closeRegistrationMock).toHaveBeenCalledWith('ride-1');
    expect(
      screen.queryByRole('button', { name: 'Закрыть регистрацию' }),
    ).not.toBeInTheDocument();
  });

  it('shows no close-registration button for a published ride', async () => {
    getRideMock.mockResolvedValue({
      ride: { ...baseRide, status: 'published' },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByDisplayValue(baseRide.title);

    expect(
      screen.queryByRole('button', { name: 'Закрыть регистрацию' }),
    ).not.toBeInTheDocument();
  });

  it.each(['published', 'registration_open', 'registration_closed'] as const)(
    'shows a cancel button for a %s ride',
    async (rideStatus) => {
      getRideMock.mockResolvedValue({
        ride: { ...baseRide, status: rideStatus },
      });

      render(<EditRideForm rideId="ride-1" />);
      await screen.findByDisplayValue(baseRide.title);

      expect(
        screen.getByRole('button', { name: 'Отменить заезд' }),
      ).toBeInTheDocument();
    },
  );

  it('shows no cancel button for a draft ride', async () => {
    getRideMock.mockResolvedValue({ ride: baseRide });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByDisplayValue(baseRide.title);

    expect(
      screen.queryByRole('button', { name: 'Отменить заезд' }),
    ).not.toBeInTheDocument();
  });

  it('does nothing if the cancel confirmation is dismissed', async () => {
    getRideMock.mockResolvedValue({
      ride: { ...baseRide, status: 'published' },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByDisplayValue(baseRide.title);

    fireEvent.click(screen.getByRole('button', { name: 'Отменить заезд' }));

    expect(cancelRideMock).not.toHaveBeenCalled();
  });

  it('cancels a published ride after confirmation and shows a success message', async () => {
    getRideMock.mockResolvedValue({
      ride: { ...baseRide, status: 'published' },
    });
    cancelRideMock.mockResolvedValue({
      ride: { ...baseRide, status: 'cancelled' },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByDisplayValue(baseRide.title);

    fireEvent.click(screen.getByRole('button', { name: 'Отменить заезд' }));

    expect(await screen.findByText('Заезд отменён.')).toBeInTheDocument();
    expect(cancelRideMock).toHaveBeenCalledWith('ride-1');
    expect(
      screen.queryByRole('button', { name: 'Отменить заезд' }),
    ).not.toBeInTheDocument();
  });

  it("shows no cancel button for a started ride (reconfirms CR-021's scope)", async () => {
    getRideMock.mockResolvedValue({
      ride: { ...baseRide, status: 'started' },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByDisplayValue(baseRide.title);

    expect(
      screen.queryByRole('button', { name: 'Отменить заезд' }),
    ).not.toBeInTheDocument();
  });

  it('starts a registration_closed ride and shows a success message', async () => {
    getRideMock.mockResolvedValue({
      ride: { ...baseRide, status: 'registration_closed' },
    });
    startRideMock.mockResolvedValue({
      ride: { ...baseRide, status: 'started' },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByDisplayValue(baseRide.title);

    fireEvent.click(screen.getByRole('button', { name: 'Начать заезд' }));

    expect(await screen.findByText('Заезд начат.')).toBeInTheDocument();
    expect(startRideMock).toHaveBeenCalledWith('ride-1');
    expect(
      screen.queryByRole('button', { name: 'Начать заезд' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Завершить заезд' }),
    ).toBeInTheDocument();
  });

  it('shows no start button for a draft or started ride', async () => {
    getRideMock.mockResolvedValue({ ride: baseRide });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByDisplayValue(baseRide.title);

    expect(
      screen.queryByRole('button', { name: 'Начать заезд' }),
    ).not.toBeInTheDocument();
  });

  it('finishes a started ride and shows a success message', async () => {
    getRideMock.mockResolvedValue({
      ride: { ...baseRide, status: 'started' },
    });
    finishRideMock.mockResolvedValue({
      ride: { ...baseRide, status: 'finished' },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByDisplayValue(baseRide.title);

    fireEvent.click(screen.getByRole('button', { name: 'Завершить заезд' }));

    expect(await screen.findByText('Заезд завершён.')).toBeInTheDocument();
    expect(finishRideMock).toHaveBeenCalledWith('ride-1');
    expect(
      screen.queryByRole('button', { name: 'Завершить заезд' }),
    ).not.toBeInTheDocument();
  });

  it('shows no finish button for a registration_closed or finished ride', async () => {
    getRideMock.mockResolvedValue({
      ride: { ...baseRide, status: 'registration_closed' },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByDisplayValue(baseRide.title);

    expect(
      screen.queryByRole('button', { name: 'Завершить заезд' }),
    ).not.toBeInTheDocument();
  });
});

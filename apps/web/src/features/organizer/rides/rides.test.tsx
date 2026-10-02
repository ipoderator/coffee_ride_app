import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ride } from 'types';
import { CreateRideForm } from './components/CreateRideForm';
import { RidesList } from './components/RidesList';
import { EditRideForm as EditRideTab } from './components/EditRideForm';
import { RideWorkspace } from './components/RideWorkspace';
import { RideWizardFrame } from './components/RideWizardFrame';
import { RideWizardSteps } from './components/RideWizardSteps';
import { isWizardMode, wizardStepHref } from './wizard-steps';
import { ORGANIZER_RIDE_SECTIONS } from '@/lib/cabinet/organizer-ride-sections';
import type { RideSectionLink } from '@/lib/cabinet/types';
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
  setParticipantsVisibility,
  setRideContact,
  startRide,
  updateRide,
  uploadRideGpx,
} from './api';

const routerPushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock, replace: vi.fn() }),
}));

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
    setParticipantsVisibility: vi.fn(),
    setRideContact: vi.fn(),
    uploadRideGpx: vi.fn(),
    // CR-187: the workspace's «последнее обновление» line.
    getLatestRideUpdate: vi.fn().mockResolvedValue(null),
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
const uploadRideGpxMock = vi.mocked(uploadRideGpx);
const setParticipantsVisibilityMock = vi.mocked(setParticipantsVisibility);
const setRideContactMock = vi.mocked(setRideContact);

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
  // CR-157: «Дата» is a calendar popover now. The CreateRideForm tests pin
  // «today» to 2027-04-20, so 1 May 2027 is one month ahead.
  fireEvent.click(screen.getByLabelText('Дата'));
  fireEvent.click(screen.getByRole('button', { name: 'Следующий месяц' }));
  fireEvent.click(screen.getByRole('button', { name: 'Сб, 1 мая 2027' }));
  fireEvent.change(screen.getByLabelText('Время старта'), {
    target: { value: '08:00' },
  });
}

describe('CreateRideForm', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    // Only `Date` is faked — `waitFor`/`findBy*` still need real timers.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-04-20T12:00:00'));
    createRideMock.mockReset();
    updateRideMock.mockReset();
    getRideMock.mockReset();
    uploadRideGpxMock.mockReset();
    routerPushMock.mockReset();
    window.history.replaceState(null, '', '/organizer/rides/new');
  });

  it('shows client-side validation errors without calling the API', async () => {
    render(<CreateRideForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Далее: маршрут' }));

    expect(await screen.findByText('Укажите дату старта.')).toBeInTheDocument();
    expect(screen.getByText('Укажите время старта.')).toBeInTheDocument();
    expect(createRideMock).not.toHaveBeenCalled();
  });

  it('creates the draft in one request, then moves to the route step', async () => {
    createRideMock.mockResolvedValue({ ride: baseRide });

    render(<CreateRideForm />);
    fillMinimalValidForm();
    fireEvent.change(screen.getByLabelText('Сложность'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('Описание'), {
      target: { value: '  Спокойный круг с кофе.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Далее: маршрут' }));

    await waitFor(() =>
      expect(routerPushMock).toHaveBeenCalledWith(
        '/organizer/rides/ride-1/route?wizard=1',
      ),
    );
    // The default timezone (Europe/Moscow) converts 08:00 local to 05:00 UTC.
    expect(createRideMock).toHaveBeenCalledWith({
      title: 'Утренний гравийный заезд',
      bicycleType: 'gravel',
      startsAt: '2027-05-01T05:00:00.000Z',
      startTimezone: 'Europe/Moscow',
      description: 'Спокойный круг с кофе.',
      difficulty: 2,
    });
    expect(window.location.search).toBe('?ride=ride-1');
    expect(uploadRideGpxMock).not.toHaveBeenCalled();
  });

  it('«Сохранить черновик» stays on step 1, and a second save updates instead of creating', async () => {
    createRideMock.mockResolvedValue({ ride: baseRide });
    updateRideMock.mockResolvedValue({ ride: baseRide, requirements: [] });

    render(<CreateRideForm />);
    fillMinimalValidForm();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }));

    expect(
      await screen.findByText(/^Черновик сохранён в \d{2}:\d{2}$/),
    ).toBeInTheDocument();
    expect(routerPushMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
    await waitFor(() => expect(updateRideMock).toHaveBeenCalledOnce());
    expect(updateRideMock).toHaveBeenCalledWith(
      'ride-1',
      expect.objectContaining({ title: 'Утренний гравийный заезд' }),
    );
    expect(createRideMock).toHaveBeenCalledOnce();
  });

  it('uploads a chosen GPX after saving; a failed upload keeps the draft and stays put', async () => {
    createRideMock.mockResolvedValue({ ride: baseRide });
    uploadRideGpxMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/gpx_invalid',
        title: 'Invalid GPX',
        status: 400,
        detail: 'Not a GPX file.',
        instance: '/v1/rides/ride-1/route',
        code: 'gpx_invalid',
      }),
    );

    const { container } = render(<CreateRideForm />);
    fillMinimalValidForm();
    const file = new File(['<gpx></gpx>'], 'krug.gpx', {
      type: 'application/gpx+xml',
    });
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    });
    expect(screen.getByText('Выбран файл «krug.gpx»')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Далее: маршрут' }));

    expect(
      await screen.findByText(
        'Черновик сохранён, но GPX не загрузился: Файл не распознан как корректный GPX-трек.',
      ),
    ).toBeInTheDocument();
    expect(uploadRideGpxMock).toHaveBeenCalledWith('ride-1', file);
    expect(routerPushMock).not.toHaveBeenCalled();
  });

  it('rejects a non-GPX file before any request', () => {
    const { container } = render(<CreateRideForm />);
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(['x'], 'photo.jpg')] },
    });
    expect(screen.getByText('Нужен файл в формате GPX.')).toBeInTheDocument();
  });

  it('prefills an existing draft from ?ride= and saves it with PATCH', async () => {
    getRideMock.mockResolvedValue({
      ride: { ...baseRide, difficulty: 3, description: 'Круг по центру' },
      isOwner: true,
      requirements: [],
    });
    updateRideMock.mockResolvedValue({ ride: baseRide, requirements: [] });

    render(<CreateRideForm rideId="ride-1" />);

    expect(
      await screen.findByDisplayValue('Утренний гравийный заезд'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Дата')).toHaveTextContent('Сб, 1 мая 2027');
    expect(screen.getByLabelText('Время старта')).toHaveValue('08:00');
    expect(screen.getByLabelText('Сложность')).toHaveValue('3');
    expect(screen.getByLabelText('Описание')).toHaveValue('Круг по центру');

    fireEvent.click(screen.getByRole('button', { name: 'Далее: маршрут' }));
    await waitFor(() =>
      expect(updateRideMock).toHaveBeenCalledWith('ride-1', {
        title: 'Утренний гравийный заезд',
        bicycleType: 'gravel',
        startsAt: '2027-05-01T05:00:00.000Z',
        startTimezone: 'Europe/Moscow',
        description: 'Круг по центру',
        difficulty: 3,
      }),
    );
    expect(createRideMock).not.toHaveBeenCalled();
  });

  it('shows an error state for a draft the caller does not own', async () => {
    getRideMock.mockResolvedValue({
      ride: baseRide,
      isOwner: false,
      requirements: [],
    });

    render(<CreateRideForm rideId="ride-1" />);

    expect(
      await screen.findByText(
        'Не удалось загрузить черновик. Попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();
  });

  it('ignores a second submit while a request is already pending', async () => {
    createRideMock.mockReturnValue(new Promise(() => {}));

    render(<CreateRideForm />);
    fillMinimalValidForm();
    fireEvent.click(screen.getByRole('button', { name: 'Далее: маршрут' }));

    const pendingButton = await screen.findByRole('button', {
      name: 'Сохранение…',
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
    fireEvent.click(screen.getByRole('button', { name: 'Далее: маршрут' }));

    expect(
      await screen.findByText(
        /Чтобы создать заезд, сначала создайте профиль организатора/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Создать профиль организатора' }),
    ).toHaveAttribute('href', '/organizer/profile');
    expect(routerPushMock).not.toHaveBeenCalled();
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
    fireEvent.click(screen.getByRole('button', { name: 'Далее: маршрут' }));

    expect(
      await screen.findByText('Title cannot be empty.'),
    ).toBeInTheDocument();
  });
});

describe('ride wizard (CR-156)', () => {
  it('locks steps 2–4 until a draft exists', () => {
    render(<RideWizardSteps current="basics" rideId={null} />);

    expect(screen.getByText('Новый заезд · шаг 1 из 4')).toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(
      screen.getByText('Основное').closest('[aria-current="step"]'),
    ).not.toBeNull();
  });

  it('links every other step once the draft exists', () => {
    render(<RideWizardSteps current="groups" rideId="ride-1" />);

    expect(screen.getByText('Новый заезд · шаг 3 из 4')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Основное/ })).toHaveAttribute(
      'href',
      '/organizer/rides/new?ride=ride-1',
    );
    expect(screen.getByRole('link', { name: /Маршрут/ })).toHaveAttribute(
      'href',
      '/organizer/rides/ride-1/route?wizard=1',
    );
    expect(screen.getByRole('link', { name: /Публикация/ })).toHaveAttribute(
      'href',
      '/organizer/rides/ride-1/edit?wizard=1',
    );
    expect(
      screen.queryByRole('link', { name: /Группы и места/ }),
    ).not.toBeInTheDocument();
  });

  it('renders back/next links around a wrapped screen', () => {
    render(
      <RideWizardFrame
        current="route"
        rideId="ride-1"
        back={{ step: 'basics', label: 'Назад' }}
        next={{ step: 'groups', label: 'Далее: группы и места' }}
      >
        <p>Экран маршрута</p>
      </RideWizardFrame>,
    );

    expect(screen.getByText('Экран маршрута')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Назад' })).toHaveAttribute(
      'href',
      '/organizer/rides/new?ride=ride-1',
    );
    expect(
      screen.getByRole('link', { name: 'Далее: группы и места' }),
    ).toHaveAttribute('href', '/organizer/rides/ride-1/groups?wizard=1');
  });

  it('parses the wizard query flag and builds step hrefs', () => {
    expect(isWizardMode('1')).toBe(true);
    expect(isWizardMode(undefined)).toBe(false);
    expect(isWizardMode(['1'])).toBe(false);
    expect(wizardStepHref('publish', 'ride-1')).toBe(
      '/organizer/rides/ride-1/edit?wizard=1',
    );
  });
});

describe('RidesList', () => {
  beforeEach(() => {
    listMyRidesMock.mockReset();
  });

  it('shows an empty state with a working create link when there are no rides', async () => {
    listMyRidesMock.mockResolvedValue({ items: [], nextCursor: null });

    render(<RidesList />);

    expect(await screen.findByText('Здесь пока тихо')).toBeInTheDocument();
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
    // baseRide starts in 2027 — nothing is overdue here.
    expect(screen.queryByText('Требует решения')).not.toBeInTheDocument();
  });

  // CR-184: a past start left before `started` is marked, its status untouched.
  it('marks a ride whose start passed without being started', async () => {
    listMyRidesMock.mockResolvedValue({
      items: [
        {
          ...baseRide,
          id: 'ride-late',
          title: 'Утро на Лосином острове',
          status: 'registration_open',
          startsAt: '2020-10-01T05:00:00.000Z',
        },
        {
          ...baseRide,
          id: 'ride-done',
          title: 'Прошедший заезд',
          status: 'finished',
          startsAt: '2020-09-01T05:00:00.000Z',
        },
      ],
      nextCursor: null,
    });

    render(<RidesList />);

    const late = await screen.findByRole('link', {
      name: /Утро на Лосином острове/,
    });
    expect(late).toHaveTextContent('Регистрация открыта');
    expect(late).toHaveTextContent('Требует решения');
    expect(late).toHaveTextContent('Время старта прошло, а заезд не начат');
    expect(
      screen.getByRole('link', { name: /Прошедший заезд/ }),
    ).not.toHaveTextContent('Требует решения');
  });
});

/** CR-187: the overview tab renders inside the ride workspace, which owns the
 * ride read and the lifecycle steps — the page's composition. */
function EditRideForm({
  rideId,
  sections = [],
}: {
  rideId: string;
  sections?: readonly RideSectionLink[];
}) {
  return (
    <RideWorkspace rideId={rideId} current="edit" sections={sections}>
      <EditRideTab />
    </RideWorkspace>
  );
}

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

  // KI-069: `GET /v1/rides/:id` is also the public ride-detail endpoint
  // (CR-023), so a non-owner's request for a published ride answers 200, not
  // 404 — the same not-found state must render anyway, keyed off `isOwner`,
  // instead of the edit form/lifecycle controls for a ride that isn't theirs.
  it("shows a not-found state for a published ride the caller doesn't own", async () => {
    getRideMock.mockResolvedValue({
      ride: baseRide,
      isOwner: false,
      requirements: [],
    });

    render(<EditRideForm rideId="ride-1" />);

    expect(await screen.findByText('Заезд не найден')).toBeInTheDocument();
    expect(screen.queryByDisplayValue(baseRide.title)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Сохранить' }),
    ).not.toBeInTheDocument();
  });

  it('prefills the form from the loaded ride, including the local start time', async () => {
    getRideMock.mockResolvedValue({
      ride: baseRide,
      isOwner: true,
      requirements: [],
    });

    render(<EditRideForm rideId="ride-1" />);

    expect(await screen.findByDisplayValue(baseRide.title)).toBeInTheDocument();
    // startsAt is 05:00 UTC; the ride's own zone is Europe/Moscow (UTC+3).
    expect(screen.getByDisplayValue('2027-05-01T08:00')).toBeInTheDocument();
  });

  // CR-187: the six local tabs — «Обзор» plus the registry, in its order.
  it('shows «Обзор» and every registered ride sub-page as tabs (CR-187, KI-061)', async () => {
    getRideMock.mockResolvedValue({
      ride: baseRide,
      isOwner: true,
      requirements: [],
    });

    render(<EditRideForm rideId="ride-1" sections={ORGANIZER_RIDE_SECTIONS} />);

    const tabs = await screen.findByRole('navigation', {
      name: 'Разделы заезда',
    });
    expect(within(tabs).getByRole('link', { name: 'Обзор' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const hrefs = within(tabs)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual([
      '/organizer/rides/ride-1/edit',
      '/organizer/rides/ride-1/route',
      '/organizer/rides/ride-1/cover',
      '/organizer/rides/ride-1/groups',
      '/organizer/rides/ride-1/participants',
      '/organizer/rides/ride-1/updates',
    ]);
  });

  // CR-187: «Перед стартом» says each section's concrete state, and links
  // only where there is a doable step.
  it('lists each section with its concrete state on the overview (CR-187)', async () => {
    getRideMock.mockResolvedValue({
      ride: { ...baseRide, status: 'registration_open', participantLimit: 15 },
      isOwner: true,
      requirements: [],
      registrationsCount: 5,
      waitlistCount: 0,
      groups: [
        {
          id: 'g1',
          name: 'Лайт',
          paceKmh: 18,
          description: null,
          position: 0,
          registrationsCount: 2,
        },
      ],
    });

    render(<EditRideForm rideId="ride-1" sections={ORGANIZER_RIDE_SECTIONS} />);

    const list = await screen.findByRole('list', { name: 'Перед стартом' });
    expect(within(list).getByText('Без трека')).toBeInTheDocument();
    expect(within(list).getByText('Без обложки')).toBeInTheDocument();
    expect(within(list).getByText('1 группа по темпу')).toBeInTheDocument();
    expect(
      within(list).getByText('5 участников записались'),
    ).toBeInTheDocument();
    expect(
      within(list).getByText('Свободно 10 из 15 · лист ожидания: 0'),
    ).toBeInTheDocument();
    expect(within(list).getByText('Обновлений пока нет')).toBeInTheDocument();
    // No cover and none can be added after publish: no link on that row.
    expect(
      within(list).queryByRole('link', { name: 'Посмотреть — Обложка' }),
    ).not.toBeInTheDocument();
    expect(
      within(list).getByRole('link', { name: 'Настроить — Группы' }),
    ).toHaveAttribute('href', '/organizer/rides/ride-1/groups');
  });

  it('saves changes and shows a success message', async () => {
    getRideMock.mockResolvedValue({
      ride: baseRide,
      isOwner: true,
      requirements: [],
    });
    updateRideMock.mockResolvedValue({
      ride: { ...baseRide, title: 'Обновлённое название' },
      requirements: [],
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });

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

  it('edits requirements one per line (CR-155)', async () => {
    getRideMock.mockResolvedValue({
      ride: baseRide,
      isOwner: true,
      requirements: ['Шлем обязателен'],
    });
    updateRideMock.mockResolvedValue({
      ride: baseRide,
      requirements: ['Шлем обязателен', 'С собой: вода'],
    });

    render(<EditRideForm rideId="ride-1" />);
    const field = await screen.findByLabelText('Требования');
    expect(field).toHaveValue('Шлем обязателен');

    fireEvent.change(field, {
      target: { value: 'Шлем обязателен\n\n  С собой: вода  \n' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Изменения сохранены.')).toBeInTheDocument();
    expect(updateRideMock).toHaveBeenCalledWith(
      'ride-1',
      expect.objectContaining({
        requirements: ['Шлем обязателен', 'С собой: вода'],
      }),
    );
    expect(field).toHaveValue('Шлем обязателен\nС собой: вода');
  });

  it('saves start coordinates (CR-026)', async () => {
    getRideMock.mockResolvedValue({
      ride: baseRide,
      isOwner: true,
      requirements: [],
    });
    updateRideMock.mockResolvedValue({
      ride: { ...baseRide, startLat: 55.751244, startLng: 37.618423 },
      requirements: [],
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });

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

  // CR-184: a published ride is managed, not shown as a locked form.
  it('opens a non-draft ride as «Управление заездом», with no form fields', async () => {
    getRideMock.mockResolvedValue({
      isOwner: true,
      requirements: [],
      registrationsCount: 7,
      ride: {
        ...baseRide,
        status: 'published',
        participantLimit: 20,
        distanceKm: 42,
      },
    });

    render(
      <EditRideForm
        rideId="ride-1"
        sections={[{ segment: 'participants', label: 'Участники', order: 40 }]}
      />,
    );

    // CR-187: the title is the page heading, «Управление заездом» its label.
    expect(
      await screen.findByRole('heading', { level: 1, name: baseRide.title }),
    ).toBeInTheDocument();
    expect(screen.getByText('Управление заездом')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Перед стартом' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Следующий шаг' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Откройте регистрацию, чтобы участники могли записаться.',
      ),
    ).toBeInTheDocument();
    // The next step comes before the editable settings in document order.
    const next = screen.getByRole('button', { name: 'Открыть регистрацию' });
    const contactSave = screen.getByRole('button', {
      name: 'Сохранить способ связи',
    });
    expect(
      next.compareDocumentPosition(contactSave) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByText('7 из 20 занято · лист ожидания: 0'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Участники · 7' })).toHaveAttribute(
      'href',
      '/organizer/rides/ride-1/participants',
    );
    expect(screen.getByText('42,0 км')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Участники' }).getAttribute('href'),
    ).toBe('/organizer/rides/ride-1/participants');
    expect(screen.queryByLabelText('Название')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Сохранить' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('overdue-start')).not.toBeInTheDocument();
  });

  it('keeps the draft form under «Редактирование заезда»', async () => {
    getRideMock.mockResolvedValue({
      ride: baseRide,
      isOwner: true,
      requirements: [],
    });

    render(<EditRideForm rideId="ride-1" />);

    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Редактирование заезда',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Подготовка заезда')).toBeInTheDocument();
    expect(screen.getByLabelText('Название')).toBeEnabled();
  });

  it('flags a past start that was never started, without changing it', async () => {
    getRideMock.mockResolvedValue({
      isOwner: true,
      requirements: [],
      ride: {
        ...baseRide,
        status: 'registration_open',
        startsAt: '2020-10-01T05:00:00.000Z',
      },
    });

    render(<EditRideForm rideId="ride-1" />);

    expect(await screen.findByTestId('overdue-start')).toHaveTextContent(
      /Время старта прошло .* Статус сам не изменится/,
    );
    expect(
      screen.getByRole('button', { name: 'Закрыть регистрацию' }),
    ).toBeInTheDocument();
    expect(closeRegistrationMock).not.toHaveBeenCalled();
  });

  it('maps a server validation error onto the matching field', async () => {
    getRideMock.mockResolvedValue({
      ride: baseRide,
      isOwner: true,
      requirements: [],
    });
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
    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(
      await screen.findByText('Title cannot be empty.'),
    ).toBeInTheDocument();
  });

  it('publishes a draft ride and shows a success message', async () => {
    getRideMock.mockResolvedValue({
      ride: baseRide,
      isOwner: true,
      requirements: [],
    });
    publishRideMock.mockResolvedValue({
      ride: { ...baseRide, status: 'published' },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));

    expect(await screen.findByText('Заезд опубликован.')).toBeInTheDocument();
    expect(publishRideMock).toHaveBeenCalledWith('ride-1');
    // The screen flips to the management view immediately once published.
    expect(
      screen.getByRole('heading', { level: 2, name: 'Перед стартом' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Открыть регистрацию' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Название')).not.toBeInTheDocument();
  });

  it('shows a guiding message when publishing requires email verification', async () => {
    getRideMock.mockResolvedValue({
      ride: baseRide,
      isOwner: true,
      requirements: [],
    });
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
    await screen.findByRole('heading', { level: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));

    expect(
      await screen.findByText(/Подтвердите email, чтобы опубликовать заезд/),
    ).toBeInTheDocument();
  });

  it('shows no publish button for a non-draft ride', async () => {
    getRideMock.mockResolvedValue({
      isOwner: true,
      requirements: [],
      ride: { ...baseRide, status: 'published' },
    });

    render(<EditRideForm rideId="ride-1" />);

    await screen.findByText('Управление заездом');
    expect(
      screen.queryByRole('button', { name: 'Опубликовать' }),
    ).not.toBeInTheDocument();
  });

  it('opens registration on a published ride and shows a success message', async () => {
    getRideMock.mockResolvedValue({
      isOwner: true,
      requirements: [],
      ride: { ...baseRide, status: 'published' },
    });
    openRegistrationMock.mockResolvedValue({
      ride: { ...baseRide, status: 'registration_open' },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });

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
    getRideMock.mockResolvedValue({
      ride: baseRide,
      isOwner: true,
      requirements: [],
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });

    expect(
      screen.queryByRole('button', { name: 'Открыть регистрацию' }),
    ).not.toBeInTheDocument();
  });

  it('closes registration on a registration_open ride and shows a success message', async () => {
    getRideMock.mockResolvedValue({
      isOwner: true,
      requirements: [],
      ride: { ...baseRide, status: 'registration_open' },
    });
    closeRegistrationMock.mockResolvedValue({
      ride: { ...baseRide, status: 'registration_closed' },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });

    fireEvent.click(
      screen.getByRole('button', { name: 'Закрыть регистрацию' }),
    );

    expect(await screen.findByText('Регистрация закрыта.')).toBeInTheDocument();
    expect(closeRegistrationMock).toHaveBeenCalledWith('ride-1');
    expect(
      screen.queryByRole('button', { name: 'Закрыть регистрацию' }),
    ).not.toBeInTheDocument();
  });

  // KI-065: after publish the riders-list toggle saves on its own.
  it('hides the riders list of a published ride right away', async () => {
    getRideMock.mockResolvedValue({
      isOwner: true,
      requirements: [],
      ride: { ...baseRide, status: 'registration_open' },
    });
    setParticipantsVisibilityMock.mockResolvedValue({
      ride: {
        ...baseRide,
        status: 'registration_open',
        participantsVisible: false,
      },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });
    const toggle = screen.getByLabelText('Показывать список участников');
    expect(toggle).toBeEnabled();

    fireEvent.click(toggle);

    expect(
      await screen.findByText('Видимость списка участников сохранена.'),
    ).toBeInTheDocument();
    expect(setParticipantsVisibilityMock).toHaveBeenCalledWith('ride-1', false);
    expect(toggle).not.toBeChecked();
    expect(updateRideMock).not.toHaveBeenCalled();
  });

  it('explains why a hidden list with registrations cannot be shown again', async () => {
    getRideMock.mockResolvedValue({
      isOwner: true,
      requirements: [],
      ride: {
        ...baseRide,
        status: 'registration_open',
        participantsVisible: false,
      },
    });
    setParticipantsVisibilityMock.mockRejectedValue(
      new ApiError({
        type: 'about:blank',
        title: 'Participants list can no longer be shown',
        status: 409,
        detail: 'The list was hidden when people registered.',
        instance: '/v1/rides/ride-1/participants-visibility',
        code: 'participants_visibility_locked',
      }),
    );

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });
    const toggle = screen.getByLabelText('Показывать список участников');

    fireEvent.click(toggle);

    expect(
      await screen.findByText(
        'Люди записались, когда список был скрыт, поэтому показать его уже нельзя.',
      ),
    ).toBeInTheDocument();
    expect(toggle).not.toBeChecked();
  });

  it('keeps the riders-list toggle in the draft form until «Сохранить»', async () => {
    getRideMock.mockResolvedValue({
      isOwner: true,
      requirements: [],
      ride: baseRide,
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });
    const toggle = screen.getByLabelText('Показывать список участников');

    fireEvent.click(toggle);

    expect(toggle).not.toBeChecked();
    expect(setParticipantsVisibilityMock).not.toHaveBeenCalled();
  });

  // KI-081: the contact is the one field that survives the read-only flip.
  it('saves the contact of a published ride with its own request', async () => {
    getRideMock.mockResolvedValue({
      isOwner: true,
      requirements: [],
      ride: { ...baseRide, status: 'registration_open' },
      contact: { type: 'phone', value: '+79161234567' },
    });
    setRideContactMock.mockResolvedValue({
      ride: { ...baseRide, status: 'registration_open' },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });

    // The rest of the ride is not editable — the rule is not loosened.
    expect(screen.queryByLabelText('Название')).not.toBeInTheDocument();

    const value = screen.getByLabelText('Контакт');
    expect(value).toBeEnabled();
    fireEvent.change(value, { target: { value: '+7 916 765-43-21' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Сохранить способ связи' }),
    );

    expect(
      await screen.findByText('Способ связи сохранён.'),
    ).toBeInTheDocument();
    // Normalized by `setRideContactRequestSchema` before it goes out, the same
    // canonical form the draft path sends.
    expect(setRideContactMock).toHaveBeenCalledWith('ride-1', {
      type: 'phone',
      value: '+79167654321',
    });
    // Not the whole-form path.
    expect(updateRideMock).not.toHaveBeenCalled();
  });

  it('clears the contact of a published ride', async () => {
    getRideMock.mockResolvedValue({
      isOwner: true,
      requirements: [],
      ride: { ...baseRide, status: 'published' },
      contact: { type: 'telegram', value: 'coffee_ride' },
    });
    setRideContactMock.mockResolvedValue({
      ride: { ...baseRide, status: 'published' },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });

    fireEvent.change(screen.getByLabelText('Как связаться'), {
      target: { value: '' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Сохранить способ связи' }),
    );

    expect(
      await screen.findByText('Способ связи сохранён.'),
    ).toBeInTheDocument();
    expect(setRideContactMock).toHaveBeenCalledWith('ride-1', null);
  });

  it('rejects an invalid published-ride contact before calling the API', async () => {
    getRideMock.mockResolvedValue({
      isOwner: true,
      requirements: [],
      ride: { ...baseRide, status: 'published' },
      contact: { type: 'phone', value: '+79161234567' },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });

    fireEvent.change(screen.getByLabelText('Контакт'), {
      target: { value: 'не телефон' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Сохранить способ связи' }),
    );

    expect(
      await screen.findByText(
        'Enter a valid Russian phone number, e.g. +7 916 123-45-67.',
      ),
    ).toBeInTheDocument();
    expect(setRideContactMock).not.toHaveBeenCalled();
  });

  it('shows a server error when saving a published-ride contact fails', async () => {
    getRideMock.mockResolvedValue({
      isOwner: true,
      requirements: [],
      ride: { ...baseRide, status: 'published' },
      contact: { type: 'phone', value: '+79161234567' },
    });
    setRideContactMock.mockRejectedValue(
      new ApiError({
        type: 'about:blank',
        title: 'Ride not found',
        status: 404,
        detail: 'Ride not found.',
        instance: '/v1/rides/ride-1/contact',
        code: 'ride_not_found',
      }),
    );

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });

    fireEvent.click(
      screen.getByRole('button', { name: 'Сохранить способ связи' }),
    );

    expect(
      await screen.findByText(
        'Не удалось сохранить способ связи. Попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();
  });

  it('keeps the draft contact on the whole-form save path', async () => {
    getRideMock.mockResolvedValue({
      isOwner: true,
      requirements: [],
      ride: baseRide,
      contact: { type: 'phone', value: '+79161234567' },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });

    // No second save path while the ride is a draft.
    expect(
      screen.queryByRole('button', { name: 'Сохранить способ связи' }),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Контакт'), {
      target: { value: '+7 916 765-43-21' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(updateRideMock).toHaveBeenCalled());
    // `updateRideRequestSchema` normalizes the number on the way out, the same
    // as the published-ride path's own schema parse.
    expect(updateRideMock.mock.calls[0]?.[1]).toMatchObject({
      contact: { type: 'phone', value: '+79167654321' },
    });
    expect(setRideContactMock).not.toHaveBeenCalled();
  });

  it('shows no close-registration button for a published ride', async () => {
    getRideMock.mockResolvedValue({
      isOwner: true,
      requirements: [],
      ride: { ...baseRide, status: 'published' },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });

    expect(
      screen.queryByRole('button', { name: 'Закрыть регистрацию' }),
    ).not.toBeInTheDocument();
  });

  it.each(['published', 'registration_open', 'registration_closed'] as const)(
    'shows a cancel button for a %s ride',
    async (rideStatus) => {
      getRideMock.mockResolvedValue({
        isOwner: true,
        requirements: [],
        ride: { ...baseRide, status: rideStatus },
      });

      render(<EditRideForm rideId="ride-1" />);
      await screen.findByRole('heading', { level: 1 });

      expect(
        screen.getByRole('button', { name: 'Отменить заезд' }),
      ).toBeInTheDocument();
    },
  );

  it('shows no cancel button for a draft ride', async () => {
    getRideMock.mockResolvedValue({
      ride: baseRide,
      isOwner: true,
      requirements: [],
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });

    expect(
      screen.queryByRole('button', { name: 'Отменить заезд' }),
    ).not.toBeInTheDocument();
  });

  it('does nothing if the cancel confirmation is dismissed', async () => {
    getRideMock.mockResolvedValue({
      isOwner: true,
      requirements: [],
      ride: { ...baseRide, status: 'published' },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Отменить заезд' }));

    expect(cancelRideMock).not.toHaveBeenCalled();
  });

  it('cancels a published ride after confirmation and shows a success message', async () => {
    getRideMock.mockResolvedValue({
      isOwner: true,
      requirements: [],
      ride: { ...baseRide, status: 'published' },
    });
    cancelRideMock.mockResolvedValue({
      ride: { ...baseRide, status: 'cancelled' },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Отменить заезд' }));

    expect(await screen.findByText('Заезд отменён.')).toBeInTheDocument();
    expect(cancelRideMock).toHaveBeenCalledWith('ride-1');
    expect(
      screen.queryByRole('button', { name: 'Отменить заезд' }),
    ).not.toBeInTheDocument();
  });

  it("shows no cancel button for a started ride (reconfirms CR-021's scope)", async () => {
    getRideMock.mockResolvedValue({
      isOwner: true,
      requirements: [],
      ride: { ...baseRide, status: 'started' },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });

    expect(
      screen.queryByRole('button', { name: 'Отменить заезд' }),
    ).not.toBeInTheDocument();
  });

  it('starts a registration_closed ride and shows a success message', async () => {
    // The workspace re-reads the ride after the start (CR-182's counts).
    getRideMock
      .mockResolvedValueOnce({
        isOwner: true,
        requirements: [],
        ride: { ...baseRide, status: 'registration_closed' },
      })
      .mockResolvedValue({
        isOwner: true,
        requirements: [],
        ride: { ...baseRide, status: 'started' },
      });
    startRideMock.mockResolvedValue({
      ride: { ...baseRide, status: 'started' },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });

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
    getRideMock.mockResolvedValue({
      ride: baseRide,
      isOwner: true,
      requirements: [],
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });

    expect(
      screen.queryByRole('button', { name: 'Начать заезд' }),
    ).not.toBeInTheDocument();
  });

  it('finishes a started ride and shows a success message', async () => {
    getRideMock.mockResolvedValue({
      isOwner: true,
      requirements: [],
      ride: { ...baseRide, status: 'started' },
    });
    finishRideMock.mockResolvedValue({
      ride: { ...baseRide, status: 'finished' },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Завершить заезд' }));

    expect(await screen.findByText('Заезд завершён.')).toBeInTheDocument();
    expect(finishRideMock).toHaveBeenCalledWith('ride-1');
    expect(
      screen.queryByRole('button', { name: 'Завершить заезд' }),
    ).not.toBeInTheDocument();
  });

  it('warns before finishing with undecided riders, still allows it, and keeps the note (CR-182)', async () => {
    getRideMock.mockResolvedValue({
      isOwner: true,
      requirements: [],
      ride: { ...baseRide, status: 'started' },
      attendanceSummary: { finished: 3, dnf: 0, noShow: 0, unresolved: 2 },
    });
    finishRideMock.mockResolvedValue({
      ride: { ...baseRide, status: 'finished' },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });

    expect(screen.getByTestId('unresolved-before-finish')).toHaveTextContent(
      'У 2 участников нет итогового статуса',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Завершить заезд' }));

    // CR-185: a confirmation naming the count comes first; nothing is sent
    // until it is confirmed.
    const dialog = await screen.findByRole('dialog', {
      name: 'Завершить заезд?',
    });
    expect(dialog).toHaveTextContent('У 2 участников нет итогового статуса');
    expect(finishRideMock).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Завершить' }));

    expect(
      await screen.findByText(/Заезд завершён, но у 2 участников/),
    ).toBeInTheDocument();
    expect(finishRideMock).toHaveBeenCalledWith('ride-1');
    expect(screen.queryByText('Заезд завершён.')).not.toBeInTheDocument();
  });

  it('backs out of finishing from the confirmation without a request (CR-185)', async () => {
    getRideMock.mockResolvedValue({
      isOwner: true,
      requirements: [],
      ride: { ...baseRide, status: 'started' },
      attendanceSummary: { finished: 3, dnf: 0, noShow: 0, unresolved: 1 },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Завершить заезд' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('У 1 участника нет итогового статуса');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Вернуться' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(finishRideMock).not.toHaveBeenCalled();
  });

  it('asks before finishing a ride started on the same page (CR-185)', async () => {
    getRideMock
      .mockResolvedValueOnce({
        isOwner: true,
        requirements: [],
        ride: { ...baseRide, status: 'registration_closed' },
        attendanceSummary: null,
      })
      .mockResolvedValue({
        isOwner: true,
        requirements: [],
        ride: { ...baseRide, status: 'started' },
        attendanceSummary: { finished: 0, dnf: 0, noShow: 0, unresolved: 4 },
      });
    startRideMock.mockResolvedValue({
      ride: { ...baseRide, status: 'started' },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Начать заезд' }));
    expect(
      await screen.findByTestId('unresolved-before-finish'),
    ).toHaveTextContent('У 4 участников');

    fireEvent.click(screen.getByRole('button', { name: 'Завершить заезд' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('У 4 участников нет итогового статуса');
    expect(finishRideMock).not.toHaveBeenCalled();
  });

  it('finishes without asking once the fresh count reaches zero (CR-185)', async () => {
    getRideMock
      .mockResolvedValueOnce({
        isOwner: true,
        requirements: [],
        ride: { ...baseRide, status: 'started' },
        attendanceSummary: { finished: 2, dnf: 0, noShow: 0, unresolved: 1 },
      })
      .mockResolvedValue({
        isOwner: true,
        requirements: [],
        ride: { ...baseRide, status: 'started' },
        attendanceSummary: { finished: 3, dnf: 0, noShow: 0, unresolved: 0 },
      });
    finishRideMock.mockResolvedValue({
      ride: { ...baseRide, status: 'finished' },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Завершить заезд' }));

    expect(await screen.findByText('Заезд завершён.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows no unresolved warning when every rider has a status', async () => {
    getRideMock.mockResolvedValue({
      isOwner: true,
      requirements: [],
      ride: { ...baseRide, status: 'started' },
      attendanceSummary: { finished: 3, dnf: 1, noShow: 0, unresolved: 0 },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });

    expect(
      screen.queryByTestId('unresolved-before-finish'),
    ).not.toBeInTheDocument();
  });

  it('shows no finish button for a registration_closed or finished ride', async () => {
    getRideMock.mockResolvedValue({
      isOwner: true,
      requirements: [],
      ride: { ...baseRide, status: 'registration_closed' },
    });

    render(<EditRideForm rideId="ride-1" />);
    await screen.findByRole('heading', { level: 1 });

    expect(
      screen.queryByRole('button', { name: 'Завершить заезд' }),
    ).not.toBeInTheDocument();
  });
});

describe('RideWorkspace (CR-187)', () => {
  beforeEach(() => {
    getRideMock.mockReset();
  });

  it('puts the actions in priority order while registration is open', async () => {
    getRideMock.mockResolvedValue({
      isOwner: true,
      requirements: [],
      registrationsCount: 5,
      ride: { ...baseRide, status: 'registration_open' },
    });

    render(
      <RideWorkspace rideId="ride-1" current="edit" sections={[]}>
        <p>Раздел</p>
      </RideWorkspace>,
    );

    const group = await screen.findByRole('group', {
      name: 'Действия с заездом',
    });
    expect(
      Array.from(group.querySelectorAll('a, button')).map(
        (item) => item.textContent,
      ),
    ).toEqual(['Участники · 5', 'Написать участникам', 'Закрыть регистрацию']);
    expect(
      screen.getByRole('link', { name: 'Написать участникам' }),
    ).toHaveAttribute('href', '/organizer/rides/ride-1/updates');
  });

  it('offers no lifecycle step on a finished ride', async () => {
    getRideMock.mockResolvedValue({
      isOwner: true,
      requirements: [],
      ride: { ...baseRide, status: 'finished' },
    });

    render(
      <RideWorkspace rideId="ride-1" current="edit" sections={[]}>
        <p>Раздел</p>
      </RideWorkspace>,
    );

    const group = await screen.findByRole('group', {
      name: 'Действия с заездом',
    });
    expect(within(group).queryAllByRole('button')).toHaveLength(0);
  });

  it('heads a section with its task, purpose and concrete state', async () => {
    getRideMock.mockResolvedValue({
      isOwner: true,
      requirements: [],
      ride: { ...baseRide, status: 'published' },
    });

    render(
      <RideWorkspace
        rideId="ride-1"
        current="route"
        sections={ORGANIZER_RIDE_SECTIONS}
      >
        <p>Раздел</p>
      </RideWorkspace>,
    );

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Маршрут заезда' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Нет трека')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Маршрут' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByText('Раздел')).toBeInTheDocument();
  });

  it('drops the back link and tabs inside the new-ride wizard', async () => {
    getRideMock.mockResolvedValue({
      isOwner: true,
      requirements: [],
      ride: baseRide,
    });

    render(
      <RideWorkspace
        rideId="ride-1"
        current="route"
        sections={ORGANIZER_RIDE_SECTIONS}
        variant="wizard"
      >
        <p>Раздел</p>
      </RideWorkspace>,
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: baseRide.title }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Разделы заезда' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'К моим заездам' }),
    ).not.toBeInTheDocument();
  });

  it('shows a retryable error and no section when the ride fails to load', async () => {
    getRideMock
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({ isOwner: true, requirements: [], ride: baseRide });

    render(
      <RideWorkspace rideId="ride-1" current="edit" sections={[]}>
        <p>Раздел</p>
      </RideWorkspace>,
    );

    expect(
      await screen.findByText(
        'Не удалось загрузить заезд. Попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Раздел')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Повторить/ }));
    expect(await screen.findByText('Раздел')).toBeInTheDocument();
  });
});

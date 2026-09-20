import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrganizerProfile } from 'types';
import { OrganizerProfileForm } from './components/OrganizerProfileForm';
import {
  ApiError,
  createOrganizerProfile,
  getOrganizerProfile,
  updateOrganizerProfile,
} from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    getOrganizerProfile: vi.fn(),
    createOrganizerProfile: vi.fn(),
    updateOrganizerProfile: vi.fn(),
  };
});

const getOrganizerProfileMock = vi.mocked(getOrganizerProfile);
const createOrganizerProfileMock = vi.mocked(createOrganizerProfile);
const updateOrganizerProfileMock = vi.mocked(updateOrganizerProfile);

const NOT_FOUND_ERROR = new ApiError({
  type: 'https://coffee-ride.example/errors/organizer_profile_not_found',
  title: 'Organizer profile not found',
  status: 404,
  detail: 'No organizer profile exists for this account yet.',
  instance: '/v1/organizers/me',
  code: 'organizer_profile_not_found',
});

const baseProfile: OrganizerProfile = {
  id: 'org-1',
  userId: 'user-1',
  name: 'Гравийный клуб',
  description: 'Ездим по субботам.',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function submit(name: RegExp) {
  fireEvent.click(screen.getByRole('button', { name }));
}

describe('OrganizerProfileForm', () => {
  beforeEach(() => {
    getOrganizerProfileMock.mockReset();
    createOrganizerProfileMock.mockReset();
    updateOrganizerProfileMock.mockReset();
  });

  it('shows the create form when no organizer profile exists yet', async () => {
    getOrganizerProfileMock.mockRejectedValue(NOT_FOUND_ERROR);

    render(<OrganizerProfileForm />);

    expect(
      await screen.findByRole('button', { name: 'Создать профиль' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Название')).toHaveValue('');
  });

  it('loads an existing profile into the edit form', async () => {
    getOrganizerProfileMock.mockResolvedValue({
      organizerProfile: baseProfile,
      rating: null,
      reviewCount: 0,
    });

    render(<OrganizerProfileForm />);

    expect(
      await screen.findByRole('button', { name: 'Сохранить' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Название')).toHaveValue('Гравийный клуб');
    expect(screen.getByLabelText('Описание')).toHaveValue('Ездим по субботам.');
  });

  it('shows "no reviews yet" for an existing profile with no reviews', async () => {
    getOrganizerProfileMock.mockResolvedValue({
      organizerProfile: baseProfile,
      rating: null,
      reviewCount: 0,
    });

    render(<OrganizerProfileForm />);

    expect(await screen.findByText('Пока нет отзывов')).toBeInTheDocument();
  });

  it('shows the aggregated rating (CR-043) for an existing profile with reviews', async () => {
    getOrganizerProfileMock.mockResolvedValue({
      organizerProfile: baseProfile,
      rating: 4.5,
      reviewCount: 3,
    });

    render(<OrganizerProfileForm />);

    const ratingLine = await screen.findByText(/★/);
    expect(ratingLine.textContent).toContain('4,5');
    expect(await screen.findByText('3 отзыва')).toBeInTheDocument();
  });

  it('shows no rating card before a profile exists', async () => {
    getOrganizerProfileMock.mockRejectedValue(NOT_FOUND_ERROR);

    render(<OrganizerProfileForm />);

    await screen.findByRole('button', { name: 'Создать профиль' });
    expect(screen.queryByText('Рейтинг')).not.toBeInTheDocument();
  });

  it('shows an error state for a load failure other than "not found"', async () => {
    getOrganizerProfileMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/internal_error',
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected error occurred.',
        instance: '/v1/organizers/me',
        code: 'internal_error',
      }),
    );

    render(<OrganizerProfileForm />);

    expect(
      await screen.findByText('Не удалось загрузить профиль организатора.'),
    ).toBeInTheDocument();
  });

  it('shows a client-side validation error without calling the API', async () => {
    getOrganizerProfileMock.mockRejectedValue(NOT_FOUND_ERROR);

    render(<OrganizerProfileForm />);
    await screen.findByRole('button', { name: 'Создать профиль' });

    submit(/Создать профиль/);

    await waitFor(() =>
      expect(screen.getByLabelText('Название')).toHaveAttribute(
        'aria-invalid',
        'true',
      ),
    );
    expect(createOrganizerProfileMock).not.toHaveBeenCalled();
  });

  it('creates the organizer profile and shows a success message', async () => {
    getOrganizerProfileMock.mockRejectedValue(NOT_FOUND_ERROR);
    createOrganizerProfileMock.mockResolvedValue({
      organizerProfile: baseProfile,
      rating: null,
      reviewCount: 0,
    });

    render(<OrganizerProfileForm />);
    await screen.findByRole('button', { name: 'Создать профиль' });

    fireEvent.change(screen.getByLabelText('Название'), {
      target: { value: 'Гравийный клуб' },
    });
    submit(/Создать профиль/);

    expect(
      await screen.findByText('Профиль организатора создан.'),
    ).toBeInTheDocument();
    expect(createOrganizerProfileMock).toHaveBeenCalledWith({
      name: 'Гравийный клуб',
      description: null,
    });
  });

  it('ignores a second submit while a request is already pending', async () => {
    getOrganizerProfileMock.mockRejectedValue(NOT_FOUND_ERROR);
    createOrganizerProfileMock.mockReturnValue(new Promise(() => {}));

    render(<OrganizerProfileForm />);
    await screen.findByRole('button', { name: 'Создать профиль' });

    fireEvent.change(screen.getByLabelText('Название'), {
      target: { value: 'Гравийный клуб' },
    });
    submit(/Создать профиль/);
    const pendingButton = await screen.findByRole('button', {
      name: 'Создание…',
    });
    expect(pendingButton).toBeDisabled();

    fireEvent.submit(pendingButton.closest('form')!);

    expect(createOrganizerProfileMock).toHaveBeenCalledOnce();
  });

  it('shows the email-verification message for a blocked create', async () => {
    getOrganizerProfileMock.mockRejectedValue(NOT_FOUND_ERROR);
    createOrganizerProfileMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/email_verification_required',
        title: 'Email verification required',
        status: 403,
        detail: 'Verify your email before creating an organizer profile.',
        instance: '/v1/organizers/me',
        code: 'email_verification_required',
      }),
    );

    render(<OrganizerProfileForm />);
    await screen.findByRole('button', { name: 'Создать профиль' });

    fireEvent.change(screen.getByLabelText('Название'), {
      target: { value: 'Гравийный клуб' },
    });
    submit(/Создать профиль/);

    expect(await screen.findByText(/Подтвердите email/)).toBeInTheDocument();
  });

  it('maps a server validation error onto the matching field', async () => {
    getOrganizerProfileMock.mockRejectedValue(NOT_FOUND_ERROR);
    createOrganizerProfileMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/validation_error',
        title: 'Validation error',
        status: 400,
        detail: 'The request payload is invalid.',
        instance: '/v1/organizers/me',
        code: 'validation_error',
        errors: [{ path: 'name', message: 'Organizer name cannot be empty.' }],
      }),
    );

    render(<OrganizerProfileForm />);
    await screen.findByRole('button', { name: 'Создать профиль' });

    fireEvent.change(screen.getByLabelText('Название'), {
      target: { value: 'x' },
    });
    submit(/Создать профиль/);

    expect(
      await screen.findByText('Organizer name cannot be empty.'),
    ).toBeInTheDocument();
  });

  it('updates an existing organizer profile', async () => {
    getOrganizerProfileMock.mockResolvedValue({
      organizerProfile: baseProfile,
      rating: null,
      reviewCount: 0,
    });
    updateOrganizerProfileMock.mockResolvedValue({
      organizerProfile: { ...baseProfile, name: 'Новое имя' },
      rating: null,
      reviewCount: 0,
    });

    render(<OrganizerProfileForm />);
    await screen.findByRole('button', { name: 'Сохранить' });

    fireEvent.change(screen.getByLabelText('Название'), {
      target: { value: 'Новое имя' },
    });
    submit(/Сохранить/);

    expect(await screen.findByText('Изменения сохранены.')).toBeInTheDocument();
    expect(updateOrganizerProfileMock).toHaveBeenCalledWith({
      name: 'Новое имя',
      description: 'Ездим по субботам.',
    });
  });
});

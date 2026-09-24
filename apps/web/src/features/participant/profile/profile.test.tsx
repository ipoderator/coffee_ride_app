import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'types';
import { ProfileForm } from './components/ProfileForm';
import { ApiError, updateProfile } from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return { ...actual, updateProfile: vi.fn() };
});

const updateProfileMock = vi.mocked(updateProfile);

const baseUser: User = {
  id: '1',
  email: 'rider@example.com',
  emailVerified: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  displayName: null,
  firstName: null,
  lastName: null,
  phone: null,
  bio: null,
  avatarUrl: null,
  profileVisibility: 'co_participants',
  distanceWeekKm: null,
  distanceMonthKm: null,
  distanceYearKm: null,
};

function submit() {
  fireEvent.click(
    screen.getByRole('button', { name: /Сохранить|Сохранение…/ }),
  );
}

describe('ProfileForm', () => {
  beforeEach(() => {
    updateProfileMock.mockReset();
  });

  it('loads the initial field values from the current user', () => {
    render(
      <ProfileForm
        initialUser={{
          ...baseUser,
          firstName: 'Иван',
          lastName: 'Иванов',
          displayName: 'IvanTheBiker',
          phone: '+79001234567',
          bio: 'Люблю шоссе.',
        }}
      />,
    );

    expect(screen.getByLabelText('Имя')).toHaveValue('Иван');
    expect(screen.getByLabelText('Фамилия')).toHaveValue('Иванов');
    expect(screen.getByLabelText('Отображаемое имя')).toHaveValue(
      'IvanTheBiker',
    );
    expect(screen.getByLabelText('Телефон')).toHaveValue('+79001234567');
    expect(screen.getByLabelText('О себе')).toHaveValue('Люблю шоссе.');
  });

  it('shows a client-side validation error without calling the API', async () => {
    render(<ProfileForm initialUser={baseUser} />);

    fireEvent.change(screen.getByLabelText('Телефон'), {
      target: { value: 'not a phone!!' },
    });
    submit();

    await waitFor(() =>
      expect(screen.getByLabelText('Телефон')).toHaveAttribute(
        'aria-invalid',
        'true',
      ),
    );
    expect(updateProfileMock).not.toHaveBeenCalled();
  });

  it('sends null for an emptied field (clears it) and unchanged values for the rest', async () => {
    updateProfileMock.mockResolvedValue({
      user: { ...baseUser, firstName: 'Иван', phone: null, bio: null },
    });

    render(
      <ProfileForm
        initialUser={{
          ...baseUser,
          firstName: 'Иван',
          phone: '+79001234567',
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText('Телефон'), {
      target: { value: '' },
    });
    submit();

    await waitFor(() =>
      expect(updateProfileMock).toHaveBeenCalledWith({
        firstName: 'Иван',
        lastName: null,
        displayName: null,
        phone: null,
        bio: null,
        profileVisibility: 'co_participants',
        distanceWeekKm: null,
        distanceMonthKm: null,
        distanceYearKm: null,
      }),
    );
  });

  it('shows a pending state and disables the submit button while in flight', async () => {
    updateProfileMock.mockReturnValue(new Promise(() => {}));

    render(<ProfileForm initialUser={baseUser} />);
    submit();

    const button = await screen.findByRole('button', { name: 'Сохранение…' });
    expect(button).toBeDisabled();
  });

  it('ignores a second submit while a request is already pending', async () => {
    updateProfileMock.mockReturnValue(new Promise(() => {}));

    render(<ProfileForm initialUser={baseUser} />);
    submit();
    await screen.findByRole('button', { name: 'Сохранение…' });

    fireEvent.submit(
      screen.getByRole('button', { name: 'Сохранение…' }).closest('form')!,
    );

    expect(updateProfileMock).toHaveBeenCalledOnce();
  });

  it('shows a success message and reflects the saved values after a successful submit', async () => {
    updateProfileMock.mockResolvedValue({
      user: { ...baseUser, firstName: 'Иван', lastName: 'Иванов' },
    });

    render(<ProfileForm initialUser={baseUser} />);
    fireEvent.change(screen.getByLabelText('Имя'), {
      target: { value: 'Иван' },
    });
    fireEvent.change(screen.getByLabelText('Фамилия'), {
      target: { value: 'Иванов' },
    });
    submit();

    expect(await screen.findByText('Изменения сохранены.')).toBeInTheDocument();
    expect(screen.getByLabelText('Имя')).toHaveValue('Иван');
    expect(screen.getByLabelText('Фамилия')).toHaveValue('Иванов');
  });

  it('submits the profile-visibility and distance-stat fields alongside the rest', async () => {
    updateProfileMock.mockResolvedValue({ user: baseUser });

    render(<ProfileForm initialUser={baseUser} />);

    fireEvent.change(screen.getByLabelText('Видимость профиля'), {
      target: { value: 'open' },
    });
    fireEvent.change(screen.getByLabelText('Км за неделю'), {
      target: { value: '150' },
    });
    fireEvent.change(screen.getByLabelText('Км за месяц'), {
      target: { value: '600' },
    });
    fireEvent.change(screen.getByLabelText('Км за год'), {
      target: { value: '7200' },
    });
    submit();

    await waitFor(() =>
      expect(updateProfileMock).toHaveBeenCalledWith({
        firstName: null,
        lastName: null,
        displayName: null,
        phone: null,
        bio: null,
        profileVisibility: 'open',
        distanceWeekKm: 150,
        distanceMonthKm: 600,
        distanceYearKm: 7200,
      }),
    );
  });

  it('shows a client-side validation error for an out-of-range distance value', async () => {
    render(<ProfileForm initialUser={baseUser} />);

    fireEvent.change(screen.getByLabelText('Км за неделю'), {
      target: { value: '5000' },
    });
    submit();

    await waitFor(() =>
      expect(screen.getByLabelText('Км за неделю')).toHaveAttribute(
        'aria-invalid',
        'true',
      ),
    );
    expect(updateProfileMock).not.toHaveBeenCalled();
  });

  it('maps a server validation error onto the matching field', async () => {
    updateProfileMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/validation_error',
        title: 'Validation error',
        status: 400,
        detail: 'The request payload is invalid.',
        instance: '/v1/users/me',
        code: 'validation_error',
        errors: [{ path: 'phone', message: 'Enter a valid phone number.' }],
      }),
    );

    render(<ProfileForm initialUser={{ ...baseUser, phone: '123' }} />);
    submit();

    expect(
      await screen.findByText('Enter a valid phone number.'),
    ).toBeInTheDocument();
  });

  it('shows a generic error for an unmapped server failure', async () => {
    updateProfileMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/internal_error',
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected error occurred.',
        instance: '/v1/users/me',
        code: 'internal_error',
      }),
    );

    render(<ProfileForm initialUser={baseUser} />);
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось выполнить запрос.',
    );
  });
});

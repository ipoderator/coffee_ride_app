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
  phone: null,
  bio: null,
  avatarUrl: null,
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
          displayName: 'Иван',
          phone: '+79001234567',
          bio: 'Люблю шоссе.',
        }}
      />,
    );

    expect(screen.getByLabelText('Имя')).toHaveValue('Иван');
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
      user: { ...baseUser, displayName: 'Иван', phone: null, bio: null },
    });

    render(
      <ProfileForm
        initialUser={{
          ...baseUser,
          displayName: 'Иван',
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
        displayName: 'Иван',
        phone: null,
        bio: null,
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
      user: { ...baseUser, displayName: 'Иван Иванов' },
    });

    render(<ProfileForm initialUser={baseUser} />);
    fireEvent.change(screen.getByLabelText('Имя'), {
      target: { value: 'Иван Иванов' },
    });
    submit();

    expect(await screen.findByText('Изменения сохранены.')).toBeInTheDocument();
    expect(screen.getByLabelText('Имя')).toHaveValue('Иван Иванов');
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

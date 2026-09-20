import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AvatarUploadForm } from './components/AvatarUploadForm';
import {
  ApiError,
  deleteOrganizerAvatar,
  replaceOrganizerAvatar,
  uploadOrganizerAvatar,
} from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    uploadOrganizerAvatar: vi.fn(),
    replaceOrganizerAvatar: vi.fn(),
    deleteOrganizerAvatar: vi.fn(),
  };
});

const uploadOrganizerAvatarMock = vi.mocked(uploadOrganizerAvatar);
const replaceOrganizerAvatarMock = vi.mocked(replaceOrganizerAvatar);
const deleteOrganizerAvatarMock = vi.mocked(deleteOrganizerAvatar);

function selectFile(file: File) {
  const input = screen.getByLabelText('Файл изображения') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe('AvatarUploadForm (organizer)', () => {
  beforeEach(() => {
    uploadOrganizerAvatarMock.mockReset();
    replaceOrganizerAvatarMock.mockReset();
    deleteOrganizerAvatarMock.mockReset();
  });

  it('shows the empty description and an upload control with no avatar', () => {
    render(<AvatarUploadForm initialAvatarUrl={null} name="Гравийный клуб" />);

    expect(
      screen.getByText('Загрузите изображение (JPEG, PNG или WebP).'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Загрузить фото' }),
    ).toBeInTheDocument();
  });

  it('uploads an avatar', async () => {
    uploadOrganizerAvatarMock.mockResolvedValue('/v1/organizers/org-1/avatar');

    render(<AvatarUploadForm initialAvatarUrl={null} name="Гравийный клуб" />);
    selectFile(new File(['x'], 'avatar.jpg', { type: 'image/jpeg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить фото' }));

    expect(await screen.findByText('Фото загружено.')).toBeInTheDocument();
    expect(uploadOrganizerAvatarMock).toHaveBeenCalledWith(expect.any(File));
  });

  it('replaces an existing avatar', async () => {
    replaceOrganizerAvatarMock.mockResolvedValue('/v1/organizers/org-1/avatar');

    render(
      <AvatarUploadForm
        initialAvatarUrl="/v1/organizers/org-1/avatar"
        name="Гравийный клуб"
      />,
    );
    selectFile(new File(['x'], 'new-avatar.jpg', { type: 'image/jpeg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Заменить фото' }));

    expect(await screen.findByText('Фото обновлено.')).toBeInTheDocument();
    expect(replaceOrganizerAvatarMock).toHaveBeenCalledWith(expect.any(File));
  });

  it('deletes the avatar after confirmation', async () => {
    deleteOrganizerAvatarMock.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <AvatarUploadForm
        initialAvatarUrl="/v1/organizers/org-1/avatar"
        name="Гравийный клуб"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Удалить фото' }));

    expect(await screen.findByText('Фото удалено.')).toBeInTheDocument();
    expect(deleteOrganizerAvatarMock).toHaveBeenCalled();
  });

  it('shows an already-exists error from the server', async () => {
    uploadOrganizerAvatarMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/avatar_already_exists',
        title: 'Avatar already exists',
        status: 409,
        detail: 'An avatar already exists.',
        instance: '/v1/organizers/me/avatar',
        code: 'avatar_already_exists',
      }),
    );

    render(<AvatarUploadForm initialAvatarUrl={null} name="Гравийный клуб" />);
    selectFile(new File(['x'], 'avatar.jpg', { type: 'image/jpeg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить фото' }));

    expect(
      await screen.findByText(
        'Не удалось выполнить запрос. Попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();
  });
});

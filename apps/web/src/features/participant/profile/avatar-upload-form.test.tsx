import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AvatarUploadForm } from './components/AvatarUploadForm';
import { ApiError, deleteAvatar, replaceAvatar, uploadAvatar } from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    uploadAvatar: vi.fn(),
    replaceAvatar: vi.fn(),
    deleteAvatar: vi.fn(),
  };
});

const uploadAvatarMock = vi.mocked(uploadAvatar);
const replaceAvatarMock = vi.mocked(replaceAvatar);
const deleteAvatarMock = vi.mocked(deleteAvatar);

function selectFile(file: File) {
  const input = screen.getByLabelText('Файл изображения') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe('AvatarUploadForm (participant)', () => {
  beforeEach(() => {
    uploadAvatarMock.mockReset();
    replaceAvatarMock.mockReset();
    deleteAvatarMock.mockReset();
  });

  it('shows the empty description and an upload control with no avatar', () => {
    render(<AvatarUploadForm initialAvatarUrl={null} name="Иван Иванов" />);

    expect(
      screen.getByText('Загрузите изображение (JPEG, PNG или WebP).'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Загрузить фото' }),
    ).toBeInTheDocument();
  });

  it('uploads an avatar', async () => {
    uploadAvatarMock.mockResolvedValue('/v1/users/me/avatar');

    render(<AvatarUploadForm initialAvatarUrl={null} name="Иван Иванов" />);
    selectFile(new File(['x'], 'avatar.jpg', { type: 'image/jpeg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить фото' }));

    expect(await screen.findByText('Фото загружено.')).toBeInTheDocument();
    expect(uploadAvatarMock).toHaveBeenCalledWith(expect.any(File));
  });

  it('shows a validation error without calling the API when no file is selected', () => {
    render(<AvatarUploadForm initialAvatarUrl={null} name="Иван Иванов" />);

    fireEvent.click(screen.getByRole('button', { name: 'Загрузить фото' }));

    expect(
      screen.getByText('Выберите файл изображения для загрузки.'),
    ).toBeInTheDocument();
    expect(uploadAvatarMock).not.toHaveBeenCalled();
  });

  it('shows an invalid-file error from the server', async () => {
    uploadAvatarMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/avatar_invalid',
        title: 'Avatar invalid',
        status: 400,
        detail: 'Only JPEG, PNG, or WebP images are accepted.',
        instance: '/v1/users/me/avatar',
        code: 'avatar_invalid',
      }),
    );

    render(<AvatarUploadForm initialAvatarUrl={null} name="Иван Иванов" />);
    selectFile(new File(['x'], 'notes.txt', { type: 'text/plain' }));
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить фото' }));

    expect(
      await screen.findByText(
        'Файл не распознан как изображение JPEG, PNG или WebP.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the degraded storage-unavailable notice, not a hard error', async () => {
    uploadAvatarMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/avatar_storage_unavailable',
        title: 'Avatar storage unavailable',
        status: 503,
        detail: 'File storage is temporarily unavailable. Try again shortly.',
        instance: '/v1/users/me/avatar',
        code: 'avatar_storage_unavailable',
      }),
    );

    render(<AvatarUploadForm initialAvatarUrl={null} name="Иван Иванов" />);
    selectFile(new File(['x'], 'avatar.jpg', { type: 'image/jpeg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить фото' }));

    expect(
      await screen.findByText('Загрузка недоступна. Попробуйте ещё раз позже.'),
    ).toBeInTheDocument();
  });

  it('replaces an existing avatar', async () => {
    replaceAvatarMock.mockResolvedValue('/v1/users/me/avatar');

    render(
      <AvatarUploadForm
        initialAvatarUrl="/v1/users/me/avatar"
        name="Иван Иванов"
      />,
    );
    selectFile(new File(['x'], 'new-avatar.jpg', { type: 'image/jpeg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Заменить фото' }));

    expect(await screen.findByText('Фото обновлено.')).toBeInTheDocument();
    expect(replaceAvatarMock).toHaveBeenCalledWith(expect.any(File));
  });

  it('deletes the avatar after confirmation', async () => {
    deleteAvatarMock.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <AvatarUploadForm
        initialAvatarUrl="/v1/users/me/avatar"
        name="Иван Иванов"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Удалить фото' }));

    expect(await screen.findByText('Фото удалено.')).toBeInTheDocument();
    expect(deleteAvatarMock).toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Загрузить фото' }),
    ).toBeInTheDocument();
  });

  it('does not delete when the confirmation is dismissed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <AvatarUploadForm
        initialAvatarUrl="/v1/users/me/avatar"
        name="Иван Иванов"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Удалить фото' }));

    expect(deleteAvatarMock).not.toHaveBeenCalled();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CoverImageUploadForm } from './components/CoverImageUploadForm';
import {
  ApiError,
  deleteCoverImage,
  getRideCoverState,
  replaceCoverImage,
  uploadCoverImage,
} from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    getRideCoverState: vi.fn(),
    uploadCoverImage: vi.fn(),
    replaceCoverImage: vi.fn(),
    deleteCoverImage: vi.fn(),
  };
});

const getRideCoverStateMock = vi.mocked(getRideCoverState);
const uploadCoverImageMock = vi.mocked(uploadCoverImage);
const replaceCoverImageMock = vi.mocked(replaceCoverImage);
const deleteCoverImageMock = vi.mocked(deleteCoverImage);

function selectFile(file: File) {
  const input = screen.getByLabelText('Файл изображения') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe('CoverImageUploadForm', () => {
  beforeEach(() => {
    getRideCoverStateMock.mockReset();
    uploadCoverImageMock.mockReset();
    replaceCoverImageMock.mockReset();
    deleteCoverImageMock.mockReset();
  });

  it('shows a not-found state for a non-existent/foreign ride', async () => {
    getRideCoverStateMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/ride_not_found',
        title: 'Ride not found',
        status: 404,
        detail: 'No ride with that id exists for this account.',
        instance: '/v1/rides/ride-1',
        code: 'ride_not_found',
      }),
    );

    render(<CoverImageUploadForm rideId="ride-1" />);

    expect(
      await screen.findByText('К редактированию заезда'),
    ).toBeInTheDocument();
  });

  it('shows an error state on a network/server failure', async () => {
    getRideCoverStateMock.mockRejectedValue(new Error('network error'));

    render(<CoverImageUploadForm rideId="ride-1" />);

    expect(
      await screen.findByText(
        'Не удалось загрузить заезд. Попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the empty state and an upload control for a draft ride with no cover', async () => {
    getRideCoverStateMock.mockResolvedValue({
      status: 'draft',
      coverImageUrl: null,
    });

    render(<CoverImageUploadForm rideId="ride-1" />);

    expect(
      await screen.findByText('Обложка ещё не загружена'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Загрузить обложку' }),
    ).toBeInTheDocument();
  });

  it('uploads a cover image', async () => {
    getRideCoverStateMock.mockResolvedValue({
      status: 'draft',
      coverImageUrl: null,
    });
    uploadCoverImageMock.mockResolvedValue('/v1/rides/ride-1/cover');

    render(<CoverImageUploadForm rideId="ride-1" />);
    await screen.findByText('Обложка ещё не загружена');

    selectFile(new File(['x'], 'cover.jpg', { type: 'image/jpeg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить обложку' }));

    expect(await screen.findByText('Обложка загружена.')).toBeInTheDocument();
    expect(uploadCoverImageMock).toHaveBeenCalledWith(
      'ride-1',
      expect.any(File),
    );
  });

  it('shows a validation error without calling the API when no file is selected', async () => {
    getRideCoverStateMock.mockResolvedValue({
      status: 'draft',
      coverImageUrl: null,
    });

    render(<CoverImageUploadForm rideId="ride-1" />);
    await screen.findByText('Обложка ещё не загружена');

    fireEvent.click(screen.getByRole('button', { name: 'Загрузить обложку' }));

    expect(
      await screen.findByText('Выберите файл изображения для загрузки.'),
    ).toBeInTheDocument();
    expect(uploadCoverImageMock).not.toHaveBeenCalled();
  });

  it('shows an invalid-file error from the server', async () => {
    getRideCoverStateMock.mockResolvedValue({
      status: 'draft',
      coverImageUrl: null,
    });
    uploadCoverImageMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/cover_image_invalid',
        title: 'Invalid cover image',
        status: 400,
        detail: 'Only JPEG, PNG, or WebP images are accepted.',
        instance: '/v1/rides/ride-1/cover',
        code: 'cover_image_invalid',
      }),
    );

    render(<CoverImageUploadForm rideId="ride-1" />);
    await screen.findByText('Обложка ещё не загружена');

    selectFile(new File(['x'], 'notes.txt', { type: 'text/plain' }));
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить обложку' }));

    expect(
      await screen.findByText(
        'Файл не распознан как изображение JPEG, PNG или WebP.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the degraded storage-unavailable notice, not a hard error', async () => {
    getRideCoverStateMock.mockResolvedValue({
      status: 'draft',
      coverImageUrl: null,
    });
    uploadCoverImageMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/cover_storage_unavailable',
        title: 'Cover image storage unavailable',
        status: 503,
        detail: 'File storage is temporarily unavailable. Try again shortly.',
        instance: '/v1/rides/ride-1/cover',
        code: 'cover_storage_unavailable',
      }),
    );

    render(<CoverImageUploadForm rideId="ride-1" />);
    await screen.findByText('Обложка ещё не загружена');

    selectFile(new File(['x'], 'cover.jpg', { type: 'image/jpeg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить обложку' }));

    expect(
      await screen.findByText('Загрузка недоступна. Попробуйте ещё раз позже.'),
    ).toBeInTheDocument();
  });

  it('replaces an existing cover', async () => {
    getRideCoverStateMock.mockResolvedValue({
      status: 'draft',
      coverImageUrl: '/v1/rides/ride-1/cover',
    });
    replaceCoverImageMock.mockResolvedValue('/v1/rides/ride-1/cover');

    render(<CoverImageUploadForm rideId="ride-1" />);
    await screen.findByRole('button', { name: 'Заменить обложку' });

    selectFile(new File(['x'], 'new-cover.jpg', { type: 'image/jpeg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Заменить обложку' }));

    expect(await screen.findByText('Обложка обновлена.')).toBeInTheDocument();
    expect(replaceCoverImageMock).toHaveBeenCalledWith(
      'ride-1',
      expect.any(File),
    );
  });

  it('deletes the cover after confirmation', async () => {
    getRideCoverStateMock.mockResolvedValue({
      status: 'draft',
      coverImageUrl: '/v1/rides/ride-1/cover',
    });
    deleteCoverImageMock.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<CoverImageUploadForm rideId="ride-1" />);
    await screen.findByRole('button', { name: 'Удалить обложку' });

    fireEvent.click(screen.getByRole('button', { name: 'Удалить обложку' }));

    expect(await screen.findByText('Обложка удалена.')).toBeInTheDocument();
    expect(deleteCoverImageMock).toHaveBeenCalledWith('ride-1');
    expect(screen.getByText('Обложка ещё не загружена')).toBeInTheDocument();
  });

  it('does not delete when the confirmation is dismissed', async () => {
    getRideCoverStateMock.mockResolvedValue({
      status: 'draft',
      coverImageUrl: '/v1/rides/ride-1/cover',
    });
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<CoverImageUploadForm rideId="ride-1" />);
    await screen.findByRole('button', { name: 'Удалить обложку' });

    fireEvent.click(screen.getByRole('button', { name: 'Удалить обложку' }));

    expect(deleteCoverImageMock).not.toHaveBeenCalled();
  });

  it('hides upload/replace/delete controls for a non-draft ride', async () => {
    getRideCoverStateMock.mockResolvedValue({
      status: 'published',
      coverImageUrl: '/v1/rides/ride-1/cover',
    });

    render(<CoverImageUploadForm rideId="ride-1" />);

    expect(
      await screen.findByText(
        'Обложку можно менять только у черновика заезда.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Заменить обложку' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Удалить обложку' }),
    ).not.toBeInTheDocument();
  });
});

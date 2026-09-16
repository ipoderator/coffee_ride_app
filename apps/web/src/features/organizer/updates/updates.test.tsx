import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RideUpdate } from 'types';
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
};

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

    expect(
      await screen.findByText('Message cannot be empty.'),
    ).toBeInTheDocument();
    expect(createRideUpdateMock).not.toHaveBeenCalled();
  });

  it('sends a message, shows a success message, clears the field, and reloads history', async () => {
    getRideUpdatesMock
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockResolvedValueOnce({ items: [existingUpdate], nextCursor: null });
    createRideUpdateMock.mockResolvedValue({ rideUpdate: existingUpdate });

    render(<UpdateComposer rideId="ride-1" />);
    await screen.findByText('Обновлений пока нет');

    const textarea = screen.getByLabelText('Сообщение участникам');
    fireEvent.change(textarea, { target: { value: 'Первое сообщение.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));

    expect(
      await screen.findByText('Обновление отправлено участникам.'),
    ).toBeInTheDocument();
    expect(createRideUpdateMock).toHaveBeenCalledWith(
      'ride-1',
      'Первое сообщение.',
    );
    await waitFor(() => expect(textarea).toHaveValue(''));
    expect(getRideUpdatesMock).toHaveBeenCalledTimes(2);
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

    expect(
      await screen.findByText('Message rejected by the server.'),
    ).toBeInTheDocument();
  });
});

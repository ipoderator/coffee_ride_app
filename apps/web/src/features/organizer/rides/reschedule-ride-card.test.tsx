import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Ride } from 'types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, rescheduleRide } from './api';
import { RescheduleRideCard } from './components/RescheduleRideCard';

// CR-190. The Storybook stories render the visual states; these cover the
// form's own rules (client checks, the confirm step, duplicate-submit
// protection) and how each server refusal is surfaced.

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return { ...actual, rescheduleRide: vi.fn() };
});

const rescheduleRideMock = vi.mocked(rescheduleRide);

const NOW = new Date('2026-10-01T09:00:00.000Z');
// 2026-10-04 08:00 in Moscow (UTC+3).
const STARTS_AT = '2026-10-04T05:00:00.000Z';

const ride: Pick<Ride, 'id' | 'status' | 'startsAt' | 'startTimezone'> = {
  id: 'ride-1',
  status: 'registration_open',
  startsAt: STARTS_AT,
  startTimezone: 'Europe/Moscow',
};

function renderCard(
  overrides: Partial<Parameters<typeof RescheduleRideCard>[0]> = {},
) {
  const onRescheduled = vi.fn();
  render(
    <RescheduleRideCard
      ride={ride}
      registrationsCount={3}
      waitlistCount={2}
      lastReschedule={null}
      onRescheduled={onRescheduled}
      now={() => NOW}
      {...overrides}
    />,
  );
  return { onRescheduled };
}

function openForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Перенести заезд' }));
}

function setTime(value: string) {
  fireEvent.change(screen.getByLabelText('Новое время старта'), {
    target: { value },
  });
}

function setReason(value: string) {
  fireEvent.change(screen.getByLabelText('Причина переноса'), {
    target: { value },
  });
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
}

describe('RescheduleRideCard (CR-190)', () => {
  beforeEach(() => {
    rescheduleRideMock.mockReset();
  });

  it('renders nothing once the ride has started, finished, been cancelled or is a draft', () => {
    for (const status of [
      'draft',
      'started',
      'finished',
      'cancelled',
    ] as const) {
      const { container } = render(
        <RescheduleRideCard
          ride={{ ...ride, status }}
          registrationsCount={0}
          waitlistCount={0}
          lastReschedule={null}
          onRescheduled={() => {}}
          now={() => NOW}
        />,
      );
      expect(container).toBeEmptyDOMElement();
    }
  });

  it('prefills the current start and names who will be notified', () => {
    renderCard();
    openForm();

    expect(screen.getByLabelText('Новое время старта')).toHaveValue('08:00');
    expect(screen.getByTestId('reschedule-recipients')).toHaveTextContent(
      '3 записавшихся участника и 2 человека из листа ожидания.',
    );
  });

  it('requires a reason and a start different from the current one', () => {
    renderCard();
    openForm();

    submit();

    expect(screen.getByText('Напишите причину переноса.')).toBeInTheDocument();
    expect(
      screen.getByText('Это текущее время старта — выберите другое.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('confirms with «было → станет», sends the instant in the ride’s zone, and reports success', async () => {
    const moved = { ...ride, startsAt: '2026-10-04T07:00:00.000Z' } as Ride;
    rescheduleRideMock.mockResolvedValue({
      ride: moved,
      rideUpdate: {
        id: 'u-1',
        rideId: 'ride-1',
        message: 'Гроза утром.',
        createdAt: NOW.toISOString(),
        reschedule: { previousStartsAt: STARTS_AT, startsAt: moved.startsAt },
      },
    });
    const { onRescheduled } = renderCard();
    openForm();
    setTime('10:00');
    setReason('  Гроза утром.  ');
    submit();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Перенести заезд?');
    fireEvent.click(screen.getByRole('button', { name: 'Перенести' }));
    // A second click while in flight sends nothing more.
    fireEvent.click(screen.getByRole('button', { name: 'Перенести' }));

    await waitFor(() => expect(onRescheduled).toHaveBeenCalledWith(moved));
    expect(rescheduleRideMock).toHaveBeenCalledTimes(1);
    expect(rescheduleRideMock).toHaveBeenCalledWith('ride-1', {
      startsAt: '2026-10-04T07:00:00.000Z',
      reason: 'Гроза утром.',
    });
    expect(screen.getByRole('status')).toHaveTextContent('Заезд перенесён на');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('maps a ride that started meanwhile to a plain explanation', async () => {
    rescheduleRideMock.mockRejectedValue(
      new ApiError({
        type: 'about:blank',
        title: 'Ride cannot be rescheduled',
        status: 409,
        detail:
          'Only a published ride that has not started yet can be rescheduled.',
        instance: '/v1/rides/ride-1/reschedule',
        code: 'ride_not_reschedulable',
      }),
    );
    const { onRescheduled } = renderCard();
    openForm();
    setTime('10:00');
    setReason('Гроза.');
    submit();
    fireEvent.click(screen.getByRole('button', { name: 'Перенести' }));

    expect(
      await screen.findByText(
        'Заезд уже начался, завершён или отменён — перенести его нельзя.',
      ),
    ).toBeInTheDocument();
    expect(onRescheduled).not.toHaveBeenCalled();
  });

  it('puts a server-side «in the past» refusal on the time field', async () => {
    rescheduleRideMock.mockRejectedValue(
      new ApiError({
        type: 'about:blank',
        title: 'New start is in the past',
        status: 422,
        detail: 'The new start must be later than now.',
        instance: '/v1/rides/ride-1/reschedule',
        code: 'reschedule_start_in_past',
      }),
    );
    renderCard();
    openForm();
    setTime('10:00');
    setReason('Гроза.');
    submit();
    fireEvent.click(screen.getByRole('button', { name: 'Перенести' }));

    expect(
      await screen.findByText(
        'Это время уже прошло — выберите время позже текущего.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the previous start and reason after a move', () => {
    renderCard({
      lastReschedule: {
        previousStartsAt: '2026-10-03T05:00:00.000Z',
        startsAt: STARTS_AT,
        reason: 'Гроза.',
        rescheduledAt: NOW.toISOString(),
      },
    });

    expect(screen.getByText('Перенесён, было')).toBeInTheDocument();
    expect(screen.getByText('Причина: Гроза.')).toBeInTheDocument();
  });
});

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor } from 'storybook/test';
import type { Registration } from 'types';
import { Button, RIDE_STATUS_TERMS } from 'ui';
import {
  RegistrationTicket,
  type RegistrationTicketProps,
} from '@/features/participant/ride-detail/components/RegistrationTicket';
import type { TicketState } from '@/features/participant/ride-detail/lib/ticket-state';

// The ride page's registration card (CR-151/CR-155). CR-170: a state change
// after mount is shown, not swapped — the frame colour eases over and the
// new content rises in; the first render stays still.
const registration: Registration = {
  id: 'registration-1',
  rideId: 'ride-1',
  userId: 'user-1',
  status: 'active',
  groupId: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  cancelledAt: null,
};

const base: RegistrationTicketProps = {
  rideId: 'ride-1',
  rideStatus: 'registration_open',
  state: 'open',
  statusTerm: RIDE_STATUS_TERMS.registration_open,
  participantLimit: 20,
  registrationsCount: 12,
  waitlistCount: 0,
  viewerRegistration: null,
  viewerWaitlistEntry: null,
  viewerStartNumber: null,
  viewerWaitlistPosition: null,
  groups: [],
  dateLabel: 'Сб, 3 окт',
  timeLabel: '07:30',
  startsAt: '2099-10-03T04:30:00.000Z',
  priceRub: null,
  startPointLabel: 'Парк Горького',
  footer: null,
  onChange: () => {},
  onWaitlistChange: () => {},
};

const meta = {
  title: 'Rides/RegistrationTicket',
  component: RegistrationTicket,
  tags: ['autodocs'],
  args: base,
  parameters: { nextjs: { appDirectory: true } },
  decorators: [
    (Story) => (
      <div className="max-w-[380px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RegistrationTicket>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Записаться' }),
    ).toBeVisible();
  },
};

export const Registered: Story = {
  args: {
    state: 'registered',
    registrationsCount: 13,
    viewerRegistration: registration,
    viewerStartNumber: 13,
  },
};

/** Flip the state from outside, as the page does after an action. */
function StateFlip(args: RegistrationTicketProps) {
  const [state, setState] = useState<TicketState>('open');
  const registered = state === 'registered';
  return (
    <div className="flex flex-col gap-4">
      <Button
        variant="secondary"
        onClick={() => setState(registered ? 'open' : 'registered')}
      >
        Сменить состояние
      </Button>
      <RegistrationTicket
        {...args}
        state={state}
        registrationsCount={registered ? 13 : 12}
        viewerRegistration={registered ? registration : null}
        viewerStartNumber={registered ? 13 : null}
      />
    </div>
  );
}

export const StateChange: Story = {
  render: (args) => <StateFlip {...args} />,
  play: async ({ canvas, canvasElement }) => {
    const body = () =>
      canvasElement.querySelector('[data-ticket-body]') as HTMLElement;
    await expect(body().className).not.toContain('animate-rise-in');

    await userEvent.click(
      canvas.getByRole('button', { name: 'Сменить состояние' }),
    );

    // The new content starts at the rise-in's first frame (transparent) and
    // ends fully visible.
    const cancel = await canvas.findByRole('button', {
      name: 'Отменить регистрацию',
    });
    await waitFor(() => expect(cancel).toBeVisible());
    await expect(body().className).toContain('motion-safe:animate-rise-in');
    await expect(canvas.getByTestId('ride-ticket').className).toContain(
      'border-success',
    );
  },
};

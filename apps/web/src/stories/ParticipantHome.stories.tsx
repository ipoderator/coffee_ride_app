import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { PARTICIPANT_HOME_TERMS } from 'ui';
import { UpcomingRegistrationsWidget } from '@/features/participant/my-rides/components/UpcomingRegistrationsWidget';
import { OrganizerEntryWidget } from '@/features/participant/organizer-entry/components/OrganizerEntryWidget';
import { makeRide } from './fixtures';

// `/me` (CR-185): the participant widgets in their page grid — the next
// registrations and the organizer card. Reads stubbed per story.

const REGISTRATION = {
  id: 'reg-1',
  rideId: 'ride-1',
  userId: 'u-1',
  status: 'active',
  groupId: null,
  createdAt: '2026-09-30T06:00:00Z',
  updatedAt: '2026-09-30T06:00:00Z',
  cancelledAt: null,
  finishClaimedAt: null,
  attendance: null,
};

function stub({
  registrations = [] as unknown[],
  organizer = 200 as 200 | 404 | 500,
  failRegistrations = false,
} = {}) {
  return () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const raw = input instanceof Request ? input.url : String(input);
      const { pathname } = new URL(raw, window.location.href);
      const respond = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        });
      if (pathname === '/api/v1/registrations/mine') {
        return failRegistrations
          ? respond({ status: 500, code: 'internal_error' }, 500)
          : respond({ items: registrations, nextCursor: null });
      }
      if (pathname === '/api/v1/organizers/me') {
        if (organizer === 200) {
          return respond({
            organizerProfile: { id: 'org-1', name: 'Гравий по выходным' },
            rating: null,
            reviewCount: 0,
          });
        }
        return respond({ status: organizer, code: 'x' }, organizer);
      }
      return original(input, init);
    };
    return () => {
      globalThis.fetch = original;
    };
  };
}

function ParticipantHome() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <UpcomingRegistrationsWidget />
      <OrganizerEntryWidget />
    </div>
  );
}

const meta = {
  title: 'Participant/Home',
  component: ParticipantHome,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ParticipantHome>;
export default meta;
type Story = StoryObj<typeof meta>;

/** An organizer with nothing booked: «Найти заезд» and the way to the cabinet. */
export const OrganizerNothingBooked: Story = {
  beforeEach: stub(),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('link', {
        name: PARTICIPANT_HOME_TERMS.findRide,
      }),
    ).toHaveAttribute('href', '/');
    await expect(
      await canvas.findByRole('link', {
        name: PARTICIPANT_HOME_TERMS.organizerOpen,
      }),
    ).toHaveAttribute('href', '/organizer');
  },
};

/** A participant with a booking and no organizer profile yet. */
export const ParticipantWithBooking: Story = {
  beforeEach: stub({
    registrations: [
      { registration: REGISTRATION, ride: makeRide({ id: 'ride-1' }) },
    ],
    organizer: 404,
  }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('link', {
        name: PARTICIPANT_HOME_TERMS.organizerCreateLink + ' →',
      }),
    ).toHaveAttribute('href', '/organizer/profile');
    await expect(
      canvas.getByRole('link', {
        name: `${PARTICIPANT_HOME_TERMS.allRegistrations} →`,
      }),
    ).toBeVisible();
  },
};

export const LoadErrors: Story = {
  beforeEach: stub({ organizer: 500, failRegistrations: true }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(PARTICIPANT_HOME_TERMS.registrationsLoadError),
    ).toBeVisible();
    await expect(
      await canvas.findByText(PARTICIPANT_HOME_TERMS.organizerLoadError),
    ).toBeVisible();
  },
};

export const BothThemes: Story = {
  beforeEach: stub(),
  globals: { theme: 'both' },
};

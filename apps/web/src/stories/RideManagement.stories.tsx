import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { Ride } from 'types';
import { expect, within } from 'storybook/test';
import { FINISH_CHECKIN_TERMS, RIDE_EDIT_TERMS } from 'ui';
import { EditRideForm } from '@/features/organizer/rides/components/EditRideForm';

// `/organizer/rides/[id]/edit` (`EditRideForm`): a draft is the full form; a
// published ride or later opens as «Управление заездом» (CR-184) — status,
// the next lifecycle step, a short summary, sections and the two settings
// that stay editable. `GET /api/v1/rides/:id` is stubbed per story.

const BASE: Ride = {
  id: 'ride-1',
  organizerId: 'org-1',
  title: 'Утро на Лосином острове',
  description: null,
  coverImageUrl: null,
  bicycleType: 'gravel',
  startsAt: '2099-10-01T05:00:00.000Z',
  startTimezone: 'Europe/Moscow',
  startLat: null,
  startLng: null,
  participantLimit: 20,
  priceRub: null,
  distanceKm: 42,
  elevationGainMeters: null,
  paceKmh: null,
  durationMinutes: null,
  difficulty: null,
  participantsVisible: true,
  status: 'registration_open',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  updatedBy: 'user-1',
};

const SECTIONS = [
  { segment: 'route', label: RIDE_EDIT_TERMS.routeLink, order: 10 },
  {
    segment: 'participants',
    label: RIDE_EDIT_TERMS.participantsLink,
    order: 40,
  },
  { segment: 'updates', label: RIDE_EDIT_TERMS.updatesLink, order: 50 },
];

function stub(ride: Partial<Ride>, extra: Record<string, unknown> = {}) {
  return () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const raw = input instanceof Request ? input.url : String(input);
      const { pathname } = new URL(raw, window.location.href);
      if (pathname === '/api/v1/rides/ride-1') {
        return new Response(
          JSON.stringify({
            ride: { ...BASE, ...ride },
            isOwner: true,
            requirements: [],
            registrationsCount: 7,
            contact: { type: 'telegram', value: '@coffee_ride' },
            ...extra,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return original(input, init);
    };
    return () => {
      globalThis.fetch = original;
    };
  };
}

const meta = {
  title: 'Organizer/RideManagement',
  component: EditRideForm,
  args: { rideId: 'ride-1', sections: SECTIONS },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof EditRideForm>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Registration open: the next step is closing it; the form is gone. */
export const RegistrationOpen: Story = {
  beforeEach: stub({}),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('heading', {
        level: 1,
        name: RIDE_EDIT_TERMS.manageTitle,
      }),
    ).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: RIDE_EDIT_TERMS.closeRegistration }),
    ).toBeVisible();
    await expect(
      canvas.queryByLabelText(RIDE_EDIT_TERMS.titleLabel),
    ).not.toBeInTheDocument();
  },
};

/** The start time passed while registration is still open: flagged, unchanged. */
export const OverdueStart: Story = {
  beforeEach: stub({ startsAt: '2026-10-01T05:00:00.000Z' }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByTestId('overdue-start')).toBeVisible();
  },
};

/** Under way, with riders still without an outcome before finishing. */
export const Started: Story = {
  beforeEach: stub(
    { status: 'started', startsAt: '2026-10-02T05:00:00.000Z' },
    { attendanceSummary: { unresolved: 3 } },
  ),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('button', { name: RIDE_EDIT_TERMS.finish }),
    ).toBeVisible();
    await expect(canvas.getByTestId('unresolved-before-finish')).toBeVisible();
  },
};

/** CR-185: finishing with riders still undecided asks first, naming how many. */
export const FinishConfirmation: Story = {
  beforeEach: stub(
    { status: 'started', startsAt: '2026-10-02T05:00:00.000Z' },
    { attendanceSummary: { unresolved: 3 } },
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole('button', { name: RIDE_EDIT_TERMS.finish }),
    );
    const dialog = within(canvasElement.ownerDocument.body).getByRole(
      'dialog',
      { name: FINISH_CHECKIN_TERMS.finishConfirmTitle },
    );
    await expect(dialog).toHaveTextContent(
      FINISH_CHECKIN_TERMS.finishConfirmUnresolved(3),
    );
    await userEvent.click(
      within(dialog).getByRole('button', {
        name: FINISH_CHECKIN_TERMS.finishConfirmCancel,
      }),
    );
  },
};

/** Finished: no lifecycle action and no cancel card. */
export const Finished: Story = {
  beforeEach: stub({ status: 'finished' }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(RIDE_EDIT_TERMS.nextActionHint.finished),
    ).toBeVisible();
    await expect(
      canvas.queryByRole('button', { name: RIDE_EDIT_TERMS.cancel }),
    ).not.toBeInTheDocument();
  },
};

/** A draft keeps the full editable form. */
export const Draft: Story = {
  beforeEach: stub({ status: 'draft' }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('heading', {
        level: 1,
        name: RIDE_EDIT_TERMS.pageTitle,
      }),
    ).toBeVisible();
    await expect(
      canvas.getByLabelText(RIDE_EDIT_TERMS.titleLabel),
    ).toBeEnabled();
  },
};

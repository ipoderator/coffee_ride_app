import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import type { ListRideRidersResponse } from 'types';
import { RIDE_DETAIL_RIDERS_TERMS } from 'ui';
import { RidersSection } from '@/features/participant/ride-detail/components/RidersSection';
import { SessionProvider } from '@/lib/auth/session-context';

// `/rides/[id]`'s «Кто едет» (CR-119). Each story renders the real
// `SessionProvider` and stubs `fetch` for `/auth/me` and the riders list.

const SIGNED_IN = {
  user: {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'rider@example.test',
    emailVerified: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    displayName: 'Райдер',
    firstName: null,
    lastName: null,
    phone: null,
    bio: null,
    avatarUrl: null,
    profileVisibility: 'co_participants',
    distanceWeekKm: null,
    distanceMonthKm: null,
    distanceYearKm: null,
  },
};

const RIDERS: ListRideRidersResponse = {
  items: [
    { registrationId: 'reg-1', displayName: 'Сергей Ковалёв', group: null },
    { registrationId: 'reg-2', displayName: 'Анна Морозова', group: null },
    { registrationId: 'reg-3', displayName: 'Екатерина Волкова', group: null },
  ],
  nextCursor: null,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type':
        status < 400 ? 'application/json' : 'application/problem+json',
    },
  });
}

function stub(session: 'authenticated' | 'anonymous', riders: Response) {
  return () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const raw = input instanceof Request ? input.url : String(input);
      const path = new URL(raw, window.location.href).pathname;
      if (path === '/api/v1/auth/me') {
        return session === 'authenticated'
          ? json(SIGNED_IN)
          : json({ status: 401, code: 'unauthorized' }, 401);
      }
      if (path === '/api/v1/rides/ride-1/riders') return riders.clone();
      return original(input, init);
    };
    return () => {
      globalThis.fetch = original;
    };
  };
}

const meta = {
  title: 'Ride/RidersSection',
  component: RidersSection,
  args: {
    rideId: 'ride-1',
    registrationsCount: 3,
    participantLimit: 30,
    groups: [],
    version: 0,
  },
  parameters: { layout: 'padded', nextjs: { appDirectory: true } },
  render: (args) => (
    <SessionProvider>
      <RidersSection {...args} />
    </SessionProvider>
  ),
} satisfies Meta<typeof RidersSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SignedIn: Story = {
  beforeEach: stub('authenticated', json(RIDERS)),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('img', { name: 'Анна Морозова' }),
    ).toBeVisible();
    await expect(
      canvas.queryByText(RIDE_DETAIL_RIDERS_TERMS.hiddenForOthers),
    ).toBeNull();
  },
};

export const Anonymous: Story = {
  beforeEach: stub('anonymous', json(RIDERS)),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('link', {
        name: RIDE_DETAIL_RIDERS_TERMS.signInPrompt,
      }),
    ).toBeVisible();
  },
};

/** CR-125: a rider (or any other signed-in viewer) of a hidden list. */
export const HiddenForRider: Story = {
  beforeEach: stub(
    'authenticated',
    json({ status: 403, code: 'riders_hidden', title: 'Hidden' }, 403),
  ),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(RIDE_DETAIL_RIDERS_TERMS.hiddenByOrganizer),
    ).toBeVisible();
    // The count stays public.
    await expect(canvas.getByText('3 из 30')).toBeVisible();
  },
};

/** CR-238 (production QA item 4): the organizer still sees their hidden list,
 * told nobody else does — not the counts over an empty «hidden» notice. */
export const HiddenForOrganizer: Story = {
  args: { hiddenFromOthers: true },
  beforeEach: stub('authenticated', json(RIDERS)),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(RIDE_DETAIL_RIDERS_TERMS.hiddenForOthers),
    ).toBeVisible();
    await expect(
      canvas.getByRole('img', { name: 'Сергей Ковалёв' }),
    ).toBeVisible();
    await expect(
      canvas.queryByText(RIDE_DETAIL_RIDERS_TERMS.hiddenByOrganizer),
    ).toBeNull();
  },
};

export const HiddenForOrganizerDark: Story = {
  ...HiddenForOrganizer,
  globals: { theme: 'dark' },
};

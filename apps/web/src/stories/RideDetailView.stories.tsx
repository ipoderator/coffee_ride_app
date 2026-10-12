import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import type { GetRideResponse, Ride } from 'types';
import { ToastProvider } from 'ui';
import { RideDetailView } from '@/features/participant/ride-detail/components/RideDetailView';
import { SessionProvider } from '@/lib/auth/session-context';

// `/rides/[id]` with the API stubbed (anonymous viewer, no route). CR-242:
// «Добавить в календарь» and «Поделиться» say what happened, and sharing
// without a share sheet or clipboard ends in the link shown for a manual copy.

const RIDE: Ride = {
  id: 'ride-1',
  organizerId: 'org-1',
  title: 'Утренний гравийный заезд',
  description: 'Спокойный темп, кофе на середине маршрута.',
  coverImageUrl: null,
  bicycleType: 'gravel',
  startsAt: '2099-05-01T05:00:00.000Z',
  startTimezone: 'Europe/Moscow',
  startLat: null,
  startLng: null,
  participantLimit: 20,
  priceRub: 500,
  distanceKm: 42.3,
  elevationGainMeters: 350,
  paceKmh: 24.5,
  durationMinutes: 150,
  difficulty: 3,
  participantsVisible: true,
  status: 'registration_open',
  createdAt: '2099-01-01T00:00:00.000Z',
  updatedAt: '2099-01-01T00:00:00.000Z',
  updatedBy: 'user-1',
};

const DETAIL: GetRideResponse = {
  ride: RIDE,
  organizer: {
    id: 'org-1',
    name: 'Гравийный клуб',
    avatarUrl: null,
    rating: null,
    reviewCount: 0,
  },
  route: null,
  stops: [],
  routePoints: [],
  registrationsCount: 4,
  viewerRegistration: null,
  viewerWaitlistEntry: null,
  viewerReview: null,
  groups: [],
  isOwner: false,
  attendanceSummary: null,
  waitlistCount: 0,
  viewerStartNumber: null,
  viewerWaitlistPosition: null,
  requirements: [],
  rescheduleCount: 0,
  lastReschedule: null,
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

function stubApi({ noClipboard = false } = {}) {
  return () => {
    const original = globalThis.fetch;
    const share = Object.getOwnPropertyDescriptor(navigator, 'share');
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const execCommand = document.execCommand;
    const click = HTMLAnchorElement.prototype.click;
    globalThis.fetch = async (input) => {
      const raw = input instanceof Request ? input.url : String(input);
      const path = new URL(raw, window.location.href).pathname;
      if (path === '/api/v1/rides/ride-1') return json(DETAIL);
      if (path === '/api/v1/auth/me') {
        return json({ status: 401, code: 'unauthorized' }, 401);
      }
      return json({ items: [], nextCursor: null });
    };
    // No real download from a story run.
    HTMLAnchorElement.prototype.click = function () {};
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: undefined,
    });
    if (noClipboard) {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: undefined,
      });
      document.execCommand = () => false;
    }
    return () => {
      globalThis.fetch = original;
      HTMLAnchorElement.prototype.click = click;
      document.execCommand = execCommand;
      for (const [key, descriptor] of [
        ['share', share],
        ['clipboard', clipboard],
      ] as const) {
        if (descriptor) Object.defineProperty(navigator, key, descriptor);
        else delete (navigator as unknown as Record<string, unknown>)[key];
      }
    };
  };
}

const meta = {
  title: 'Participant/RideDetailView',
  component: RideDetailView,
  tags: ['autodocs'],
  args: { rideId: 'ride-1' },
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/rides/ride-1' } },
  },
  render: (args) => (
    <SessionProvider>
      <ToastProvider>
        <div className="p-4">
          <RideDetailView {...args} />
        </div>
      </ToastProvider>
    </SessionProvider>
  ),
} satisfies Meta<typeof RideDetailView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** «Добавить в календарь» confirms the download. */
export const CalendarDownloaded: Story = {
  beforeEach: stubApi(),
  play: async ({ canvas, userEvent }) => {
    const [button] = await canvas.findAllByRole('button', {
      name: 'Добавить в календарь',
    });
    await userEvent.click(button!);
    await expect(
      await within(document.body).findByText(
        'Файл календаря скачан — откройте его, чтобы добавить заезд.',
      ),
    ).toBeInTheDocument();
  },
};

/** No share sheet, no clipboard: the link, for a manual copy. */
export const ShareManualFallback: Story = {
  beforeEach: stubApi({ noClipboard: true }),
  play: async ({ canvas, userEvent }) => {
    const [button] = await canvas.findAllByRole('button', {
      name: 'Поделиться',
    });
    await userEvent.click(button!);
    const dialog = await within(document.body).findByRole('dialog', {
      name: 'Ссылка на заезд',
    });
    await expect(within(dialog).getByLabelText('Ссылка')).toHaveValue(
      window.location.href,
    );
  },
};

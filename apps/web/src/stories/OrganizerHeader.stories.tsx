import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { OrganizerHeader } from '@/components/cabinet/OrganizerHeader';
import { SessionProvider } from '@/lib/auth/session-context';

// `/organizer/*`'s own header (CR-132). CR-243: the account menu names the
// account outside `role="menu"`, and the theme options are radio items.
// (CR-241's 320px fit depends on the viewport — checked in the app.)

const SIGNED_IN = {
  user: {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'a.very.long.organizer.address@example.test',
    emailVerified: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    displayName: null,
    firstName: 'Андрей',
    lastName: 'Лебедев',
    phone: null,
    bio: null,
    avatarUrl: null,
    profileVisibility: 'co_participants',
    distanceWeekKm: null,
    distanceMonthKm: null,
    distanceYearKm: null,
  },
};

function stubSession() {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const raw = input instanceof Request ? input.url : String(input);
    if (new URL(raw, window.location.href).pathname === '/api/v1/auth/me') {
      return new Response(JSON.stringify(SIGNED_IN), {
        headers: { 'content-type': 'application/json' },
      });
    }
    return original(input, init);
  };
  return () => {
    globalThis.fetch = original;
  };
}

const meta = {
  title: 'Organizer/OrganizerHeader',
  component: OrganizerHeader,
  tags: ['autodocs'],
  beforeEach: stubSession,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/organizer' } },
  },
  render: () => (
    <SessionProvider>
      <OrganizerHeader />
    </SessionProvider>
  ),
} satisfies Meta<typeof OrganizerHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  globals: { theme: 'both' },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findAllByRole('button', { name: 'Меню аккаунта' }),
    ).toHaveLength(2);
  },
};

/** The open account menu: name and email above the items, theme radios. */
export const AccountMenuOpen: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Меню аккаунта' }),
    );
    const menu = canvas.getByRole('menu');
    await expect(menu).toHaveAccessibleDescription(
      'Андрей Лебедев a.very.long.organizer.address@example.test',
    );
    await expect(canvas.getAllByRole('menuitemradio')).toHaveLength(3);
  },
};

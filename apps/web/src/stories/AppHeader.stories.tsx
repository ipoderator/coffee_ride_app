import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { AppHeader } from '@/components/site/AppHeader';
import { SessionProvider } from '@/lib/auth/session-context';
import { ORGANIZER_NAV_ITEMS } from '@/lib/cabinet/organizer-nav';
import { PARTICIPANT_NAV_ITEMS } from '@/lib/cabinet/participant-nav';

// The site header on every route (CR-108). Stories render the real
// `SessionProvider` and stub `fetch` for `/auth/me` (the `ResendVerificationButton`
// pattern), so the account menu shows exactly what a signed-in organizer sees.

const SIGNED_IN_USER = {
  user: {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'organizer.strava@example.test',
    emailVerified: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    displayName: 'Организатор',
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

function stubSession(session: 'authenticated' | 'anonymous') {
  return () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const raw = input instanceof Request ? input.url : String(input);
      if (new URL(raw, window.location.href).pathname === '/api/v1/auth/me') {
        return session === 'authenticated'
          ? new Response(JSON.stringify(SIGNED_IN_USER), {
              headers: { 'content-type': 'application/json' },
            })
          : new Response(
              JSON.stringify({ status: 401, code: 'unauthorized' }),
              {
                status: 401,
                headers: { 'content-type': 'application/problem+json' },
              },
            );
      }
      return original(input, init);
    };
    return () => {
      globalThis.fetch = original;
    };
  };
}

/** The y of the text baseline at the first visible glyph inside `element`. */
function baselineOf(element: Element): number {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.textContent?.trim() && !node.parentElement?.closest('.sr-only')
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP,
  });
  const text = walker.nextNode();
  if (!text?.parentNode) throw new Error('no visible text');
  const marker = document.createElement('span');
  marker.style.cssText =
    'display:inline-block;width:0;height:0;vertical-align:baseline';
  text.parentNode.insertBefore(marker, text);
  const y = marker.getBoundingClientRect().top;
  marker.remove();
  return y;
}

const meta = {
  title: 'Site/AppHeader',
  component: AppHeader,
  tags: ['autodocs'],
  args: {
    participantNavItems: PARTICIPANT_NAV_ITEMS,
    organizerNavItems: ORGANIZER_NAV_ITEMS,
  },
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/rides' } },
  },
  render: (args) => (
    <SessionProvider>
      <AppHeader {...args} />
    </SessionProvider>
  ),
} satisfies Meta<typeof AppHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Signed-in organizer on desktop: the wordmark, every label and the account
 * menu stand on one baseline — nothing sits higher or lower. */
export const SignedInOrganizer: Story = {
  beforeEach: stubSession('authenticated'),
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByText('organizer.strava@example.test');
    const wordmark = canvasElement.querySelector(
      'header a[href="/"] [aria-hidden="true"]',
    );
    const labels = [
      'Мои заезды',
      'Организатору',
      'organizer.strava@example.test',
    ].map((text) => canvas.getByText(text));
    // Baselines depend on the real fonts' metrics — measure once they're in.
    await document.fonts.ready;
    const line = baselineOf(wordmark!);
    for (const label of labels) {
      await expect(Math.abs(baselineOf(label) - line)).toBeLessThan(0.75);
    }
  },
};

export const SignedInDark: Story = {
  ...SignedInOrganizer,
  globals: { theme: 'dark' },
};

/** A guest: the public section plus «Войти» / «Регистрация». */
export const Guest: Story = {
  beforeEach: stubSession('anonymous'),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('Войти')).toBeVisible();
  },
};

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, waitFor } from 'storybook/test';
import { RESEND_VERIFICATION_TERMS } from 'ui';
import { ResendVerificationButton } from '@/lib/auth/ResendVerificationButton';
import { SessionProvider } from '@/lib/auth/session-context';

// CR-168 (KI-026): the only in-app way out of an unverified-email dead end.
// Before the `POST /v1/auth/resend-verification` endpoint behind this button,
// `/register` issued the one and only verification token a user would ever get
// — once it expired (24h) or the email never arrived, the account could not be
// verified through the product at all.
//
// Stories render the real `SessionProvider` and stub `fetch` (the `RideFilters`
// precedent), so the signed-in/anonymous split is the component's actual
// session-resolution path rather than a prop stand-in.

/** Every `POST /api/v1/auth/resend-verification` the stub received. */
const resendRequests = fn<(method: string) => void>();

interface StubOptions {
  /** `/v1/auth/me` — 200 for a signed-in viewer, 401 for an anonymous one. */
  session: 'authenticated' | 'anonymous';
  /** The resend endpoint's reply. */
  resend?: 'ok' | 'rate-limited' | 'error' | 'never-settles';
}

const SIGNED_IN_USER = {
  user: {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'organizer@example.com',
    emailVerified: false,
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

function problem(status: number, code: string) {
  return {
    type: `https://coffee-ride.example/errors/${code}`,
    title: 'Error',
    status,
    detail: 'Request failed.',
    instance: '/v1/auth/resend-verification',
    code,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stub({ session, resend = 'ok' }: StubOptions) {
  return () => {
    const original = globalThis.fetch;
    resendRequests.mockClear();

    globalThis.fetch = async (input, init) => {
      const raw = input instanceof Request ? input.url : String(input);
      const url = new URL(raw, window.location.href);

      if (url.pathname === '/api/v1/auth/me') {
        return session === 'authenticated'
          ? json(SIGNED_IN_USER)
          : json(problem(401, 'unauthorized'), 401);
      }

      if (url.pathname === '/api/v1/auth/resend-verification') {
        resendRequests(init?.method ?? 'GET');
        if (resend === 'never-settles') return new Promise<Response>(() => {});
        if (resend === 'rate-limited') {
          return json(problem(429, 'account_rate_limited'), 429);
        }
        if (resend === 'error') {
          return json(problem(500, 'internal_error'), 500);
        }
        // The real route replies 204 with no body.
        return new Response(null, { status: 204 });
      }

      return original(input, init);
    };

    return () => {
      globalThis.fetch = original;
    };
  };
}

const meta = {
  title: 'Auth/ResendVerificationButton',
  component: ResendVerificationButton,
  tags: ['autodocs'],
  render: () => (
    <SessionProvider>
      <ResendVerificationButton />
    </SessionProvider>
  ),
} satisfies Meta<typeof ResendVerificationButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Signed in and unverified — the state every surface that embeds this is in. */
export const SignedIn: Story = {
  beforeEach: stub({ session: 'authenticated' }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('button', {
        name: RESEND_VERIFICATION_TERMS.submit,
      }),
    ).toBeEnabled();
  },
};

/** The success path: a new link is sent and the button retires itself. */
export const Sent: Story = {
  beforeEach: stub({ session: 'authenticated' }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole('button', {
        name: RESEND_VERIFICATION_TERMS.submit,
      }),
    );

    await expect(
      await canvas.findByText(RESEND_VERIFICATION_TERMS.success),
    ).toBeInTheDocument();
    await expect(resendRequests).toHaveBeenCalledWith('POST');
    // Terminal on purpose: a second send would invalidate the link the user
    // was just told to open, and burn the per-account rate limit.
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};

/** 429 gets its own copy — "wait a minute" is actionable where the generic
 * "try again later" invites an immediate retry that cannot work. */
export const RateLimited: Story = {
  beforeEach: stub({ session: 'authenticated', resend: 'rate-limited' }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole('button', {
        name: RESEND_VERIFICATION_TERMS.submit,
      }),
    );

    await expect(
      await canvas.findByText(RESEND_VERIFICATION_TERMS.rateLimited),
    ).toBeInTheDocument();
    // Still retryable, unlike the success state.
    await expect(canvas.getByRole('button')).toBeEnabled();
  },
};

/** Any other failure keeps the button live so the user can try again. */
export const Failed: Story = {
  beforeEach: stub({ session: 'authenticated', resend: 'error' }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole('button', {
        name: RESEND_VERIFICATION_TERMS.submit,
      }),
    );

    await expect(
      await canvas.findByText(RESEND_VERIFICATION_TERMS.genericError),
    ).toBeInTheDocument();
    await expect(canvas.getByRole('button')).toBeEnabled();
  },
};

/** In flight: disabled via `Button`'s `isLoading`, so a double-click cannot
 * send twice (`.claude/rules/frontend.md`'s duplicate-submit protection). */
export const Sending: Story = {
  beforeEach: stub({ session: 'authenticated', resend: 'never-settles' }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole('button', {
        name: RESEND_VERIFICATION_TERMS.submit,
      }),
    );

    // Disabled while in flight is what enforces duplicate-submit protection:
    // the user cannot send a second request from here, so exactly one was made.
    await expect(
      await canvas.findByRole('button', {
        name: RESEND_VERIFICATION_TERMS.submitPending,
      }),
    ).toBeDisabled();

    await waitFor(async () => {
      await expect(resendRequests).toHaveBeenCalledTimes(1);
    });
  },
};

/** The endpoint is session-authenticated, so an anonymous viewer (a stale link
 * opened in a browser with no session) gets a way forward instead of a button
 * that could only ever 401. */
export const SignedOut: Story = {
  beforeEach: stub({ session: 'anonymous' }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(RESEND_VERIFICATION_TERMS.signedOutHint),
    ).toBeInTheDocument();
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};

/** Both themes, for the token check `docs/design.md` §3 asks for. */
export const Themes: Story = {
  globals: { theme: 'both' },
  beforeEach: stub({ session: 'authenticated' }),
};

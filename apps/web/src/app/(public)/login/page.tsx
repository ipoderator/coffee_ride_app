import type { Metadata } from 'next';
import { AUTH_TERMS } from 'ui';
import { parseOAuthOutcome } from '@/features/auth/oauth/api';
import { OAuthOutcomeAlert } from '@/features/auth/oauth/components/OAuthOutcomeAlert';
import { OAuthSignIn } from '@/features/auth/oauth/components/OAuthSignIn';
import { signInProviders } from '@/features/auth/oauth/server-status';
import { LoginForm } from '@/features/auth/login/components/LoginForm';
import { safeNextPath } from '@/lib/auth/next-path';
import { NO_INDEX } from '@/lib/site/site-meta';

export const metadata: Metadata = {
  title: 'Вход — Coffee Ride',
  // QA live audit 2026-10-08, item 7: not a page to land on from search.
  robots: NO_INDEX,
};

// CR-013: the login screen CR-012 shipped the API for but not the UI
// (`docs/design.md` §8 lists `/login`/`/register` as one screen pair; CR-011
// built `/register`). One `<h1>` per page (docs/design.md §12).
// CR-141: `?next=` (validated here, again in the form) is where a successful
// sign-in returns to — e.g. the ride whose «Зарегистрироваться» sent them here.
// Next.js 15: `searchParams` is a `Promise` for a page component.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
    oauth?: string | string[];
    provider?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  // CR-247, CR-260: a Google/Yandex sign-in that came back without a session says
  // why.
  const oauthOutcome = parseOAuthOutcome(params);
  const providers = await signInProviders();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-h1 text-text">{AUTH_TERMS.loginTitle}</h1>
      <OAuthOutcomeAlert result={oauthOutcome} />
      <LoginForm next={next} />
      <OAuthSignIn next={next} providers={providers} />
    </main>
  );
}

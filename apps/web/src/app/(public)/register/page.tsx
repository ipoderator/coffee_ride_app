import type { Metadata } from 'next';
import Link from 'next/link';
import { REGISTER_PAGE_TERMS } from 'ui';
import { AuthSplitLayout } from '@/features/auth/layout/AuthSplitLayout';
import { OAuthSignIn } from '@/features/auth/oauth/components/OAuthSignIn';
import { signInProviders } from '@/features/auth/oauth/server-status';
import { RegisterForm } from '@/features/auth/register/components/RegisterForm';
import { loginHref, safeNextPath } from '@/lib/auth/next-path';
import { NO_INDEX } from '@/lib/site/site-meta';

export const metadata: Metadata = {
  title: 'Регистрация — Coffee Ride',
  // QA live audit 2026-10-08, item 7: not a page to land on from search.
  robots: NO_INDEX,
};

// First real screen (CR-011). One `<h1>` per page (docs/design.md §12).
// CR-141: `?next=` only passes through — registering doesn't sign in, so the
// form hands it on to `/login`, which returns there after signing in.
// CR-262: laid out like the auth mockup's «Регистрация» tab
// (`reference/coffee-ride-auth-mockup`) — Google/Yandex ID first (a provider
// sign-in creates the account on first use, CR-247/CR-260), then the email form.
// CR-269 (ADR-041): the documents are accepted by the form's own checkboxes — and,
// for a first Google/Yandex sign-in, on `/register/consent` — so no consent line.
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = safeNextPath((await searchParams).next);
  const providers = await signInProviders();
  const hasProviders = Object.values(providers).some(Boolean);

  return (
    <AuthSplitLayout
      storyTitle={REGISTER_PAGE_TERMS.storyTitle}
      storyBody={REGISTER_PAGE_TERMS.storyBody}
    >
      <h1 className="text-h1 text-text">{REGISTER_PAGE_TERMS.title}</h1>
      <p className="mt-3 text-body text-text-secondary">
        {hasProviders
          ? REGISTER_PAGE_TERMS.lead
          : REGISTER_PAGE_TERMS.leadEmailOnly}
      </p>

      <div className="mt-6 flex flex-col gap-5">
        {hasProviders && (
          <>
            <OAuthSignIn next={next} providers={providers} intent="register" />
            <div
              className="flex items-center gap-3 text-body-sm text-text-secondary"
              aria-hidden="true"
            >
              <span className="h-px flex-1 bg-border" />
              {REGISTER_PAGE_TERMS.divider}
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}

        <RegisterForm next={next} />
      </div>

      <p className="mt-5 text-center text-body-sm text-text-secondary">
        {REGISTER_PAGE_TERMS.switchPrompt}{' '}
        <Link
          href={loginHref(next)}
          className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
        >
          {REGISTER_PAGE_TERMS.switchLink}
        </Link>
      </p>
    </AuthSplitLayout>
  );
}

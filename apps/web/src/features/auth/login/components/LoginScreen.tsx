import Link from 'next/link';
import { AUTH_TERMS, LOGIN_PAGE_TERMS } from 'ui';
import { LegalInfoLinks } from '@/components/legal/LegalInfoLinks';
import { registerHref } from '@/lib/auth/next-path';
import { AuthSplitLayout } from '../../layout/AuthSplitLayout';
import type { OAuthOutcome, SignInProvider } from '../../oauth/api';
import { OAuthOutcomeAlert } from '../../oauth/components/OAuthOutcomeAlert';
import { OAuthSignIn } from '../../oauth/components/OAuthSignIn';
import { LoginForm } from './LoginForm';

/**
 * CR-264: `/login` laid out like the auth mockup's «Вход» tab
 * (`reference/coffee-ride-auth-mockup`), in the same frame as `/register`
 * (CR-262): Google/Yandex ID first, «или через email», the email form, then
 * «Нет аккаунта?» and the documents line (CR-269: information only — signing in
 * accepts nothing, ADR-041). The page resolves `next`, the provider
 * outcome and which providers are on; this renders them (and the stories reuse it).
 */
export function LoginScreen({
  next,
  providers,
  oauthOutcome = null,
}: {
  next: string | null;
  providers: Record<SignInProvider, boolean>;
  oauthOutcome?: OAuthOutcome | null;
}) {
  const hasProviders = Object.values(providers).some(Boolean);
  return (
    <AuthSplitLayout
      storyTitle={LOGIN_PAGE_TERMS.storyTitle}
      storyBody={LOGIN_PAGE_TERMS.storyBody}
    >
      <h1 className="text-h1 text-text">{AUTH_TERMS.loginTitle}</h1>
      <p className="mt-3 text-body text-text-secondary">
        {hasProviders ? LOGIN_PAGE_TERMS.lead : LOGIN_PAGE_TERMS.leadEmailOnly}
      </p>

      <div className="mt-6 flex flex-col gap-5">
        <OAuthOutcomeAlert result={oauthOutcome} />
        {hasProviders && (
          <>
            <OAuthSignIn next={next} providers={providers} />
            <div
              className="flex items-center gap-3 text-body-sm text-text-secondary"
              aria-hidden="true"
            >
              <span className="h-px flex-1 bg-border" />
              {LOGIN_PAGE_TERMS.divider}
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}

        <LoginForm next={next} />
      </div>

      <p className="mt-5 text-center text-body-sm text-text-secondary">
        {LOGIN_PAGE_TERMS.switchPrompt}{' '}
        <Link
          href={registerHref(next)}
          className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
        >
          {LOGIN_PAGE_TERMS.switchLink}
        </Link>
      </p>
      <LegalInfoLinks className="mt-2 text-center text-body-sm text-text-secondary" />
    </AuthSplitLayout>
  );
}

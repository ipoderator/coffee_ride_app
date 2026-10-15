import type { Metadata } from 'next';
import { OAUTH_SIGNUP_TERMS, REGISTER_PAGE_TERMS } from 'ui';
import { AuthSplitLayout } from '@/features/auth/layout/AuthSplitLayout';
import { OAuthSignupConsent } from '@/features/auth/oauth-signup/components/OAuthSignupConsent';
import { NO_INDEX } from '@/lib/site/site-meta';

export const metadata: Metadata = {
  title: `${OAUTH_SIGNUP_TERMS.title} — Coffee Ride`,
  robots: NO_INDEX,
};

// CR-268 (ADR-041): the consent step of a first Google/Yandex sign-in — the callback
// sends the browser here before any account or session exists. In the `/register`
// frame; the component reads the pending sign-up from the API.
export default function OAuthSignupConsentPage() {
  return (
    <AuthSplitLayout
      storyTitle={REGISTER_PAGE_TERMS.storyTitle}
      storyBody={REGISTER_PAGE_TERMS.storyBody}
    >
      <OAuthSignupConsent />
    </AuthSplitLayout>
  );
}

import type { Metadata } from 'next';
import { OAuthSignIn } from '@/features/auth/oauth/components/OAuthSignIn';
import { signInProviders } from '@/features/auth/oauth/server-status';
import { RegisterForm } from '@/features/auth/register/components/RegisterForm';
import { safeNextPath } from '@/lib/auth/next-path';
import { NO_INDEX } from '@/lib/site/site-meta';

export const metadata: Metadata = {
  title: 'Регистрация — Coffee Ride',
  // QA live audit 2026-10-08, item 7: not a page to land on from search.
  robots: NO_INDEX,
};

// First real screen (CR-011). One `<h1>` per page (docs/design.md §12).
// CR-141: `?next=` only passes through — registering doesn't sign in, so the
// form hands it on to `/login`, which returns there after signing in.
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = safeNextPath((await searchParams).next);
  const providers = await signInProviders();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-h1 text-text">Регистрация</h1>
      <RegisterForm next={next} />
      {/* CR-247, CR-260: a Google/Yandex sign-in creates the account on first use. */}
      <OAuthSignIn next={next} providers={providers} />
    </main>
  );
}

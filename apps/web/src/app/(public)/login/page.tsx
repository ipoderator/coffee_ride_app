import type { Metadata } from 'next';
import { AUTH_TERMS } from 'ui';
import { LoginForm } from '@/features/auth/login/components/LoginForm';
import { safeNextPath } from '@/lib/auth/next-path';

export const metadata: Metadata = {
  title: 'Вход — Coffee Ride',
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
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = safeNextPath((await searchParams).next);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-h1 text-text">{AUTH_TERMS.loginTitle}</h1>
      <LoginForm next={next} />
    </main>
  );
}

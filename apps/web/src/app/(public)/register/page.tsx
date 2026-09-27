import type { Metadata } from 'next';
import { RegisterForm } from '@/features/auth/register/components/RegisterForm';
import { safeNextPath } from '@/lib/auth/next-path';

export const metadata: Metadata = {
  title: 'Регистрация — Coffee Ride',
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

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold text-text">Регистрация</h1>
      <RegisterForm next={next} />
    </main>
  );
}

import type { Metadata } from 'next';
import { AUTH_TERMS } from 'ui';
import { LoginForm } from '@/features/auth/login/components/LoginForm';

export const metadata: Metadata = {
  title: 'Вход — Coffee Ride',
};

// CR-013: the login screen CR-012 shipped the API for but not the UI
// (`docs/design.md` §8 lists `/login`/`/register` as one screen pair; CR-011
// built `/register`). One `<h1>` per page (docs/design.md §12).
export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold text-text">
        {AUTH_TERMS.loginTitle}
      </h1>
      <LoginForm />
    </main>
  );
}

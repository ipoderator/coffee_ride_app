import type { Metadata } from 'next';
import { FORGOT_PASSWORD_TERMS } from 'ui';
import { ForgotPasswordForm } from '@/features/auth/forgot-password/components/ForgotPasswordForm';
import { NO_INDEX } from '@/lib/site/site-meta';

export const metadata: Metadata = {
  title: 'Восстановление пароля — Coffee Ride',
  // QA live audit 2026-10-08, item 7: not a page to land on from search.
  robots: NO_INDEX,
};

// `/forgot-password` (CR-099, closes KI-042's screen gap). One `<h1>` per
// page (docs/design.md §12).
export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-h1 text-text">{FORGOT_PASSWORD_TERMS.pageTitle}</h1>
      <ForgotPasswordForm />
    </main>
  );
}

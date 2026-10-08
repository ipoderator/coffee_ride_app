import type { Metadata } from 'next';
import { RESET_PASSWORD_TERMS } from 'ui';
import { ResetPasswordForm } from '@/features/auth/reset-password/components/ResetPasswordForm';
import { NO_INDEX } from '@/lib/site/site-meta';

export const metadata: Metadata = {
  title: 'Новый пароль — Coffee Ride',
  // QA live audit 2026-10-08, item 7: not a page to land on from search.
  robots: NO_INDEX,
};

// `/reset-password` (CR-099, closes KI-042's screen gap). One `<h1>` per
// page (docs/design.md §12).
//
// Next.js 15: `searchParams` is a `Promise` for a page component.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-h1 text-text">{RESET_PASSWORD_TERMS.pageTitle}</h1>
      <ResetPasswordForm token={token ?? null} />
    </main>
  );
}

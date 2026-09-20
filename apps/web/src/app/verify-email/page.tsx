import type { Metadata } from 'next';
import { VERIFY_EMAIL_TERMS } from 'ui';
import { VerifyEmailStatus } from '@/features/auth/verify-email/components/VerifyEmailStatus';

export const metadata: Metadata = {
  title: 'Подтверждение email — Coffee Ride',
};

// `/verify-email` (CR-099, closes KI-026's screen gap). The register
// success screen's dev-only note links here with `?token=...`. One `<h1>`
// per page (docs/design.md §12).
//
// Next.js 15: `searchParams` is a `Promise` for a page component.
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold text-text">
        {VERIFY_EMAIL_TERMS.pageTitle}
      </h1>
      <VerifyEmailStatus token={token ?? null} />
    </main>
  );
}

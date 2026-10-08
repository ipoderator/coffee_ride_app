import type { Metadata } from 'next';
import { VERIFY_EMAIL_TERMS } from 'ui';
import { VerifyEmailStatus } from '@/features/auth/verify-email/components/VerifyEmailStatus';
import { safeNextPath } from '@/lib/auth/next-path';
import { NO_INDEX } from '@/lib/site/site-meta';

export const metadata: Metadata = {
  title: 'Подтверждение email — Coffee Ride',
  // QA live audit 2026-10-08, item 7: not a page to land on from search.
  robots: NO_INDEX,
};

// `/verify-email` (CR-099, closes KI-026's screen gap). The register
// success screen's dev-only note links here with `?token=...`. One `<h1>`
// per page (docs/design.md §12). CR-197: `?next=` (validated here, again in
// the link) passes through to `/login`, as on `/register` (CR-141).
//
// Next.js 15: `searchParams` is a `Promise` for a page component.
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; next?: string | string[] }>;
}) {
  const { token, next } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-h1 text-text">{VERIFY_EMAIL_TERMS.pageTitle}</h1>
      <VerifyEmailStatus token={token ?? null} next={safeNextPath(next)} />
    </main>
  );
}

import type { Metadata } from 'next';
import { LEGAL_UPDATE_TERMS } from 'ui';
import { LegalUpdateForm } from '@/features/legal/reconsent/components/LegalUpdateForm';
import { DEFAULT_AFTER_LOGIN, safeNextPath } from '@/lib/auth/next-path';
import { NO_INDEX } from '@/lib/site/site-meta';

export const metadata: Metadata = {
  title: `${LEGAL_UPDATE_TERMS.title} — Coffee Ride`,
  robots: NO_INDEX,
};

// CR-268 (ADR-041): where `LegalAcceptanceGate` sends a signed-in person with a
// material new document version pending. `next` returns them where they were.
export default async function LegalUpdatePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = safeNextPath((await searchParams).next) ?? DEFAULT_AFTER_LOGIN;
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10 md:px-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-h1 text-text">{LEGAL_UPDATE_TERMS.title}</h1>
        <p className="text-body text-text-secondary">
          {LEGAL_UPDATE_TERMS.lead}
        </p>
      </div>
      <LegalUpdateForm next={next} />
    </main>
  );
}

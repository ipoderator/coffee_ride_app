'use client';

import Link from 'next/link';
import { CABINET_TERMS, EmptyState } from 'ui';
import { useCurrentUser } from '@/lib/auth/current-user-context';

// Minimal cabinet-home stub (`docs/design.md` §8: "Participant cabinet
// home") — just enough that the route isn't a 404 now that `CabinetShell`
// exists. Widgets/registry content for this screen are CR-015/CR-054, out of
// this ticket's scope (CR-013 is the Profile screen).
export default function ParticipantCabinetHomePage() {
  const user = useCurrentUser();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-text">
        {CABINET_TERMS.homeTitle}
      </h1>
      <p className="text-sm text-text-secondary">{user.email}</p>
      <EmptyState
        title={CABINET_TERMS.homeEmptyTitle}
        description={CABINET_TERMS.homeEmptyDescription}
      />
      {/* CR-014: the only entry point into the organizer cabinet until CR-015's
          dashboard exists — without this, `/organizer/profile` would only be
          reachable by typing the URL by hand. */}
      <div className="flex flex-col gap-2 rounded-md border border-border p-4">
        <h2 className="text-lg font-medium text-text">
          {CABINET_TERMS.organizerCtaTitle}
        </h2>
        <p className="text-sm text-text-secondary">
          {CABINET_TERMS.organizerCtaDescription}
        </p>
        <Link
          href="/organizer/profile"
          className="self-start text-sm font-medium text-primary hover:underline"
        >
          {CABINET_TERMS.organizerCtaLink}
        </Link>
      </div>
    </div>
  );
}

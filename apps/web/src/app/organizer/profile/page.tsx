'use client';

import { BACK_LINK_TERMS, ORGANIZER_TERMS } from 'ui';
import { BackLink } from '@/components/site/BackLink';
import { OrganizerProfileForm } from '@/features/organizer/profile/components/OrganizerProfileForm';

// `/organizer/profile` — "Organizer profile" (`docs/design.md` §8, CR-014). Unlike
// `/me/profile`, the current user alone isn't enough to render this screen —
// `OrganizerProfile` is a separate resource that may or may not exist yet, so
// `OrganizerProfileForm` fetches it itself (see that component for the create-vs-edit
// state handling).
export default function OrganizerProfilePage() {
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/organizer" label={BACK_LINK_TERMS.toOrganizerCabinet} />
      <h1 className="text-2xl font-semibold text-text">
        {ORGANIZER_TERMS.pageTitle}
      </h1>
      <OrganizerProfileForm />
    </div>
  );
}

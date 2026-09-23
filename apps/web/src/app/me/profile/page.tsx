'use client';

import { BACK_LINK_TERMS, PROFILE_TERMS } from 'ui';
import { BackLink } from '@/components/site/BackLink';
import { AvatarUploadForm } from '@/features/participant/profile/components/AvatarUploadForm';
import { ProfileForm } from '@/features/participant/profile/components/ProfileForm';
import { useCurrentUser } from '@/lib/auth/current-user-context';

// `/me/profile` — "Profile settings" (`docs/design.md` §8, CR-013). The
// current user is already resolved by `CabinetShell` (the layout above this
// page); no second fetch here.
export default function ProfilePage() {
  const user = useCurrentUser();

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/me" label={BACK_LINK_TERMS.toParticipantCabinet} />
      <h1 className="text-2xl font-semibold text-text">
        {PROFILE_TERMS.pageTitle}
      </h1>
      <AvatarUploadForm
        initialAvatarUrl={user.avatarUrl}
        name={user.displayName}
      />
      <ProfileForm initialUser={user} />
    </div>
  );
}

import { ORGANIZER_NEAREST_RIDE_TERMS } from 'ui';
import { NearestRideRedirect } from '@/components/cabinet/NearestRideRedirect';

// CR-131: the sidebar's «Участники» — opens the nearest ride's participants.
export default function OrganizerParticipantsPage() {
  return (
    <NearestRideRedirect
      target="participants"
      title={ORGANIZER_NEAREST_RIDE_TERMS.participantsNavLabel}
    />
  );
}

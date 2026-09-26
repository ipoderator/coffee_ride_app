import { ORGANIZER_NEAREST_RIDE_TERMS } from 'ui';
import { NearestRideRedirect } from '@/components/cabinet/NearestRideRedirect';

// CR-131: the sidebar's «Обновления» — opens the nearest ride's updates.
export default function OrganizerUpdatesPage() {
  return (
    <NearestRideRedirect
      target="updates"
      title={ORGANIZER_NEAREST_RIDE_TERMS.updatesNavLabel}
    />
  );
}

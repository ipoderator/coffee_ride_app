import type { DashboardWidget } from '@/lib/cabinet/types';
import { OrganizerEntryWidget } from './components/OrganizerEntryWidget';

// CR-185: `/me`'s organizer card (`@/lib/cabinet/participant-widgets.ts`),
// after the registrations.
export const organizerEntryWidget: DashboardWidget = {
  id: 'participant-organizer-entry',
  order: 20,
  Component: OrganizerEntryWidget,
};

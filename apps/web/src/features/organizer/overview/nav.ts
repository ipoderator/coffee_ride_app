import type { DashboardWidget } from '@/lib/cabinet/types';
import { OrganizerOverviewWidget } from './components/OrganizerOverviewWidget';

// CR-131: first on `/organizer` (registry `@/lib/cabinet/organizer-widgets.ts`)
// — the greeting and the four KPI cells head the page, the activity widget
// (order 30) follows.
export const organizerOverviewWidget: DashboardWidget = {
  id: 'organizer-overview',
  order: 10,
  Component: OrganizerOverviewWidget,
};

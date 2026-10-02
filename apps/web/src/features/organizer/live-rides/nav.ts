import type { DashboardWidget } from '@/lib/cabinet/types';
import { LiveRidesWidget } from './components/LiveRidesWidget';

// Registers into `@/lib/cabinet/organizer-widgets.ts` between the overview
// (order 10) and the activity feed (order 30): rides under way with the finish
// control, then the upcoming ones the organizer has already published.
export const organizerLiveRidesWidget: DashboardWidget = {
  id: 'organizer-live-rides',
  order: 20,
  Component: LiveRidesWidget,
};

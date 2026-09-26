import type { DashboardWidget } from '@/lib/cabinet/types';
import { RegistrationActivityWidget } from './components/RegistrationActivityWidget';

// CR-130 (ADR-024): registers into `@/lib/cabinet/organizer-widgets.ts`, after
// `organizerRideSummaryWidget` (order 20) — the totals first, then who just
// signed up and how the week went.
export const organizerRegistrationActivityWidget: DashboardWidget = {
  id: 'organizer-registration-activity',
  order: 30,
  Component: RegistrationActivityWidget,
};

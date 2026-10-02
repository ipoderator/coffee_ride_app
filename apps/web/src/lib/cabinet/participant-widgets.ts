import { upcomingRegistrationsWidget } from '@/features/participant/my-rides/nav';
import { organizerEntryWidget } from '@/features/participant/organizer-entry/nav';
import type { DashboardWidget } from './types';

// CR-185 (UX handoff P2): `/me`'s widgets, the participant counterpart of
// `organizer-widgets.ts` (ADR-009 registry — `.claude/rules/extensibility.md`).
// Replaces the CR-013 stub («Пока здесь нечего показать» + a create-profile
// offer shown even to existing organizers). A future participant feature
// adds its descriptor here, not a branch in `app/me/page.tsx`.
export const PARTICIPANT_WIDGETS: DashboardWidget[] = [
  upcomingRegistrationsWidget,
  organizerEntryWidget,
].sort((a, b) => a.order - b.order);

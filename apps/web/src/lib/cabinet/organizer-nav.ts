import { organizerProfileNavItem } from '@/features/organizer/profile/nav';
import { organizerParticipantsNavItem } from '@/features/organizer/participants/nav';
import { organizerRidesNavItem } from '@/features/organizer/rides/nav';
import { organizerUpdatesNavItem } from '@/features/organizer/updates/nav';
import type { CabinetNavItem } from './types';

// ADR-009 registry (`.claude/rules/extensibility.md`) — the organizer cabinet's
// counterpart to `participant-nav.ts`. `/organizer/profile` (CR-014) and
// `/organizer/rides/new` (CR-017), and since CR-131 «Участники»/«Обновления»
// (nearest ride); later ride-management screens add their own descriptors
// here, not a branch in `AppHeader`.
export const ORGANIZER_NAV_ITEMS: CabinetNavItem[] = [
  organizerProfileNavItem,
  organizerRidesNavItem,
  organizerParticipantsNavItem,
  organizerUpdatesNavItem,
].sort((a, b) => a.order - b.order);

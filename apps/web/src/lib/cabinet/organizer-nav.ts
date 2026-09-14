import { organizerProfileNavItem } from '@/features/organizer/profile/nav';
import { organizerRidesNavItem } from '@/features/organizer/rides/nav';
import type { CabinetNavItem } from './types';

// ADR-009 registry (`.claude/rules/extensibility.md`) — the organizer cabinet's
// counterpart to `participant-nav.ts`. `/organizer/profile` (CR-014) and
// `/organizer/rides/new` (CR-017) so far; later ride-management screens add their
// own descriptors here, not a branch in `CabinetShell`.
export const ORGANIZER_NAV_ITEMS: CabinetNavItem[] = [
  organizerProfileNavItem,
  organizerRidesNavItem,
].sort((a, b) => a.order - b.order);

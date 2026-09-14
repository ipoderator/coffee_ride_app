import { organizerProfileNavItem } from '@/features/organizer/profile/nav';
import type { CabinetNavItem } from './types';

// ADR-009 registry (`.claude/rules/extensibility.md`) — the organizer cabinet's
// counterpart to `participant-nav.ts`. One entry today (`/organizer/profile`,
// CR-014); CR-015 (Dashboard) and later ride-management screens add their own
// descriptors here, not a branch in `CabinetShell`.
export const ORGANIZER_NAV_ITEMS: CabinetNavItem[] = [
  organizerProfileNavItem,
].sort((a, b) => a.order - b.order);

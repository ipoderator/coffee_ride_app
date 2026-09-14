import { profileNavItem } from '@/features/participant/profile/nav';
import type { CabinetNavItem } from './types';

// ADR-009 registry (`.claude/rules/extensibility.md`): a future participant
// feature adds its own `nav.ts` descriptor and one import line here — it
// does not touch `CabinetShell.tsx`'s render logic. Sorted once, at module
// load, by `order`.
export const PARTICIPANT_NAV_ITEMS: CabinetNavItem[] = [profileNavItem].sort(
  (a, b) => a.order - b.order,
);

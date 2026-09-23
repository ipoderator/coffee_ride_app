import { profileNavItem } from '@/features/participant/profile/nav';
import { myRegistrationsNavItem } from '@/features/participant/my-rides/nav';
import { notificationsNavItem } from '@/features/participant/notifications/nav';
import type { CabinetNavItem } from './types';

// ADR-009 registry (`.claude/rules/extensibility.md`): a future participant
// feature adds its own `nav.ts` descriptor and one import line here — it
// does not touch `AppHeader.tsx`'s render logic. Sorted once, at module
// load, by `order`.
export const PARTICIPANT_NAV_ITEMS: CabinetNavItem[] = [
  profileNavItem,
  myRegistrationsNavItem,
  notificationsNavItem,
].sort((a, b) => a.order - b.order);

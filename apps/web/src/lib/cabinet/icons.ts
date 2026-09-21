import { Bell, Bike, CircleUser, Ticket, type LucideIcon } from 'lucide-react';

// CR-106: the resolvable side of `CabinetNavItem.icon` (see that field's own
// doc comment for why a name, not the `lucide-react` component, crosses the
// server/client prop boundary). Add a new icon here, then reference its name
// from a feature's `nav.ts` descriptor.
export const CABINET_ICONS = {
  CircleUser,
  Bike,
  Ticket,
  Bell,
} satisfies Record<string, LucideIcon>;

export type CabinetIconName = keyof typeof CABINET_ICONS;

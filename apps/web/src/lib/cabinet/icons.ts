import {
  Bell,
  Bike,
  CircleUser,
  House,
  Send,
  Ticket,
  Users,
  type LucideIcon,
} from 'lucide-react';

// CR-106: the resolvable side of `CabinetNavItem.icon` (see that field's own
// doc comment for why a name, not the `lucide-react` component, crosses the
// server/client prop boundary). Add a new icon here, then reference its name
// from a feature's `nav.ts` descriptor.
export const CABINET_ICONS = {
  CircleUser,
  Bike,
  Ticket,
  Bell,
  // CR-131: the organizer sidebar's «Обзор», «Участники», «Обновления».
  House,
  Users,
  Send,
} satisfies Record<string, LucideIcon>;

export type CabinetIconName = keyof typeof CABINET_ICONS;

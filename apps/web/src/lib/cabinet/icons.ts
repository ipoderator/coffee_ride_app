import {
  Bell,
  Bike,
  CircleUser,
  House,
  ImageIcon,
  MessageSquareText,
  Route,
  ScrollText,
  Send,
  Ticket,
  Users,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { AccountAddIcon } from './AccountAddIcon';

/** What a cabinet icon must accept: every renderer passes only these two
 * props, so a `lucide-react` icon and a project SVG component both fit. */
type CabinetIcon = ComponentType<{
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}>;

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
  // CR-186: the ride management view's «Разделы» rows (Маршрут, Обложка,
  // Группы — the last one from line-md, not lucide; see `AccountAddIcon`).
  Route,
  ImageIcon,
  // CR-231: the admin section's «Отзывы» and «Журнал».
  MessageSquareText,
  ScrollText,
  AccountAdd: AccountAddIcon,
} satisfies Record<string, CabinetIcon>;

export type CabinetIconName = keyof typeof CABINET_ICONS;

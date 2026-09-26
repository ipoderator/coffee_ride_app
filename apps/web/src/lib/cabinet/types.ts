import type { ComponentType } from 'react';
import type { CabinetIconName } from './icons';

// ADR-009 / `.claude/rules/extensibility.md`: cabinet features register a
// descriptor into a shared list instead of the shell branching per feature.
// This is the descriptor shape both the participant and (later) organizer
// registries use.
export interface CabinetNavItem {
  label: string;
  href: string;
  /** Lower sorts first. Leave gaps (10, 20, 30, ...) so a future feature can
   * slot in between without renumbering existing ones. */
  order: number;
  /** CR-055: staged-rollout gate (`./feature-flags.ts`'s `FEATURE_<name>` env
   * var). Omit for an always-enabled item — the common case; every current
   * entry omits it since nothing is mid-rollout today. */
  flag?: string;
  /** CR-106 (`/impeccable critique` P2, "Quiet Instrument" direction: outline
   * icons, always paired with a text label, never icon-only). A *name* into
   * `./icons.ts`'s registry, not the `lucide-react` component itself — this
   * registry is built by a Server Component (`app/layout.tsx` since CR-108)
   * and passed as a prop into the Client Component `AppHeader`, and React
   * Server Components can only serialize plain data across that boundary, not
   * a function/`forwardRef` component value. `AppHeader` resolves the name
   * back to a component client-side.
   * Optional so a feature that hasn't picked an icon yet still renders
   * (label-only), same as before this field existed. */
  icon?: CabinetIconName;
  /** CR-132: a live counter shown beside the label (the mockup's «Участники
   * 3»). A *name* for the same serialization reason as `icon`: the cabinet
   * frame resolves it client-side (`@/lib/organizer/nav-badges.ts`) and
   * shows nothing while it loads, fails, or is zero. */
  badge?: CabinetNavBadge;
}

/** CR-132: the live counters a nav item can carry — see `CabinetNavItem.badge`. */
export type CabinetNavBadge = 'newRegistrations';

/** Resolved values per badge name; a missing name renders no badge. */
export type CabinetNavBadgeCounts = Partial<Record<CabinetNavBadge, number>>;

// CR-015: same registration-over-branching pattern as `CabinetNavItem`, for
// dashboard widgets (`docs/design.md` §8: "Dashboard (widgets from the ADR-009
// registry)"). A feature owns its own data fetching/loading/error states
// inside `Component`; the registry only orders (and, per CR-055, flag-gates)
// it on the page.
export interface DashboardWidget {
  /** Unique within one registry — used as the React list key. */
  id: string;
  /** Lower sorts first. Leave gaps (10, 20, 30, ...), same convention as
   * `CabinetNavItem.order`. */
  order: number;
  Component: ComponentType;
  /** CR-055: same staged-rollout gate as `CabinetNavItem.flag`. */
  flag?: string;
}

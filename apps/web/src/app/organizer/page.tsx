import { CABINET_TERMS, EmptyState } from 'ui';
import { filterEnabled } from '@/lib/cabinet/feature-flags';
import { ORGANIZER_WIDGETS } from '@/lib/cabinet/organizer-widgets';

// `/organizer` dashboard (CR-015, `docs/design.md` §8: "Dashboard (widgets
// from the ADR-009 registry)"). Renders `ORGANIZER_WIDGETS` as a grid —
// adding an organizer widget means adding a descriptor to that registry, not
// editing this page (`.claude/rules/extensibility.md`: registration over
// branching). The `EmptyState` fallback covers an empty (or fully
// flag-gated, CR-055) registry — keeps this page correct rather than
// assuming at least one widget always survives filtering.
//
// A plain Server Component (no `'use client'`) on purpose: `filterEnabled`
// (CR-055) needs to run server-side (`feature-flags.ts`), and a Server
// Component can render a Client Component as a child just fine — each
// widget's own `Component` (e.g. `OrganizerOverviewWidget`) stays
// `'use client'` unchanged.
export default function OrganizerCabinetHomePage() {
  const widgets = filterEnabled(ORGANIZER_WIDGETS);

  return (
    <div className="flex flex-col gap-6">
      {/* CR-131: the visible head is the overview widget's greeting (mockup
          screen 4); the page keeps its one `h1` for screen readers and the
          document outline without a second, visual title. */}
      <h1 className="sr-only">{CABINET_TERMS.organizerHomeTitle}</h1>
      {widgets.length === 0 ? (
        <EmptyState
          title={CABINET_TERMS.dashboardNoWidgetsTitle}
          description={CABINET_TERMS.dashboardNoWidgetsDescription}
        />
      ) : (
        <div className="grid gap-4">
          {widgets.map(({ id, Component }) => (
            <Component key={id} />
          ))}
        </div>
      )}
    </div>
  );
}

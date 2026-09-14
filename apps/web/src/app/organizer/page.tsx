'use client';

import { CABINET_TERMS, EmptyState } from 'ui';
import { ORGANIZER_WIDGETS } from '@/lib/cabinet/organizer-widgets';

// `/organizer` dashboard (CR-015, `docs/design.md` §8: "Dashboard (widgets
// from the ADR-009 registry)"). Renders `ORGANIZER_WIDGETS` as a grid —
// adding an organizer widget means adding a descriptor to that registry, not
// editing this page (`.claude/rules/extensibility.md`: registration over
// branching). The `EmptyState` fallback covers an empty registry, which
// can't happen today (one widget always registers) but keeps this page
// correct if that ever changes rather than assuming at least one widget.
export default function OrganizerCabinetHomePage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-text">
        {CABINET_TERMS.organizerHomeTitle}
      </h1>
      {ORGANIZER_WIDGETS.length === 0 ? (
        <EmptyState
          title={CABINET_TERMS.dashboardNoWidgetsTitle}
          description={CABINET_TERMS.dashboardNoWidgetsDescription}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {ORGANIZER_WIDGETS.map(({ id, Component }) => (
            <Component key={id} />
          ))}
        </div>
      )}
    </div>
  );
}

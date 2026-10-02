import { CABINET_TERMS } from 'ui';
import { filterEnabled } from '@/lib/cabinet/feature-flags';
import { PARTICIPANT_WIDGETS } from '@/lib/cabinet/participant-widgets';

// `/me` — participant cabinet home (`docs/design.md` §8). CR-185 (UX handoff
// P2) replaced the CR-013 stub with `PARTICIPANT_WIDGETS` (ADR-009 registry,
// same shape as `/organizer`): the next registrations and the organizer card.
// A Server Component so `filterEnabled` (CR-055) runs server-side; each
// widget is its own Client Component. Who is signed in is already on the
// account bar above (`CabinetShell`), so the page doesn't repeat the email.
export default function ParticipantCabinetHomePage() {
  const widgets = filterEnabled(PARTICIPANT_WIDGETS);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1 text-text">{CABINET_TERMS.homeTitle}</h1>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {widgets.map(({ id, Component }) => (
          <Component key={id} />
        ))}
      </div>
    </div>
  );
}

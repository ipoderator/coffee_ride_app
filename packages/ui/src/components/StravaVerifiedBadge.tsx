import { cn } from '../lib/cn';
import { STRAVA_SYNC_TERMS } from '../terminology';

// CR-234 (ADR-033): the «Проверено Strava» mark in Strava's brand orange, shared by
// the participant's ticket and the organizer's participant list / live widget. Same
// tinted "printed stamp" chip as `StatusBadge`'s non-danger tones; the text stays in
// `strava-text` (AA in both themes), the exact Strava hex only tints border and ground.
export function StravaVerifiedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border border-strava/40 bg-strava/10 px-3 py-1 text-body-sm leading-none font-semibold text-strava-text',
        className,
      )}
    >
      {STRAVA_SYNC_TERMS.verifiedTitle}
    </span>
  );
}

import { MapPinOff } from 'lucide-react';
import { Button, RIDE_DISCOVERY_ROW_TERMS } from 'ui';

/**
 * CR-185 (UX handoff P2): `DiscoveryMap`'s notice over the map area when the
 * map was created but its basemap never drew (or the render failed) — what
 * happened, that the list still works, and «Повторить» (`onRetry`
 * re-creates the map in place; the filters live in the parent).
 */
export function BasemapUnavailableNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      data-basemap-unavailable
      className="pointer-events-auto flex max-w-sm items-start gap-3 rounded-xl border border-border bg-bg-raised p-4 shadow-overlay"
    >
      <MapPinOff
        className="mt-0.5 size-5 shrink-0 text-warning"
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-body-sm font-semibold text-text">
          {RIDE_DISCOVERY_ROW_TERMS.basemapUnavailableTitle}
        </p>
        <p className="text-body-sm text-text-secondary">
          {RIDE_DISCOVERY_ROW_TERMS.basemapUnavailableDescription}
        </p>
        <Button
          variant="secondary"
          className="mt-2 self-start"
          onClick={onRetry}
        >
          {RIDE_DISCOVERY_ROW_TERMS.basemapRetry}
        </Button>
      </div>
    </div>
  );
}

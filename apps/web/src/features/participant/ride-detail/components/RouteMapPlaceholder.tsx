import { cn, ErrorState, ROUTE_RENDERING_TERMS } from 'ui';

/**
 * `/rides/[id]`'s route map degraded state (CR-028, kept live by the KI-036
 * real-render work). `RouteMap` falls back to this whenever
 * `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` is missing or a real MapGL render fails —
 * same reasoning as discovery's `RideMapPlaceholder` (CR-026). A separate,
 * independent instance rather than a shared import:
 * `.claude/rules/extensibility.md` forbids one feature module
 * (`features/participant/discovery/`) reaching into another's internals
 * (`features/participant/ride-detail/`).
 */
export function RouteMapPlaceholder({ className }: { className?: string }) {
  // CR-119: sized like the map it replaces (`className` is the map's own
  // height/framing), the notice centered on a plain `surface` sheet.
  return (
    <div
      className={cn(
        'flex h-80 w-full items-center justify-center overflow-hidden rounded-lg bg-surface p-4',
        className,
      )}
    >
      <ErrorState
        message={ROUTE_RENDERING_TERMS.mapUnavailable}
        tone="warning"
        variant="inline"
      />
    </div>
  );
}

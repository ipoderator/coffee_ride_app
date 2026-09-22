import Image from 'next/image';
import Link from 'next/link';
import type { PublicRide } from 'types';
import { apiAssetUrl } from '@/lib/api/asset-url';
import { isFeatureEnabled } from '@/lib/cabinet/feature-flags';
import {
  Card,
  GLASS_PANEL_CLASSNAME,
  MetricRow,
  MetricTile,
  METRIC_TERMS,
  RIDE_DETAIL_TERMS,
  RIDE_DISCOVERY_TERMS,
  RIDE_STATUS_TERMS,
  StatusBadge,
  cn,
  formatDate,
  formatDistanceParts,
  formatElevationParts,
  formatPriceParts,
  formatSpeedParts,
  formatTime,
} from 'ui';

/**
 * Feature-local, not `packages/ui` (`docs/design.md` §9's component inventory lists
 * `RideCard` under "Feature-local ... not shared"). `docs/design.md` §6: "on a ride
 * card, show the first three" of the canonical distance/elevation/pace/duration
 * order — literally the first three (distance, elevation, pace), not duration; each
 * omitted (never em-dashed) when `null`, same rule `RideDetailView` (CR-023)
 * established. Links into `/rides/[id]` (CR-023).
 */
export function RideCard({ ride }: { ride: PublicRide }) {
  const statusTerm = RIDE_STATUS_TERMS[ride.status];
  const startDate = new Date(ride.startsAt);
  // CR-107 ("Quiet Instrument"): glass title/status panel over the cover
  // photo instead of the plain block below it — `RideCard` is a Server
  // Component, so the flag reads directly rather than threading a prop.
  const coverGlassPanel =
    isFeatureEnabled('COVER_GLASS_PANEL') && ride.coverImageUrl !== null;

  return (
    <Link href={`/rides/${ride.id}`}>
      <Card className="flex flex-col gap-3 transition-opacity hover:opacity-90">
        {ride.coverImageUrl ? (
          // ADR-019/CR-086: `coverImageUrl` is the API's bare `/v1/...` path
          // (ADR-011) — `apiAssetUrl` adds the `/api` same-origin rewrite
          // prefix (`next.config.ts`). Same-origin either way, so `next/image`
          // needs no `images.remotePatterns` entry — that config is only for
          // cross-origin sources.
          <div className="relative h-40 w-full overflow-hidden rounded-lg">
            <Image
              src={apiAssetUrl(ride.coverImageUrl)}
              alt=""
              fill
              className="object-cover"
            />
            {coverGlassPanel && (
              // `--scrim` guarantees the panel reads against any uploaded
              // photo (docs/design.md §3); `GLASS_PANEL_CLASSNAME` is the
              // shared `--glass-bg`/`--glass-border` treatment, reserved for
              // exactly this surface and the sticky registration bar.
              <div className="absolute inset-x-0 bottom-0 bg-scrim p-2 pt-6">
                <div
                  className={cn(
                    GLASS_PANEL_CLASSNAME,
                    'flex items-center gap-2 rounded-md px-3 py-1.5',
                  )}
                >
                  <p className="text-sm font-medium text-text">{ride.title}</p>
                  <StatusBadge
                    label={statusTerm.label}
                    tone={statusTerm.tone}
                  />
                </div>
              </div>
            )}
          </div>
        ) : null}

        {!coverGlassPanel && (
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium text-text">{ride.title}</p>
            <StatusBadge label={statusTerm.label} tone={statusTerm.tone} />
          </div>
        )}

        <p className="text-sm text-text-secondary">
          {RIDE_DISCOVERY_TERMS.organizedByLabel}: {ride.organizer.name}
        </p>

        <p className="text-sm text-text">
          {formatDate(startDate, { timeZone: ride.startTimezone })}
          {', '}
          {formatTime(startDate, { timeZone: ride.startTimezone })}
        </p>

        <MetricRow>
          {ride.distanceKm !== null && (
            <MetricTile
              label={METRIC_TERMS.distance}
              {...formatDistanceParts(ride.distanceKm)}
            />
          )}
          {ride.elevationGainMeters !== null && (
            <MetricTile
              label={METRIC_TERMS.elevation}
              {...formatElevationParts(ride.elevationGainMeters)}
            />
          )}
          {ride.paceKmh !== null && (
            <MetricTile
              label={METRIC_TERMS.pace}
              {...formatSpeedParts(ride.paceKmh)}
            />
          )}
        </MetricRow>

        <MetricTile
          label={RIDE_DETAIL_TERMS.priceLabel}
          {...formatPriceParts(ride.priceRub)}
        />
      </Card>
    </Link>
  );
}

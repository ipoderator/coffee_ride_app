'use client';

import type { ReactNode } from 'react';
import {
  cn,
  MetricTile,
  RIDE_POSTER_TERMS,
  SegmentedControl,
  StatusBadge,
  type MetricParts,
  type StatusTone,
} from 'ui';

export type HeroView = 'track' | 'map';

export interface HeroMetric {
  key: string;
  label: string;
  parts: MetricParts;
  /** Under the value — e.g. «3 группы» under the pace range. */
  note?: string;
  /** Elevation keeps its own ink on the band (`docs/design.md` §3). */
  tone?: 'elevation';
  missing: boolean;
}

const VIEW_OPTIONS = [
  { value: 'track', label: RIDE_POSTER_TERMS.viewTrack },
  { value: 'map', label: RIDE_POSTER_TERMS.viewMap },
] as const;

/**
 * CR-151: the poster's hero — a dark «window» (ADR-024 `cover-*` inks, the
 * same in both UI themes; the section carries the `dark` token scope so
 * chips/labels on it use the dark palette) with two faces behind one switch:
 * the drawn track (`TrackCover`) or the live 2GIS map. Under it, the numbers
 * band — distance, elevation, pace, duration — visible in both faces; a
 * missing number is `—`, never dropped or `0` (`docs/design.md` §6).
 */
export function RideHero({
  view,
  onViewChange,
  canShowMap,
  statusTerm,
  track,
  map,
  caption,
  metrics,
}: {
  view: HeroView;
  onViewChange: (view: HeroView) => void;
  /** Whether there is anything to put on a map (route, pins or a start). */
  canShowMap: boolean;
  statusTerm: { label: string; tone: StatusTone };
  track: ReactNode;
  map: ReactNode;
  /** Shown over the track face — «Маршрут пока не загружен». */
  caption?: string | null;
  metrics: HeroMetric[];
}) {
  const shownView = canShowMap ? view : 'track';

  return (
    <section
      aria-label={RIDE_POSTER_TERMS.heroLabel}
      className="dark relative -mx-4 overflow-hidden bg-cover-bg sm:mx-0 sm:rounded-[28px]"
    >
      <div className="relative h-65 sm:h-80">
        {shownView === 'track' ? track : map}
        <div className="absolute inset-x-3.5 top-3.5 z-10 flex items-start justify-between gap-2 sm:inset-x-5 sm:top-5 sm:left-5.5">
          <StatusBadge
            label={statusTerm.label}
            tone={statusTerm.tone}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs leading-4 font-semibold',
              statusTerm.tone !== 'danger' && 'bg-cover-bg/90',
            )}
          />
          {canShowMap ? (
            <SegmentedControl
              name="ride-hero-view"
              legend={RIDE_POSTER_TERMS.viewLabel}
              options={VIEW_OPTIONS}
              value={shownView}
              onChange={onViewChange}
              tone="cover"
            />
          ) : null}
        </div>
        {shownView === 'track' && caption ? (
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-cover-bg px-2.5 py-1 font-mono text-[13px] whitespace-nowrap text-text-muted">
            {caption}
          </p>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 border-t border-cover-line p-4 sm:grid-cols-[repeat(4,auto)] sm:justify-start sm:gap-x-11 sm:px-6.5 sm:pt-5 sm:pb-5.5">
        {metrics.map((metric) => (
          <MetricTile
            key={metric.key}
            label={metric.label}
            value={metric.parts.value}
            unit={metric.parts.unit}
            note={metric.note}
            size="lg"
            className="min-w-0 [&_dt]:text-text-muted"
            valueClassName={cn(
              'text-cover-ink',
              metric.tone === 'elevation' && 'text-elevation',
              metric.missing && 'text-cover-ink/40',
            )}
          />
        ))}
      </div>
    </section>
  );
}

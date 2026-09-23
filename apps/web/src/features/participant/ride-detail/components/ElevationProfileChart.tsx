'use client';

import { useMemo, useState } from 'react';
import { formatDistance, formatElevation } from 'ui';
import {
  buildElevationProfile,
  type ElevationProfileInputPoint,
} from '../lib/elevation-profile';

const VIEW_WIDTH = 600;
const VIEW_HEIGHT = 160;
const PADDING_Y = 12;

/**
 * `/rides/[id]`'s elevation profile (CR-028, `docs/design.md` §6 "Elevation
 * profile"): area chart, x = distance, y = elevation, `contour` brown fill at ~15%
 * opacity with a 1.5px stroke (ADR-021: the map's own elevation ink); the y axis floors at the data's own minimum (not
 * forced to zero) so a small elevation spread over a long distance doesn't render
 * flat. Hover/touch shows distance + elevation at the nearest point; the numeric
 * "keyboard-accessible alternative" the spec calls for is the `MetricTile`
 * distance/elevation figures `RideDetailView` already renders elsewhere on the page,
 * not a second control on this chart — this `<svg>` carries `role="img"` +
 * `aria-label` instead, same as any other purely illustrative graphic.
 */
export function ElevationProfileChart({
  points,
}: {
  points: ElevationProfileInputPoint[];
}) {
  const profile = useMemo(() => buildElevationProfile(points), [points]);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const known = profile.filter((point) => point.elevationMeters !== null);
  if (profile.length < 2 || known.length < 2) {
    // Not enough real elevation data to draw a meaningful line — the numeric
    // metrics elsewhere on the page already cover "no elevation data" (`—`).
    return null;
  }

  const maxDistanceKm = profile[profile.length - 1]!.distanceKm || 1;
  const elevations = known.map((point) => point.elevationMeters!);
  const minElevation = Math.min(...elevations);
  const maxElevation = Math.max(...elevations);
  // A sensible floor, not zero: pad the observed range by 10% (at least 5m) so a
  // near-flat profile still shows visible relief instead of a straight line pinned
  // to the very top or bottom of the chart.
  const range = Math.max(maxElevation - minElevation, 5);
  const floor = minElevation - range * 0.1;
  const ceiling = maxElevation + range * 0.1;
  const spread = ceiling - floor || 1;

  function xFor(distanceKm: number) {
    return (distanceKm / maxDistanceKm) * VIEW_WIDTH;
  }
  function yFor(elevationMeters: number) {
    const usable = VIEW_HEIGHT - PADDING_Y * 2;
    return PADDING_Y + usable - ((elevationMeters - floor) / spread) * usable;
  }

  const linePoints = profile.map((point) => ({
    x: xFor(point.distanceKm),
    y: yFor(point.elevationMeters ?? minElevation),
  }));
  const linePath = linePoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`)
    .join(' ');
  const areaPath = `${linePath} L${linePoints[linePoints.length - 1]!.x},${VIEW_HEIGHT} L${linePoints[0]!.x},${VIEW_HEIGHT} Z`;

  const hovered = hoverIndex !== null ? profile[hoverIndex] : null;

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width),
    );
    const distanceKm = ratio * maxDistanceKm;
    let nearest = 0;
    let nearestDelta = Infinity;
    for (let i = 0; i < profile.length; i++) {
      const delta = Math.abs(profile[i]!.distanceKm - distanceKm);
      if (delta < nearestDelta) {
        nearestDelta = delta;
        nearest = i;
      }
    }
    setHoverIndex(nearest);
  }

  return (
    <div className="relative">
      <svg
        role="img"
        aria-label={`Профиль высоты: от ${Math.round(minElevation)} до ${Math.round(maxElevation)} м на протяжении ${maxDistanceKm.toFixed(1)} км`}
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-40 w-full touch-none"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <path d={areaPath} className="fill-contour/15" />
        <path
          d={linePath}
          className="fill-none stroke-contour"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {hovered && hoverIndex !== null ? (
          <line
            x1={linePoints[hoverIndex]!.x}
            x2={linePoints[hoverIndex]!.x}
            y1={0}
            y2={VIEW_HEIGHT}
            className="stroke-border-input"
            strokeWidth={1}
            strokeDasharray="2,2"
          />
        ) : null}
      </svg>
      {hovered ? (
        <div className="pointer-events-none absolute top-0 rounded-md border border-border bg-bg-raised px-2 py-1 text-xs text-text shadow-overlay">
          {formatDistance(hovered.distanceKm)} ·{' '}
          {hovered.elevationMeters !== null
            ? formatElevation(hovered.elevationMeters)
            : '—'}
        </div>
      ) : null}
    </div>
  );
}

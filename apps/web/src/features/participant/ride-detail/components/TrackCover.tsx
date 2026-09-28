'use client';

import { useMemo, useRef } from 'react';
import type { LatLng } from 'maps-core';
import { cn } from 'ui';
import { downsample } from '../lib/elevation-profile';
import type { MarkKind } from '../lib/route-point-colors';
import {
  fitProjection,
  pointAtDistance,
  type RouteTrack,
} from '../lib/route-track';
import { useElementSize } from '../lib/use-element-size';

export interface CoverMark {
  id: string;
  point: LatLng;
  kind: MarkKind;
}

// A real track is thousands of GPX points; a few hundred draw the same line.
const MAX_TRACK_POINTS = 600;
const MAX_SILHOUETTE_POINTS = 200;
// With no track, a lone start pin shouldn't fill the cover: frame at least
// ~2 km around the pins.
const POINTS_ONLY_MIN_SPAN_KM = 2;

/** Ink per pin: ends in the cover's own ink, food/coffee stops in the
 * elevation amber, hazards red, everything else blue (the mockup's cover). */
function markClassName(kind: MarkKind): { className: string; r: number } {
  switch (kind) {
    case 'ride-start':
    case 'start':
    case 'finish':
      return { className: 'fill-cover-ink', r: 6 };
    case 'food':
    case 'stop':
    case 'named-stop':
      return { className: 'fill-elevation', r: 5.5 };
    case 'danger':
      return { className: 'fill-danger', r: 5 };
    default:
      return { className: 'fill-info', r: 4.5 };
  }
}

/** Two sets of wobbly concentric rings — the cover's decorative «isolines»
 * (ADR-024), deterministic per ride so it never reshuffles on a re-render. */
function isolinePaths(width: number, height: number, seed: string): string[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const phase = (Math.abs(hash) % 628) / 100;
  const centres: Array<[number, number, number, number]> = [
    [width * 0.74, height * 0.38, 18, phase],
    [width * 0.16, height * 1.02, 11, phase + 2.3],
  ];
  const paths: string[] = [];
  for (const [cx, cy, rings, offset] of centres) {
    for (let k = 1; k <= rings; k += 1) {
      const r0 = k * Math.max(width, height) * 0.028;
      let d = '';
      for (let j = 0; j <= 72; j += 1) {
        const theta = (j / 72) * 2 * Math.PI;
        const r =
          r0 *
          (1 +
            0.14 * Math.sin(3 * theta + k * 0.4 + offset) +
            0.07 * Math.sin(7 * theta - k * 0.6));
        d += `${j ? 'L' : 'M'}${(cx + r * Math.cos(theta) * 1.35).toFixed(1)} ${(cy + r * Math.sin(theta)).toFixed(1)}`;
      }
      paths.push(`${d}Z`);
    }
  }
  return paths;
}

/**
 * CR-151: the hero's «Трек» face — the real route geometry on the dark cover
 * (ADR-024 `cover-*` inks, the same in both UI themes), an elevation
 * silhouette along its foot, the typed pins, and a dot that follows the
 * pointer over the elevation profile (`hoverKm`). Without a track only the
 * pins are drawn — never joined by straight lines (they are not a route).
 */
export function TrackCover({
  track,
  marks,
  hoverKm,
  seed,
  cancelled = false,
  label,
}: {
  track: RouteTrack | null;
  marks: CoverMark[];
  hoverKm: number | null;
  seed: string;
  cancelled?: boolean;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(ref, { width: 800, height: 320 });

  const drawing = useMemo(() => {
    const narrow = width < 640;
    const top = narrow ? 64 : 70;
    const box = narrow
      ? { x: 24, y: top, width: width - 48, height: height - top - 24 }
      : {
          x: width * 0.3,
          y: top,
          width: width * 0.62,
          height: height - top - 28,
        };
    const geo = track ? track.points : marks.map((mark) => mark.point);
    const project = fitProjection(
      geo,
      box,
      track ? 0 : POINTS_ONLY_MIN_SPAN_KM,
    );

    let trackPath: string | null = null;
    let silhouette: string | null = null;
    if (track && project) {
      trackPath = downsample(track.points, MAX_TRACK_POINTS)
        .map((point, i) => {
          const [x, y] = project(point);
          return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join('');

      const indices = downsample(
        track.points.map((_, i) => i),
        MAX_SILHOUETTE_POINTS,
      ).filter((i) => track.points[i]!.elevationMeters !== null);
      if (indices.length >= 2) {
        const elevations = indices.map(
          (i) => track.points[i]!.elevationMeters!,
        );
        const min = Math.min(...elevations);
        const spread = Math.max(...elevations) - min || 1;
        silhouette = `M0 ${height}${indices
          .map((i, n) => {
            const x = (track.cumulativeKm[i]! / track.totalKm) * width;
            const y =
              height - 8 - ((elevations[n]! - min) / spread) * height * 0.3;
            return `L${x.toFixed(1)} ${y.toFixed(1)}`;
          })
          .join('')}L${width} ${height}Z`;
      }
    }

    return {
      project,
      trackPath,
      silhouette,
      isolines: isolinePaths(width, height, seed),
    };
  }, [track, marks, width, height, seed]);

  const scrub =
    track && drawing.project && hoverKm !== null
      ? drawing.project(pointAtDistance(track, hoverKm))
      : null;

  return (
    <div ref={ref} className="absolute inset-0">
      <svg
        role="img"
        aria-label={label}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={cn(
          'block h-full w-full',
          cancelled && 'opacity-55 saturate-0',
        )}
      >
        <rect width={width} height={height} className="fill-cover-bg" />
        <g
          fill="none"
          className="stroke-cover-line"
          strokeWidth={1.2}
          data-isolines
        >
          {drawing.isolines.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        {drawing.silhouette ? (
          <path
            d={drawing.silhouette}
            className="fill-cover-elevation"
            opacity={0.22}
          />
        ) : null}
        {drawing.trackPath ? (
          <>
            <path
              d={drawing.trackPath}
              fill="none"
              className="stroke-cover-bg"
              strokeWidth={10}
              strokeLinejoin="round"
            />
            <path
              d={drawing.trackPath}
              fill="none"
              className="stroke-cover-route"
              strokeWidth={3.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        ) : null}
        {drawing.project
          ? marks.map((mark) => {
              const [x, y] = drawing.project!(mark.point);
              const { className, r } = markClassName(mark.kind);
              return (
                <circle
                  key={mark.id}
                  data-testid="cover-mark"
                  cx={x}
                  cy={y}
                  r={r}
                  className={cn(className, 'stroke-cover-bg')}
                  strokeWidth={3}
                />
              );
            })
          : null}
        {scrub ? (
          <circle
            data-testid="cover-scrub"
            cx={scrub[0]}
            cy={scrub[1]}
            r={7}
            className="fill-cover-bg stroke-cover-ink"
            strokeWidth={3}
          />
        ) : null}
      </svg>
    </div>
  );
}

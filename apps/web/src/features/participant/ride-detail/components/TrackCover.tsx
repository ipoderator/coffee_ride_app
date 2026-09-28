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

const ISOLINE_RINGS = 7;

/** One set of sparse, wobbly concentric rings around the track's own centre —
 * the cover's decorative «isolines» (ADR-024), fading outwards so they frame
 * the route instead of competing with it. Deterministic per ride, so it never
 * reshuffles on a re-render. */
function isolinePaths(
  width: number,
  height: number,
  centre: [number, number],
  seed: string,
): Array<{ d: string; opacity: number }> {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const phase = (Math.abs(hash) % 628) / 100;
  const [cx, cy] = centre;
  const step = Math.max(width, height) * 0.07;
  const paths: Array<{ d: string; opacity: number }> = [];
  for (let k = 1; k <= ISOLINE_RINGS; k += 1) {
    const r0 = k * step;
    let d = '';
    for (let j = 0; j <= 72; j += 1) {
      const theta = (j / 72) * 2 * Math.PI;
      const r =
        r0 *
        (1 +
          0.1 * Math.sin(3 * theta + k * 0.4 + phase) +
          0.05 * Math.sin(7 * theta - k * 0.6));
      d += `${j ? 'L' : 'M'}${(cx + r * Math.cos(theta) * 1.6).toFixed(1)} ${(cy + r * Math.sin(theta)).toFixed(1)}`;
    }
    paths.push({ d: `${d}Z`, opacity: 1 - (k - 1) / ISOLINE_RINGS });
  }
  return paths;
}

/**
 * CR-151: the hero's «Трек» face — the real route geometry on the dark cover
 * (ADR-024 `cover-*` inks, the same in both UI themes), centred in the window
 * with even margins over a few faint isolines, the typed pins, and a dot that
 * follows the pointer over the elevation profile (`hoverKm`). No elevation
 * silhouette here: the profile chart below the hero already draws it, and on
 * the cover it sat under the track. Without a track only the pins are drawn —
 * never joined by straight lines (they are not a route).
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
    // Top clears the status chip and the «Трек/Карта» switch; the bottom
    // keeps the same air, so the route sits centred in what's left.
    const top = narrow ? 64 : 76;
    const bottom = narrow ? 28 : 36;
    const side = narrow ? 24 : Math.max(56, width * 0.08);
    const box = {
      x: side,
      y: top,
      width: width - side * 2,
      height: height - top - bottom,
    };
    const geo = track ? track.points : marks.map((mark) => mark.point);
    const project = fitProjection(
      geo,
      box,
      track ? 0 : POINTS_ONLY_MIN_SPAN_KM,
    );

    const trackPath =
      track && project
        ? downsample(track.points, MAX_TRACK_POINTS)
            .map((point, i) => {
              const [x, y] = project(point);
              return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
            })
            .join('')
        : null;

    return {
      project,
      trackPath,
      isolines: isolinePaths(
        width,
        height,
        [box.x + box.width / 2, box.y + box.height / 2],
        seed,
      ),
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
          {drawing.isolines.map(({ d, opacity }, i) => (
            <path key={i} d={d} opacity={opacity} />
          ))}
        </g>
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

import type { ReactNode } from 'react';
import { cn } from 'ui';
import {
  projectRoutePreviewToBox,
  smoothRoutePreview,
} from '../lib/route-preview';

const VIEW_WIDTH = 400;
const VIEW_HEIGHT = 160;
const TRACK_PADDING = 20;

// ADR-024: three fixed decorative isoline backgrounds (the mockup's `cv1`/
// `cv2`/`cv3` spirit — a ride's cover is always a dark "window", not a real
// elevation chart baked into the art). Picked deterministically per ride so
// the same ride always gets the same background; only the route track itself
// (below) is real, per-ride geometry.
const BACKGROUNDS = [
  {
    isolines: [
      'M-20 26C60 4 140 50 220 26S350 0 420 18',
      'M-20 148C70 124 150 170 240 146S350 126 420 138',
    ],
    ellipses: [
      { cx: 300, cy: 96, rx: 96, ry: 44 },
      { cx: 300, cy: 96, rx: 62, ry: 27 },
      { cx: 70, cy: 110, rx: 58, ry: 26 },
    ],
  },
  {
    isolines: [
      'M-20 130C80 104 160 150 250 126S370 104 420 118',
      'M-20 104C80 80 160 124 250 100S370 80 420 92',
      'M260 -10C300 26 380 26 420 12',
    ],
    ellipses: [
      { cx: 120, cy: 52, rx: 100, ry: 32 },
      { cx: 120, cy: 52, rx: 66, ry: 20 },
    ],
  },
  {
    isolines: ['M-20 148C80 128 160 160 250 144S370 130 420 140'],
    ellipses: [
      { cx: 200, cy: 72, rx: 150, ry: 48 },
      { cx: 200, cy: 72, rx: 110, ry: 34 },
      { cx: 200, cy: 72, rx: 70, ry: 20 },
    ],
  },
] as const;

/** Deterministic small-int hash — same ride always picks the same background. */
function pickBackground(seed: string): (typeof BACKGROUNDS)[number] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return BACKGROUNDS[Math.abs(hash) % BACKGROUNDS.length]!;
}

export interface RouteCoverProps {
  /** Sampled `[lat, lng]` route points (`GET /v1/rides`'s `routePreview`) —
   * `null` before a route is uploaded. */
  routePreview: Array<[number, number]> | null;
  /** Any stable per-ride string (the ride id) — picks the decorative
   * background deterministically, not randomly on every render. */
  seed: string;
  /** ADR-024: a cancelled ride's cover desaturates (`docs/design.md` §1's
   * "colour never carries meaning alone" — paired with the caller's own
   * strikethrough title and «Отменён» chip, not a replacement for them). */
  cancelled?: boolean;
  /** The status chip. Rendered in a `dark` token scope: the cover is dark in
   * both UI themes, so a light-theme tone ink would vanish on it. */
  topLeft?: ReactNode;
  /** Shown on the cover when there is no track to draw. */
  emptyLabel?: string;
  className?: string;
}

/**
 * CR-144 («B2»): the grid card's cover carries the route and the status chip
 * only — every fact (date, title, metrics, seats) is on the card's panel
 * below it, so nothing competes with the track for contrast.
 */
export function RouteCover({
  routePreview,
  seed,
  cancelled = false,
  topLeft,
  emptyLabel,
  className,
}: RouteCoverProps) {
  const background = pickBackground(seed);
  const track = projectRoutePreviewToBox(
    routePreview ? smoothRoutePreview(routePreview) : null,
    VIEW_WIDTH,
    VIEW_HEIGHT,
    TRACK_PADDING,
  );
  const trackPoints = track?.split(' ') ?? null;
  const start = trackPoints?.[0]?.split(',');
  const finishPoint = trackPoints?.[trackPoints.length - 1];
  const finish =
    finishPoint && finishPoint !== trackPoints?.[0]
      ? finishPoint.split(',')
      : null;

  return (
    <div
      className={cn(
        'relative isolate h-40 shrink-0 overflow-hidden bg-cover-bg',
        className,
      )}
    >
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="xMidYMid slice"
        className={cn(
          'absolute inset-0 -z-10 h-full w-full',
          cancelled && 'saturate-0 brightness-75',
        )}
      >
        <g fill="none" className="stroke-cover-line" strokeWidth={1.2}>
          {background.isolines.map((d, i) => (
            <path key={`iso-${i}`} d={d} />
          ))}
          {background.ellipses.map((e, i) => (
            <ellipse key={`el-${i}`} {...e} />
          ))}
        </g>
        {track ? (
          <>
            <polyline
              points={track}
              fill="none"
              className="stroke-cover-bg"
              strokeWidth={8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={track}
              fill="none"
              className="stroke-cover-route"
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        ) : null}
        {start ? (
          <>
            <circle
              cx={start[0]}
              cy={start[1]}
              r={7}
              className="fill-cover-route"
            />
            <circle
              cx={start[0]}
              cy={start[1]}
              r={2.8}
              className="fill-cover-bg"
            />
          </>
        ) : null}
        {finish ? (
          <circle
            cx={finish[0]}
            cy={finish[1]}
            r={5.5}
            className="fill-cover-bg stroke-cover-elevation"
            strokeWidth={2.5}
          />
        ) : null}
      </svg>
      {!track && emptyLabel ? (
        <p className="absolute inset-x-0 bottom-4 text-center font-mono text-xs text-cover-ink/60">
          {emptyLabel}
        </p>
      ) : null}
      {topLeft ? (
        <div className="dark absolute top-3.5 left-3.5">{topLeft}</div>
      ) : null}
    </div>
  );
}

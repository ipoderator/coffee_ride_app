import type { ReactNode } from 'react';
import { cn } from 'ui';
import {
  projectRoutePreviewToBox,
  smoothRoutePreview,
} from '../lib/route-preview';

const VIEW_WIDTH = 400;
const VIEW_HEIGHT = 260;

// ADR-024: three fixed decorative isoline/elevation-silhouette backgrounds
// (same spirit as the mockup's `cv1`/`cv2`/`cv3` — a ride's cover is always a
// dark "window", not a real elevation chart baked into the art). Picked
// deterministically per ride so the same ride always gets the same
// background, not fetched/computed from route data — only the route track
// itself (below) is real, per-ride geometry.
const BACKGROUNDS = [
  {
    isolines: [
      'M-20 40C60 10 140 70 220 40S360 0 420 30',
      'M-20 75C70 45 150 105 230 75S360 40 420 65',
    ],
    ellipses: [
      { cx: 270, cy: 130, rx: 95, ry: 52 },
      { cx: 270, cy: 130, rx: 64, ry: 34 },
      { cx: 90, cy: 150, rx: 60, ry: 30 },
    ],
    silhouette:
      'M0 260V238L20 232 44 236 70 222 96 228 120 214 146 220 172 204 196 212 222 198 250 210 276 196 300 206 326 190 350 202 376 194 400 200V260Z',
  },
  {
    isolines: [
      'M-20 200C80 170 160 230 250 200S370 170 420 190',
      'M-20 165C80 135 160 195 250 165S370 135 420 155',
      'M260 -10C300 40 380 40 420 20',
    ],
    ellipses: [
      { cx: 120, cy: 80, rx: 100, ry: 46 },
      { cx: 120, cy: 80, rx: 66, ry: 28 },
    ],
    silhouette:
      'M0 260V230L30 228 60 220 90 222 120 210 150 214 180 206 210 214 240 200 270 190 300 196 330 182 360 186 400 176V260Z',
  },
  {
    isolines: ['M-20 230C80 200 160 250 250 225S370 205 420 220'],
    ellipses: [
      { cx: 200, cy: 110, rx: 150, ry: 70 },
      { cx: 200, cy: 110, rx: 110, ry: 50 },
      { cx: 200, cy: 110, rx: 70, ry: 30 },
    ],
    silhouette:
      'M0 260V236L40 230 80 216 120 206 160 196 200 190 240 198 280 210 320 220 360 228 400 232V260Z',
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
  /** Sampled `[lat, lng]` route points (`GET /v1/rides`'s `routePreview`, or
   * the fuller ride-detail geometry) — `null` before a route is uploaded. */
  routePreview: Array<[number, number]> | null;
  /** Any stable per-ride string (the ride id) — picks the decorative
   * background deterministically, not randomly on every render. */
  seed: string;
  /** ADR-024: a cancelled ride's cover desaturates its track (`docs/design.md`
   * §1's "colour never carries meaning alone" — paired with the caller's own
   * strikethrough title and "Отменён" chip, not a replacement for them). */
  cancelled?: boolean;
  topLeft?: ReactNode;
  topRight?: ReactNode;
  /** Bottom content — date/title/metrics/people, composed by the caller so
   * the same cover works as a card and as the ride-detail hero. */
  children?: ReactNode;
  className?: string;
}

export function RouteCover({
  routePreview,
  seed,
  cancelled = false,
  topLeft,
  topRight,
  children,
  className,
}: RouteCoverProps) {
  const background = pickBackground(seed);
  // Confined to the box's upper ~60%: the bottom holds the text content
  // (`children`) under the scrim, and the track shouldn't fight it for
  // legibility (found live — an untrimmed box drew the route straight
  // through the title/metrics on a tall track).
  const track = projectRoutePreviewToBox(
    routePreview ? smoothRoutePreview(routePreview) : null,
    VIEW_WIDTH,
    VIEW_HEIGHT * 0.6,
    16,
  );
  const trackPoints = track?.split(' ') ?? null;
  const startPoint = trackPoints?.[0];
  const finishPoint = trackPoints?.[trackPoints.length - 1];

  return (
    <div
      className={cn(
        'relative isolate flex min-h-[220px] flex-col justify-end overflow-hidden rounded-3xl bg-cover-bg text-cover-ink',
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
        <g fill="none" className="stroke-cover-line" strokeWidth={1.3}>
          {background.isolines.map((d, i) => (
            <path key={`iso-${i}`} d={d} />
          ))}
          {background.ellipses.map((e, i) => (
            <ellipse key={`el-${i}`} {...e} />
          ))}
        </g>
        <path
          d={background.silhouette}
          className="fill-cover-elevation"
          opacity={0.55}
        />
        {trackPoints ? (
          <>
            <polyline
              points={track!}
              fill="none"
              className="stroke-cover-bg"
              strokeWidth={9}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={track!}
              fill="none"
              className="stroke-cover-route"
              strokeWidth={4.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        ) : null}
        {startPoint ? (
          <>
            <circle
              cx={startPoint.split(',')[0]}
              cy={startPoint.split(',')[1]}
              r={8}
              className="fill-cover-route"
            />
            <circle
              cx={startPoint.split(',')[0]}
              cy={startPoint.split(',')[1]}
              r={3.2}
              className="fill-cover-bg"
            />
          </>
        ) : null}
        {finishPoint && finishPoint !== startPoint ? (
          <circle
            cx={finishPoint.split(',')[0]}
            cy={finishPoint.split(',')[1]}
            r={6}
            className="fill-cover-bg stroke-elevation"
            strokeWidth={2.5}
          />
        ) : null}
      </svg>
      {/* Legibility scrim under the bottom content, not glass (docs/design.md
          §1 still bans blur/glass — this is a plain gradient). */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--cover-bg)_0%,transparent)_35%,color-mix(in_srgb,var(--cover-bg)_92%,transparent)_100%)]"
      />
      {topLeft ? <div className="absolute top-3 left-3">{topLeft}</div> : null}
      {topRight ? (
        <div className="absolute top-2.5 right-2.5">{topRight}</div>
      ) : null}
      {children ? <div className="grid gap-2 p-4">{children}</div> : null}
    </div>
  );
}

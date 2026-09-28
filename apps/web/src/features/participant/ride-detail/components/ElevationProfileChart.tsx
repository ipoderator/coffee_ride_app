'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { formatDistance, formatElevation, RIDE_POSTER_TERMS } from 'ui';
import { downsample } from '../lib/elevation-profile';
import type { RouteTrack } from '../lib/route-track';
import { useElementSize } from '../lib/use-element-size';

const HEIGHT = 160;
const PAD = { left: 40, right: 10, top: 12, bottom: 22 };
const MAX_SAMPLES = 240;

/** The smallest «nice» step that splits `span` into at most `maxTicks` parts. */
function niceStep(span: number, maxTicks: number): number {
  for (const step of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) {
    if (span / step <= maxTicks) return step;
  }
  return 1000;
}

interface Sample {
  km: number;
  elevation: number;
}

/**
 * `/rides/[id]`'s elevation profile (CR-028; CR-151 «Постер заезда v2»): an
 * area chart in `elevation` ink (40%→12% gradient over a `border-input`
 * ground line, CR-128) drawn in real pixels with a metres grid and a km axis.
 * Hover/touch shows the distance and height at the pointer in the header and
 * reports the distance (`onHoverKm`) so the hero can put a dot on the track.
 * The `<svg>` is `role="img"` with a summary label — the headline distance and
 * elevation figures in the hero are the numbers' accessible form (§12).
 */
export function ElevationProfileChart({
  track,
  label,
  onHoverKm,
}: {
  track: RouteTrack;
  label: string;
  onHoverKm?: (km: number | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(ref, { width: 600, height: HEIGHT });
  const [hover, setHover] = useState<Sample | null>(null);
  // `useId`'s delimiters aren't guaranteed safe inside `url(#...)`.
  const fillId = `elevation-fill-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const samples = useMemo<Sample[]>(
    () =>
      downsample(
        track.points.map((point, i) => ({
          km: track.cumulativeKm[i]!,
          elevation: point.elevationMeters,
        })),
        MAX_SAMPLES,
      ).filter((sample): sample is Sample => sample.elevation !== null),
    [track],
  );

  if (samples.length < 2) {
    // Not enough elevation data to draw a line — the hero's «Набор высоты»
    // already says `—` when there is none.
    return null;
  }

  const elevations = samples.map((sample) => sample.elevation);
  const min = Math.min(...elevations);
  const max = Math.max(...elevations);
  const yStep = niceStep(Math.max(max - min, 10), 4);
  const lo = Math.floor((min - yStep * 0.2) / yStep) * yStep;
  const hi = Math.ceil((max + yStep * 0.1) / yStep) * yStep;
  const innerWidth = Math.max(width - PAD.left - PAD.right, 10);
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (km: number) => PAD.left + (km / track.totalKm) * innerWidth;
  const y = (elevation: number) =>
    PAD.top + (1 - (elevation - lo) / (hi - lo || 1)) * innerHeight;

  const line = samples
    .map(
      (sample, i) =>
        `${i ? 'L' : 'M'}${x(sample.km).toFixed(1)} ${y(sample.elevation).toFixed(1)}`,
    )
    .join('');
  const area = `${line}L${x(samples[samples.length - 1]!.km).toFixed(1)} ${PAD.top + innerHeight}L${x(samples[0]!.km).toFixed(1)} ${PAD.top + innerHeight}Z`;

  const yTicks: number[] = [];
  for (let value = lo; value <= hi; value += yStep) yTicks.push(value);
  const kmStep = niceStep(
    track.totalKm,
    Math.max(2, Math.floor(innerWidth / 70)),
  );
  const kmTicks: number[] = [];
  for (let km = 0; km <= track.totalKm; km += kmStep) kmTicks.push(km);

  function handlePointer(event: React.PointerEvent<SVGRectElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / (rect.width || 1)),
    );
    const km = ratio * track.totalKm;
    let nearest = samples[0]!;
    for (const sample of samples) {
      if (Math.abs(sample.km - km) < Math.abs(nearest.km - km))
        nearest = sample;
    }
    setHover(nearest);
    onHoverKm?.(nearest.km);
  }

  function handleLeave() {
    setHover(null);
    onHoverKm?.(null);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-xs font-semibold tracking-[0.06em] text-text-secondary uppercase">
          {label}
        </h3>
        <span
          className="font-mono text-xs text-text-secondary tabular-nums"
          data-testid="elevation-readout"
        >
          {hover
            ? `${formatDistance(hover.km)} · ${formatElevation(hover.elevation)}`
            : RIDE_POSTER_TERMS.elevationHint}
        </span>
      </div>
      <div ref={ref} className="relative h-40 touch-pan-y">
        <svg
          role="img"
          aria-label={`Профиль высоты: от ${Math.round(min)} до ${Math.round(max)} м на протяжении ${formatDistance(track.totalKm)}`}
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="block h-full w-full"
        >
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0"
                className="[stop-color:var(--elevation)]"
                stopOpacity={0.4}
              />
              <stop
                offset="1"
                className="[stop-color:var(--elevation)]"
                stopOpacity={0.12}
              />
            </linearGradient>
          </defs>
          {yTicks.map((value) => (
            <g key={`y-${value}`}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(value)}
                y2={y(value)}
                className="stroke-border"
              />
              <text
                x={PAD.left - 6}
                y={y(value) + 4}
                textAnchor="end"
                className="fill-text-muted font-mono text-[11px]"
              >
                {value}
              </text>
            </g>
          ))}
          {kmTicks.map((km, i) => (
            <text
              key={`x-${km}`}
              x={x(km)}
              y={HEIGHT - 5}
              textAnchor={i === 0 ? 'start' : 'middle'}
              className="fill-text-muted font-mono text-[11px]"
            >
              {i === kmTicks.length - 1 ? `${km} км` : km}
            </text>
          ))}
          <path d={area} fill={`url(#${fillId})`} />
          <line
            x1={PAD.left}
            x2={width - PAD.right}
            y1={PAD.top + innerHeight}
            y2={PAD.top + innerHeight}
            className="stroke-border-input"
          />
          <path
            d={line}
            className="fill-none stroke-elevation"
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {hover ? (
            <g pointerEvents="none">
              <line
                x1={x(hover.km)}
                x2={x(hover.km)}
                y1={PAD.top}
                y2={PAD.top + innerHeight}
                className="stroke-text-muted"
                strokeDasharray="3 3"
              />
              <circle
                cx={x(hover.km)}
                cy={y(hover.elevation)}
                r={5}
                className="fill-elevation stroke-bg"
                strokeWidth={2}
              />
            </g>
          ) : null}
          <rect
            data-testid="elevation-hit"
            x={PAD.left}
            y={0}
            width={innerWidth}
            height={HEIGHT}
            fill="transparent"
            className="cursor-crosshair"
            onPointerMove={handlePointer}
            onPointerDown={handlePointer}
            onPointerLeave={handleLeave}
          />
        </svg>
      </div>
    </div>
  );
}

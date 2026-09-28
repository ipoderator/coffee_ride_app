import {
  Coffee,
  Droplet,
  Flag,
  type LucideIcon,
  MapPin,
  Pause,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import { cn, RIDE_POSTER_TERMS } from 'ui';
import {
  type MarkKind,
  ROUTE_POINT_MARKER_COLOR_VAR,
  STOP_MARKER_COLOR_VAR,
} from '../lib/route-point-colors';
import type { TimelineItem } from '../lib/timeline';

const ICONS: Record<MarkKind, LucideIcon> = {
  'ride-start': Flag,
  start: Flag,
  finish: Flag,
  'named-stop': Coffee,
  food: Coffee,
  stop: Pause,
  water: Droplet,
  danger: TriangleAlert,
  technical: Wrench,
  other: MapPin,
};

/** The same token colour the map's pin of that kind uses (§14: a token, never
 * a literal), so the list reads as the map's key. */
function colorVar(kind: MarkKind): string {
  if (kind === 'ride-start') return ROUTE_POINT_MARKER_COLOR_VAR.start;
  if (kind === 'named-stop') return STOP_MARKER_COLOR_VAR;
  return ROUTE_POINT_MARKER_COLOR_VAR[kind];
}

/**
 * CR-151: «Маршрут по точкам» (after 21st ln-dev7/how-it-works-02: a dashed
 * rail through icon nodes) — replaces CR-119's «Условные знаки» legend and is
 * still the map's non-visual equivalent (§12). Each node repeats its map pin's
 * colour with an icon; the words carry the meaning, the colour never alone.
 */
export function RouteTimeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) return null;
  const withKm = items.some((item) => item.km !== null);

  return (
    <ol className="flex flex-col" data-testid="route-timeline">
      {items.map((item, index) => {
        const Icon = ICONS[item.kind];
        const km = item.km !== null ? Math.round(item.km) : null;
        return (
          <li
            key={item.id}
            className={cn(
              'relative grid gap-x-3',
              withKm ? 'grid-cols-[3.5rem_2rem_1fr]' : 'grid-cols-[2rem_1fr]',
            )}
          >
            {withKm ? (
              <span className="text-right font-num text-2xl leading-[1.1] font-bold text-text tabular-nums">
                {km !== null ? (
                  <>
                    {km}
                    <span className="ml-0.5 font-mono text-[11px] font-normal text-text-secondary">
                      {RIDE_POSTER_TERMS.kmUnit}
                    </span>
                    <span className="sr-only"> — </span>
                  </>
                ) : null}
              </span>
            ) : null}
            <span
              aria-hidden="true"
              className="relative z-10 grid size-8 place-items-center rounded-full text-on-primary shadow-[0_0_0_4px_var(--bg)]"
              style={{ background: `var(${colorVar(item.kind)})` }}
            >
              <Icon className="size-4" strokeWidth={2} />
            </span>
            {index < items.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute top-[34px] bottom-0 border-l-2 border-dashed border-brand opacity-60',
                  withKm ? 'left-[calc(3.5rem+0.75rem+15px)]' : 'left-[15px]',
                )}
              />
            ) : null}
            <span className="min-w-0 pt-1 pb-5.5">
              <span className="block leading-snug font-semibold text-text">
                {item.title}
              </span>
              {item.subtitle ? (
                <span className="block text-sm text-text-secondary">
                  {item.subtitle}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

import { TriangleAlert } from 'lucide-react';
import { cn, formatDistanceMarkParts } from 'ui';
import type { TimelineItem } from '../lib/timeline';

/**
 * CR-151, restyled by CR-155 to the owner's mockup: «Маршрут по точкам» — a km
 * column, hollow rings on a dashed rail, the title and a quiet subtitle. Only a
 * dangerous section stands out (warning ring and an icon before its subtitle);
 * the words carry the meaning, the colour never alone (§12). Still the map's
 * non-visual equivalent.
 */
export function RouteTimeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) return null;
  const withKm = items.some((item) => item.km !== null);

  return (
    <ol className="flex flex-col" data-testid="route-timeline">
      {items.map((item, index) => {
        const danger = item.kind === 'danger';
        const km = item.km !== null ? formatDistanceMarkParts(item.km) : null;
        return (
          <li
            key={item.id}
            className={cn(
              'relative grid gap-x-3',
              withKm
                ? 'grid-cols-[4.5rem_1.25rem_1fr]'
                : 'grid-cols-[1.25rem_1fr]',
            )}
          >
            {withKm ? (
              <span className="pt-0.5 text-right font-mono text-xs text-text-secondary tabular-nums">
                {km ? (
                  <>
                    {km.value} {km.unit}
                    <span className="sr-only"> — </span>
                  </>
                ) : null}
              </span>
            ) : null}
            <span
              aria-hidden="true"
              className={cn(
                'relative z-10 mt-0.5 size-4.5 rounded-full border-2 bg-bg',
                danger ? 'border-warning' : 'border-brand',
              )}
            />
            {index < items.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute top-6 bottom-0.5 border-l border-dashed border-border-input',
                  withKm ? 'left-[calc(4.5rem+0.75rem+8.5px)]' : 'left-[8.5px]',
                )}
              />
            ) : null}
            <span className="min-w-0 pb-6">
              <span className="block leading-snug font-semibold text-text">
                {item.title}
              </span>
              {item.subtitle ? (
                <span
                  className={cn(
                    'mt-0.5 block text-body-sm',
                    danger
                      ? 'font-semibold text-warning'
                      : 'text-text-secondary',
                  )}
                >
                  {danger ? (
                    <TriangleAlert
                      className="mr-1.5 inline size-4 align-[-3px]"
                      aria-hidden="true"
                    />
                  ) : null}
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

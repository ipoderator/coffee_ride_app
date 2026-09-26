'use client';

import { useEffect, useState } from 'react';
import { countdownParts, START_COUNTDOWN_TERMS } from 'ui';

// Minute resolution is all the display shows, so a 30 s tick keeps it at most
// half a minute stale without re-rendering every second.
const TICK_MS = 30_000;

/**
 * CR-130 (ADR-024 mockup «Вы едете»): days/hours/minutes until the ride's
 * start, as three raised cells. A pure client-side timer off `startsAt` — no
 * server state. Renders nothing once the start has passed (the caller also
 * hides it for a started/finished/cancelled ride).
 */
export function StartCountdown({ startsAt }: { startsAt: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const target = new Date(startsAt);
  if (target.getTime() <= now.getTime()) return null;

  const { days, hours, minutes } = countdownParts(target, now);
  const cells = [
    { value: days, unit: START_COUNTDOWN_TERMS.days(days) },
    { value: hours, unit: START_COUNTDOWN_TERMS.hours(hours) },
    { value: minutes, unit: START_COUNTDOWN_TERMS.minutes(minutes) },
  ];

  return (
    <div className="flex flex-col gap-2">
      <p className="font-display text-xs font-semibold tracking-[0.06em] text-text-secondary uppercase">
        {START_COUNTDOWN_TERMS.title}
      </p>
      {/* `role="timer"` is implicitly `aria-live="off"` — a screen reader
          reads it on demand, it doesn't announce every tick. */}
      <div role="timer" className="grid grid-cols-3 gap-2">
        {cells.map((cell) => (
          <div
            key={cell.unit}
            className="flex flex-col items-center rounded-xl border border-border bg-surface px-2 py-3"
          >
            <span className="font-num text-4xl leading-none font-extrabold text-text tabular-nums">
              {cell.value}
            </span>
            <span className="mt-1 font-mono text-xs text-text-muted uppercase">
              {cell.unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

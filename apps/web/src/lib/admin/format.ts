import { formatDate, formatTime } from 'ui';

// CR-231: when something happened, in the admin's own timezone — `9 октября,
// 22:05`. Only ever rendered after a client-side fetch, so the browser zone
// never meets a server render.
export function formatAdminDateTime(iso: string): string {
  const date = new Date(iso);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `${formatDate(date, { timeZone })}, ${formatTime(date, { timeZone })}`;
}

/** CR-232: `10 октября, 14:05:32` — the overview's «Обновлено» time, with
 * seconds so a refresh within the same minute still visibly changes it. */
export function formatAdminDateTimeSeconds(date: Date): string {
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${formatAdminDateTime(date.toISOString())}:${seconds}`;
}

const COUNT_FORMAT = new Intl.NumberFormat('ru-RU');

/** An overview counter — `12 345` with the Russian group separator. */
export function formatAdminCount(value: number): string {
  return COUNT_FORMAT.format(value);
}

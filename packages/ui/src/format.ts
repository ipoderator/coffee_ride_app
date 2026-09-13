// Russian number/unit formatters (CR-064, `docs/design.md` §7). One shared module —
// every metric in both cabinets goes through these instead of re-deriving Russian
// formatting rules per component.
//
// Rules baked in here, not left to call sites:
// - decimal separator is a comma, thousands separator is a non-breaking space (NBSP);
// - a formatted value and its unit are joined by NBSP so they never wrap apart;
// - a missing/unknown numeric input renders as an em dash ("—"), never "0" —
//   `.claude/rules/frontend.md` / `docs/design.md` §6: "no elevation data" and "flat
//   route" are different facts. This is intentionally handled once here rather than in
//   every future consumer (CR-065's `MetricTile`, etc.).

const NBSP = ' ';
const EM_DASH = '—';

/** Empty/unknown numeric input, common to every formatter below. */
type Maybe<T> = T | null | undefined;

function isMissing(value: Maybe<number>): value is null | undefined {
  return value === null || value === undefined || Number.isNaN(value);
}

/** `1234.5` -> `"1234,5"` (comma decimal separator, no grouping). */
function toFixedComma(value: number, decimals: number): string {
  return value.toFixed(decimals).replace('.', ',');
}

/** `1234` -> `"1<NBSP>234"` (NBSP thousands grouping on the integer part only). */
function groupThousands(integerPart: string): string {
  const isNegative = integerPart.startsWith('-');
  const digits = isNegative ? integerPart.slice(1) : integerPart;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return isNegative ? `-${grouped}` : grouped;
}

/** Whole-number formatting with comma-less NBSP grouping, e.g. `1250` -> `"1<NBSP>250"`. */
function formatWholeGrouped(value: number): string {
  return groupThousands(String(Math.round(value)));
}

/** Distance in kilometers: 1 decimal, comma separator — `42,3 км`. */
export function formatDistance(km: Maybe<number>): string {
  if (isMissing(km)) return EM_DASH;
  return `${toFixedComma(km, 1)}${NBSP}км`;
}

/** Elevation gain in meters: whole meters, NBSP-grouped thousands — `1 250 м`. */
export function formatElevation(meters: Maybe<number>): string {
  if (isMissing(meters)) return EM_DASH;
  return `${formatWholeGrouped(meters)}${NBSP}м`;
}

/** Average speed/pace in km/h: 1 decimal, comma separator — `24,5 км/ч`. */
export function formatSpeed(kmh: Maybe<number>): string {
  if (isMissing(kmh)) return EM_DASH;
  return `${toFixedComma(kmh, 1)}${NBSP}км/ч`;
}

/**
 * Duration in whole minutes. Under an hour: minutes only (`45 мин`). An hour or more:
 * hours + minutes (`2 ч 30 мин`), with the minutes part omitted when it's exactly zero
 * (`2 ч`, not `2 ч 0 мин`) — not spelled out by a `docs/design.md` example, but reads as
 * the same "don't show a zero that isn't information" principle behind the missing-value
 * em dash rule above.
 */
export function formatDuration(totalMinutes: Maybe<number>): string {
  if (isMissing(totalMinutes)) return EM_DASH;
  const minutes = Math.round(totalMinutes);
  if (minutes < 60) return `${minutes}${NBSP}мин`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0
    ? `${hours}${NBSP}ч`
    : `${hours}${NBSP}ч${NBSP}${remainder}${NBSP}мин`;
}

// Genitive month names for date formatting ("12 мая", not the nominative "май").
const GENITIVE_MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const;

/**
 * Extracts calendar day/month/year for `date` as seen in `timeZone` (default `UTC`,
 * chosen for determinism in tests and any server-rendered context — real ride-local
 * rendering passes the ride's own IANA zone once one exists, ADR-012).
 */
function partsInZone(
  date: Date,
  timeZone: string,
): { day: number; month: number; year: number; hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? NaN);
  return {
    day: get('day'),
    month: get('month'),
    year: get('year'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

export interface FormatDateOptions {
  /** IANA timezone the calendar day/month/year are read in. Defaults to `UTC`. */
  timeZone?: string;
  /** The "current" instant the year comparison is made against. Defaults to `new Date()`. */
  now?: Date;
}

/**
 * Day + genitive month, year only when it differs from `now`'s year — `12 мая`,
 * `12 мая 2027`.
 */
export function formatDate(
  date: Maybe<Date>,
  options: FormatDateOptions = {},
): string {
  if (date === undefined || date === null) return EM_DASH;
  const timeZone = options.timeZone ?? 'UTC';
  const now = options.now ?? new Date();
  const target = partsInZone(date, timeZone);
  const current = partsInZone(now, timeZone);
  const month = GENITIVE_MONTHS[target.month - 1];
  return target.year === current.year
    ? `${target.day} ${month}`
    : `${target.day} ${month} ${target.year}`;
}

export interface FormatTimeOptions {
  /** IANA timezone the wall-clock time is read in. Defaults to `UTC`. */
  timeZone?: string;
}

/** 24-hour wall-clock time — `07:30`. */
export function formatTime(
  date: Maybe<Date>,
  options: FormatTimeOptions = {},
): string {
  if (date === undefined || date === null) return EM_DASH;
  const timeZone = options.timeZone ?? 'UTC';
  const { hour, minute } = partsInZone(date, timeZone);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Whole rubles, NBSP-grouped thousands — `1 500 ₽`; zero/missing is free — `Бесплатно`. */
export function formatPrice(rubles: Maybe<number>): string {
  if (isMissing(rubles) || rubles === 0) return 'Бесплатно';
  return `${formatWholeGrouped(rubles)}${NBSP}₽`;
}

/** Registered participants vs. capacity — `12 из 20`. */
export function formatParticipants(
  current: Maybe<number>,
  limit: Maybe<number>,
): string {
  if (isMissing(current) || isMissing(limit)) return EM_DASH;
  return `${Math.round(current)}${NBSP}из${NBSP}${Math.round(limit)}`;
}

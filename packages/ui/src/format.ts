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
//
// Each formatter also has a `*Parts` counterpart (CR-065) returning `{ value, unit }`
// instead of one joined string, for a consumer that needs to style the unit
// differently (`MetricTile`). The joined `format*` functions are implemented in terms
// of these, not a parallel copy.

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

/**
 * A formatted metric split into its numeric/text value and unit, instead of one
 * NBSP-joined string. `unit` is `''` when the metric has no separate unit (e.g.
 * `formatParticipantsParts`'s `12 из 20`, or any missing-value result) — a falsy
 * check is enough for a consumer to decide whether to render a unit at all.
 *
 * Exists for CR-065's `MetricTile`, which renders the value and unit as two visually
 * distinct inline elements (`docs/design.md` §6 — the unit is never the same size or
 * weight as the number). The plain joined `format*` functions below stay the public
 * contract for every other context (plain text, `aria-label`s, logs) and are now
 * implemented in terms of these — one rule, not two copies of it.
 */
export interface MetricParts {
  value: string;
  unit: string;
}

const MISSING_PARTS: MetricParts = { value: EM_DASH, unit: '' };

function joinParts({ value, unit }: MetricParts): string {
  return unit === '' ? value : `${value}${NBSP}${unit}`;
}

/** Distance in kilometers, split: 1 decimal, comma separator — `{ value: "42,3", unit: "км" }`. */
export function formatDistanceParts(km: Maybe<number>): MetricParts {
  if (isMissing(km)) return MISSING_PARTS;
  return { value: toFixedComma(km, 1), unit: 'км' };
}

/** Distance in kilometers: 1 decimal, comma separator — `42,3 км`. */
export function formatDistance(km: Maybe<number>): string {
  return joinParts(formatDistanceParts(km));
}

/** Elevation gain in meters, split: whole meters, NBSP-grouped thousands. */
export function formatElevationParts(meters: Maybe<number>): MetricParts {
  if (isMissing(meters)) return MISSING_PARTS;
  return { value: formatWholeGrouped(meters), unit: 'м' };
}

/** Elevation gain in meters: whole meters, NBSP-grouped thousands — `1 250 м`. */
export function formatElevation(meters: Maybe<number>): string {
  return joinParts(formatElevationParts(meters));
}

/** Average speed/pace in km/h, split: 1 decimal, comma separator. */
export function formatSpeedParts(kmh: Maybe<number>): MetricParts {
  if (isMissing(kmh)) return MISSING_PARTS;
  return { value: toFixedComma(kmh, 1), unit: 'км/ч' };
}

/** Average speed/pace in km/h: 1 decimal, comma separator — `24,5 км/ч`. */
export function formatSpeed(kmh: Maybe<number>): string {
  return joinParts(formatSpeedParts(kmh));
}

/**
 * Duration in whole minutes, split. Under an hour: minutes only (`{ value: "45",
 * unit: "мин" }`). An hour or more: hours + minutes as the value, with the minutes
 * part omitted from the value (and the unit becoming `"ч"` instead of `"мин"`) when
 * it's exactly zero (`{ value: "2", unit: "ч" }`, not `"2 ч 0 мин"`) — not spelled
 * out by a `docs/design.md` example, but reads as the same "don't show a zero that
 * isn't information" principle behind the missing-value em dash rule above.
 */
export function formatDurationParts(totalMinutes: Maybe<number>): MetricParts {
  if (isMissing(totalMinutes)) return MISSING_PARTS;
  const minutes = Math.round(totalMinutes);
  if (minutes < 60) return { value: String(minutes), unit: 'мин' };
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0
    ? { value: String(hours), unit: 'ч' }
    : { value: `${hours}${NBSP}ч${NBSP}${remainder}`, unit: 'мин' };
}

/** Duration in whole minutes: `< 1h` -> minutes (`45 мин`); `>= 1h` -> `2 ч 30 мин`. */
export function formatDuration(totalMinutes: Maybe<number>): string {
  return joinParts(formatDurationParts(totalMinutes));
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

/**
 * Whole rubles, split: NBSP-grouped thousands, `unit: '₽'`. Zero/missing is free —
 * `{ value: 'Бесплатно', unit: '' }`, not `{ value: '0', unit: '₽' }`.
 */
export function formatPriceParts(rubles: Maybe<number>): MetricParts {
  if (isMissing(rubles) || rubles === 0)
    return { value: 'Бесплатно', unit: '' };
  return { value: formatWholeGrouped(rubles), unit: '₽' };
}

/** Whole rubles, NBSP-grouped thousands — `1 500 ₽`; zero/missing is free — `Бесплатно`. */
export function formatPrice(rubles: Maybe<number>): string {
  return joinParts(formatPriceParts(rubles));
}

/**
 * Registered participants vs. capacity, split. `unit` is always `''` — `12 из 20` is a
 * ratio, not a number-plus-unit, so the whole phrase is the `value`.
 */
export function formatParticipantsParts(
  current: Maybe<number>,
  limit: Maybe<number>,
): MetricParts {
  if (isMissing(current) || isMissing(limit)) return MISSING_PARTS;
  return {
    value: `${Math.round(current)}${NBSP}из${NBSP}${Math.round(limit)}`,
    unit: '',
  };
}

/** Registered participants vs. capacity — `12 из 20`. */
export function formatParticipants(
  current: Maybe<number>,
  limit: Maybe<number>,
): string {
  return joinParts(formatParticipantsParts(current, limit));
}

/**
 * CR-043 ("Organizer rating summary"), split: 1 decimal, comma separator, same tier
 * as distance/speed. `reviewCount: 0` (no reviews yet) is the missing-value case —
 * `null`/no data and "reviewed, averaged to exactly 0" are different facts, same
 * `docs/design.md` §6 principle every other formatter here follows (there is no real
 * 0 case anyway — `rating` is 1-5).
 */
export function formatRatingParts(
  rating: Maybe<number>,
  reviewCount: Maybe<number>,
): MetricParts {
  if (isMissing(rating) || isMissing(reviewCount) || reviewCount === 0)
    return MISSING_PARTS;
  return { value: toFixedComma(rating, 1), unit: '★' };
}

/** Organizer rating: 1 decimal, comma separator — `4,8 ★`; no reviews yet is `—`. */
export function formatRating(
  rating: Maybe<number>,
  reviewCount: Maybe<number>,
): string {
  return joinParts(formatRatingParts(rating, reviewCount));
}

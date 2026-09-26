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

// ---------------------------------------------------------------------------
// CR-119 (ride detail «Топокарта»: date line, pace groups). Additive only.
// ---------------------------------------------------------------------------

// Short Russian weekday names, Sunday-first to match `Date#getUTCDay`-style
// indexing of the `weekday` part read below.
const SHORT_WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'] as const;
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

// Russia's zones (no DST since 2014), named relative to Moscow the way Russian
// timetables do — «МСК», «МСК+4». Any other zone falls back to «UTC+2».
const RUSSIAN_TIME_ZONES = new Set([
  'Europe/Kaliningrad',
  'Europe/Moscow',
  'Europe/Simferopol',
  'Europe/Volgograd',
  'Europe/Kirov',
  'Europe/Samara',
  'Europe/Saratov',
  'Europe/Ulyanovsk',
  'Europe/Astrakhan',
  'Asia/Yekaterinburg',
  'Asia/Omsk',
  'Asia/Novosibirsk',
  'Asia/Barnaul',
  'Asia/Tomsk',
  'Asia/Novokuznetsk',
  'Asia/Krasnoyarsk',
  'Asia/Irkutsk',
  'Asia/Chita',
  'Asia/Yakutsk',
  'Asia/Khandyga',
  'Asia/Vladivostok',
  'Asia/Ust-Nera',
  'Asia/Magadan',
  'Asia/Sakhalin',
  'Asia/Srednekolymsk',
  'Asia/Kamchatka',
  'Asia/Anadyr',
]);
const MOSCOW_OFFSET_MINUTES = 180;

/** UTC offset of `timeZone` at `date`, in minutes (e.g. `180` for Moscow). */
function offsetMinutes(date: Date, timeZone: string): number {
  const name =
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(date)
      .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

function signedHours(minutes: number): string {
  if (minutes === 0) return '';
  const sign = minutes > 0 ? '+' : '−';
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  return rest === 0
    ? `${sign}${hours}`
    : `${sign}${hours}:${String(rest).padStart(2, '0')}`;
}

/**
 * Short zone hint for a ride's local start time (`docs/design.md` §7: a start
 * time is always shown with its zone) — `МСК`, `МСК+4` for Russian zones,
 * `UTC+2`/`UTC` otherwise.
 */
export function formatTimeZoneHint(date: Date, timeZone: string): string {
  const offset = offsetMinutes(date, timeZone);
  if (RUSSIAN_TIME_ZONES.has(timeZone)) {
    return `МСК${signedHours(offset - MOSCOW_OFFSET_MINUTES)}`;
  }
  return `UTC${signedHours(offset)}`;
}

/**
 * A ride's start as one line — `сб 14 июня · 07:30 · МСК` (year added when it
 * isn't the current one, same rule as {@link formatDate}). Lower-case on
 * purpose: callers set it in `font-display uppercase` via CSS, so a screen
 * reader still reads words, not letter-by-letter abbreviations.
 */
export function formatRideStartLine(
  date: Maybe<Date>,
  options: FormatDateOptions = {},
): string {
  if (date === undefined || date === null) return EM_DASH;
  const timeZone = options.timeZone ?? 'UTC';
  return [
    `${formatShortWeekday(date, { timeZone })} ${formatDate(date, options)}`,
    formatTime(date, { timeZone }),
    formatTimeZoneHint(date, timeZone),
  ].join(' · ');
}

/** Whole km/h without a trailing `,0` (`25`), one decimal otherwise (`27,5`). */
function compactSpeed(kmh: number): string {
  const rounded = Math.round(kmh * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : toFixedComma(rounded, 1);
}

/**
 * A pace group's speed, split — `{ value: "25", unit: "км/ч" }`. Group paces are
 * set by the organizer as round targets, so a whole value drops the `,0` the
 * measured-average {@link formatSpeedParts} keeps.
 */
export function formatGroupPaceParts(kmh: Maybe<number>): MetricParts {
  if (isMissing(kmh)) return MISSING_PARTS;
  return { value: compactSpeed(kmh), unit: 'км/ч' };
}

/**
 * Where the ride starts, for «Старт: …» lines. Organizers often label the `start`
 * route point just «Старт» and put the actual place in its description, which
 * rendered as «Старт: Старт». A label that only repeats the point type falls back
 * to the description (trailing period dropped); `null` when neither says where.
 */
export function formatStartPlace(
  label: Maybe<string>,
  description?: Maybe<string>,
): string | null {
  const trimmedLabel = label?.trim() ?? '';
  if (trimmedLabel && trimmedLabel.toLowerCase() !== 'старт') {
    return trimmedLabel;
  }
  const place = description?.trim().replace(/\.$/, '') ?? '';
  return place || null;
}

/** A pace group's speed — `25 км/ч`. */
export function formatGroupPace(kmh: Maybe<number>): string {
  return joinParts(formatGroupPaceParts(kmh));
}

/**
 * The span of a ride's group paces, split — `{ value: "25–35", unit: "км/ч" }`;
 * one distinct pace collapses to `25`; an empty list is the missing-value dash.
 */
export function formatPaceRangeParts(paces: readonly number[]): MetricParts {
  const valid = paces.filter((pace) => !isMissing(pace));
  if (valid.length === 0) return MISSING_PARTS;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const value =
    compactSpeed(min) === compactSpeed(max)
      ? compactSpeed(min)
      : `${compactSpeed(min)}–${compactSpeed(max)}`;
  return { value, unit: 'км/ч' };
}

// ---------------------------------------------------------------------------
// CR-130 («Ночной старт», ADR-024): organizer activity feed/chart and the
// registered viewer's start countdown. Additive only.
// ---------------------------------------------------------------------------

/** Short lower-case Russian weekday of `date` as seen in `timeZone` — `пн`. */
export function formatShortWeekday(
  date: Date,
  options: FormatTimeOptions = {},
): string {
  const weekdayName = new Intl.DateTimeFormat('en-US', {
    timeZone: options.timeZone ?? 'UTC',
    weekday: 'short',
  }).format(date);
  return SHORT_WEEKDAYS[WEEKDAY_INDEX[weekdayName] ?? 0] ?? SHORT_WEEKDAYS[0];
}

/**
 * Compact time elapsed since `date`, for an activity feed — `сейчас`,
 * `8 мин`, `2 ч`, `3 дн`. Abbreviated units need no plural agreement, which
 * is why a feed uses them instead of «8 минут назад». A future `date` (clock
 * skew) reads as `сейчас`, never a negative number.
 */
export function formatElapsedShort(date: Date, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return 'сейчас';
  if (minutes < 60) return `${minutes}${NBSP}мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${NBSP}ч`;
  return `${Math.floor(hours / 24)}${NBSP}дн`;
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
}

/**
 * Whole days/hours/minutes from `now` until `target`, rounded down; all
 * zero once `target` has passed. The label for each part comes from
 * `START_COUNTDOWN_TERMS` (plural agreement lives with the terminology).
 */
export function countdownParts(
  target: Date,
  now: Date = new Date(),
): CountdownParts {
  const totalMinutes = Math.max(
    0,
    Math.floor((target.getTime() - now.getTime()) / 60_000),
  );
  return {
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60,
  };
}

/**
 * CR-131: a compact start line for a dense KPI cell — `вс 04.10 · 09:00` (no
 * zone hint: the cell sits next to the ride it describes; the full line with
 * the zone is {@link formatRideStartLine}).
 */
export function formatShortStart(
  date: Date,
  options: FormatTimeOptions = {},
): string {
  const timeZone = options.timeZone ?? 'UTC';
  const { day, month } = partsInZone(date, timeZone);
  const dayMonth = `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}`;
  return `${formatShortWeekday(date, { timeZone })} ${dayMonth} · ${formatTime(date, { timeZone })}`;
}

// ---------------------------------------------------------------------------
// CR-132 (organizer cabinet frame per the «Ночной старт» mockup). Additive.
// ---------------------------------------------------------------------------

/**
 * A person's name as a dense feed shows it — `Анна К.` (first word plus the
 * last word's initial). A one-word name is returned as is; blank → `null`.
 */
export function formatShortPersonName(
  name: string | null | undefined,
): string | null {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return null;
  const first = parts[0]!;
  if (parts.length === 1) return first;
  const last = parts[parts.length - 1]!;
  return `${first} ${last[0]!.toUpperCase()}.`;
}

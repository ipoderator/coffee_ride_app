'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { formatCalendarDate } from '../format';
import { cn } from '../lib/cn';
import { DATE_PICKER_TERMS } from '../terminology';

// CR-157: a calendar date picker in place of the native `<input type="date">`,
// whose popup is small, locale-dependent and different in every browser. Works
// on plain calendar dates (`"2026-10-01"`, the same string the native input
// produced), so callers keep their existing date + time → instant conversion.
//
// Desktop (`sm`+): a popover under the field with 48px day cells. Phone: a
// bottom sheet over a scrim, full width, so day cells stay near 44px even at
// 320px. Keyboard: arrows move by day/week, PageUp/PageDown by month,
// Home/End to the week's start/end, Enter/Space picks, Escape closes.

type Ymd = string;

// Inline icons, not `lucide-react` — that's `apps/web`'s dependency, not this
// package's (same call as `NavMenu`'s chevron, CR-106).
function Icon({ path, className }: { path: string; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={path} />
    </svg>
  );
}

const CALENDAR_PATH =
  'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z';
const CHEVRON_LEFT_PATH = 'm15 18-6-6 6-6';
const CHEVRON_RIGHT_PATH = 'm9 18 6-6-6-6';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toYmd(date: Date): Ymd {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function parseYmd(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return date.getUTCMonth() === Number(match[2]) - 1 ? date : null;
}

function addDays(value: Ymd, days: number): Ymd {
  const date = parseYmd(value)!;
  date.setUTCDate(date.getUTCDate() + days);
  return toYmd(date);
}

/** Same day `months` later, clamped to that month's last day (31 Jan → 28 Feb). */
function addMonths(value: Ymd, months: number): Ymd {
  const date = parseYmd(value)!;
  const day = date.getUTCDate();
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return toYmd(target);
}

/** 0 = Monday … 6 = Sunday. */
function mondayIndex(value: Ymd): number {
  return (parseYmd(value)!.getUTCDay() + 6) % 7;
}

function monthKey(value: Ymd): string {
  return value.slice(0, 7);
}

/** The browser's own current calendar day (not UTC's). */
function localToday(): Ymd {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 42 days (6 weeks, Monday-first) covering `anyDayInMonth`'s month. */
function monthGrid(anyDayInMonth: Ymd): Ymd[] {
  const first = `${monthKey(anyDayInMonth)}-01`;
  const start = addDays(first, -mondayIndex(first));
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

export interface DatePickerProps {
  /** `"YYYY-MM-DD"` or `""` for no date. */
  value: string;
  onChange: (value: string) => void;
  /** Earliest selectable day, `"YYYY-MM-DD"`. Earlier days render disabled. */
  min?: string;
  /** Overrides "today" (tests); defaults to the browser's local date. */
  today?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  // Wired in by `FormField` (label association, hint/error, invalid state).
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

export function DatePicker({
  value,
  onChange,
  min,
  today: todayProp,
  placeholder = DATE_PICKER_TERMS.placeholder,
  disabled = false,
  className,
  id,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: DatePickerProps) {
  const today = todayProp ?? localToday();
  const selected = parseYmd(value) ? value : null;
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState<Ymd>(selected ?? today);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Set when opening or on a grid key move — month buttons and chips keep
  // their own focus instead of it jumping into the grid.
  const moveFocusRef = useRef(false);

  const isDisabledDay = (day: Ymd) => min !== undefined && day < min;

  function openPicker() {
    const start = selected ?? (min && today < min ? min : today);
    setFocused(start);
    moveFocusRef.current = true;
    setOpen(true);
  }

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function pick(day: Ymd) {
    if (isDisabledDay(day)) return;
    onChange(day);
    close();
  }

  // Keep keyboard focus on the focused day while the picker is open.
  useEffect(() => {
    if (!open || !moveFocusRef.current) return;
    moveFocusRef.current = false;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)
      ?.focus();
  }, [open, focused]);

  // A popover opened low on the page scrolls itself fully into view.
  useEffect(() => {
    if (open) dialogRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [open]);

  // Outside click closes (the phone sheet's scrim is handled by its own click).
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  function handleGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, () => Ymd> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      PageUp: () => addMonths(focused, -1),
      PageDown: () => addMonths(focused, 1),
      Home: () => addDays(focused, -mondayIndex(focused)),
      End: () => addDays(focused, 6 - mondayIndex(focused)),
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      moveFocusRef.current = true;
      const next = move();
      // Disabled days can't take focus — stop at `min` instead of losing it.
      setFocused(min !== undefined && next < min ? min : next);
    }
  }

  const days = monthGrid(focused);
  const [viewYear, viewMonth] = focused.split('-').map(Number) as [
    number,
    number,
  ];
  const monthTitle = `${DATE_PICKER_TERMS.months[viewMonth - 1]} ${viewYear}`;
  const prevMonthDisabled =
    min !== undefined && monthKey(addMonths(focused, -1)) < monthKey(min);

  // Quick picks: today, tomorrow and the coming weekend — most group rides
  // start on a Saturday or Sunday morning.
  const saturday = addDays(today, (5 - mondayIndex(today) + 7) % 7);
  const quickPicks = [
    { label: DATE_PICKER_TERMS.today, day: today },
    { label: DATE_PICKER_TERMS.tomorrow, day: addDays(today, 1) },
    {
      label: formatCalendarDate(saturday, { withYear: false }),
      day: saturday,
    },
    {
      label: formatCalendarDate(addDays(saturday, 1), { withYear: false }),
      day: addDays(saturday, 1),
    },
  ].filter(
    (pickItem, index, all) =>
      all.findIndex((other) => other.day === pickItem.day) === index,
  );

  const navButtonClass =
    'inline-flex size-11 items-center justify-center rounded-full text-text hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        onClick={() => (open ? close(false) : openPicker())}
        className={cn(
          'flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-border-input bg-bg px-3 text-left text-body',
          selected ? 'text-text' : 'text-text-muted',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          'aria-invalid:border-danger disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        <span className="truncate">
          {selected ? formatCalendarDate(selected) : placeholder}
        </span>
        <Icon
          path={CALENDAR_PATH}
          className="size-5 shrink-0 text-text-secondary"
        />
      </button>

      {open && (
        <>
          <div
            aria-hidden="true"
            onClick={() => close()}
            className="fixed inset-0 z-40 bg-scrim sm:hidden"
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="false"
            aria-label={DATE_PICKER_TERMS.dialogLabel}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                close();
              }
            }}
            className={cn(
              'z-50 flex flex-col gap-3 border border-border bg-bg-raised p-4 shadow-overlay',
              // Phone: bottom sheet; `sm`+: popover under the field.
              'fixed inset-x-0 bottom-0 rounded-t-3xl pb-[calc(1rem+env(safe-area-inset-bottom))]',
              'sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-2 sm:w-[24rem] sm:rounded-2xl sm:pb-4',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                aria-label={DATE_PICKER_TERMS.prevMonth}
                disabled={prevMonthDisabled}
                onClick={() => setFocused(addMonths(focused, -1))}
                className={navButtonClass}
              >
                <Icon path={CHEVRON_LEFT_PATH} className="size-5" />
              </button>
              <p id={titleId} aria-live="polite" className="text-h3 text-text">
                {monthTitle}
              </p>
              <button
                type="button"
                aria-label={DATE_PICKER_TERMS.nextMonth}
                onClick={() => setFocused(addMonths(focused, 1))}
                className={navButtonClass}
              >
                <Icon path={CHEVRON_RIGHT_PATH} className="size-5" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {quickPicks.map((quick) => (
                <button
                  key={quick.day}
                  type="button"
                  aria-pressed={quick.day === selected}
                  disabled={isDisabledDay(quick.day)}
                  onClick={() => pick(quick.day)}
                  className={cn(
                    'inline-flex min-h-11 items-center rounded-full border-[1.5px] px-3 text-body-sm font-medium',
                    quick.day === selected
                      ? 'border-primary bg-primary-tint text-text'
                      : 'border-border-input text-text hover:bg-surface',
                    'disabled:cursor-not-allowed disabled:opacity-40',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                  )}
                >
                  {quick.label}
                </button>
              ))}
            </div>

            <div
              ref={gridRef}
              role="grid"
              aria-labelledby={titleId}
              onKeyDown={handleGridKeyDown}
              className="flex flex-col gap-1"
            >
              <div role="row" className="grid grid-cols-7">
                {DATE_PICKER_TERMS.weekdaysShort.map((short, index) => (
                  <span
                    key={short}
                    role="columnheader"
                    aria-label={DATE_PICKER_TERMS.weekdaysLong[index]}
                    className={cn(
                      'py-1 text-center text-body-sm font-medium',
                      index >= 5 ? 'text-text' : 'text-text-muted',
                    )}
                  >
                    {short}
                  </span>
                ))}
              </div>
              {Array.from({ length: 6 }, (_, week) => (
                <div key={week} role="row" className="grid grid-cols-7 gap-1">
                  {days.slice(week * 7, week * 7 + 7).map((day) => {
                    const inMonth = monthKey(day) === monthKey(focused);
                    const isSelected = day === selected;
                    const isToday = day === today;
                    const dayDisabled = isDisabledDay(day);
                    return (
                      <span
                        key={day}
                        role="gridcell"
                        aria-selected={isSelected}
                      >
                        <button
                          type="button"
                          data-date={day}
                          tabIndex={day === focused ? 0 : -1}
                          disabled={dayDisabled}
                          aria-label={formatCalendarDate(day)}
                          aria-current={isToday ? 'date' : undefined}
                          onClick={() => pick(day)}
                          onFocus={() => setFocused(day)}
                          className={cn(
                            'flex h-12 w-full items-center justify-center rounded-xl text-body font-medium tabular-nums',
                            isSelected
                              ? 'bg-primary-fill font-semibold text-on-primary-fill'
                              : inMonth
                                ? 'text-text hover:bg-surface'
                                : 'text-text-muted hover:bg-surface',
                            isToday &&
                              !isSelected &&
                              'ring-[1.5px] ring-inset ring-primary font-semibold',
                            'disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent',
                            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                          )}
                        >
                          {Number(day.slice(8))}
                        </button>
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => close()}
              className="inline-flex min-h-11 items-center justify-center rounded-full text-body-sm font-medium text-text-secondary hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:hidden"
            >
              {DATE_PICKER_TERMS.close}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

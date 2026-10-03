'use client';

import { ArrowRight } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { Ride, RideReschedule } from 'types';
import {
  Button,
  Card,
  ConfirmDialog,
  DatePicker,
  formatRideStartLine,
  formatTimeZoneHint,
  FormField,
  Input,
  RIDE_RESCHEDULE_TERMS,
  Textarea,
} from 'ui';
import {
  utcIsoToZonedLocalInput,
  zonedTimeToUtcIso,
} from '@/lib/datetime/zoned-time';
import { ApiError, rescheduleRide, rescheduleRideRequestSchema } from '../api';

const T = RIDE_RESCHEDULE_TERMS;
const REASON_MAX_LENGTH = 500;
const CONTROL_CLASS = 'min-h-12 rounded-xl bg-bg';

/** CR-190: published and not started — the statuses the API accepts. */
const RESCHEDULABLE: ReadonlySet<Ride['status']> = new Set([
  'published',
  'registration_open',
  'registration_closed',
]);

export function isReschedulable(status: Ride['status']): boolean {
  return RESCHEDULABLE.has(status);
}

type FieldErrors = Partial<Record<'date' | 'time' | 'reason', string>>;

interface Pending {
  startsAt: string;
  reason: string;
}

export interface RescheduleRideCardProps {
  ride: Pick<Ride, 'id' | 'status' | 'startsAt' | 'startTimezone'>;
  registrationsCount: number;
  waitlistCount: number;
  lastReschedule: RideReschedule | null;
  /** After a successful move — the workspace shows the ride and re-reads it. */
  onRescheduled: (ride: Ride) => void | Promise<void>;
  /** Tests/stories: a fixed clock. */
  now?: () => Date;
}

/**
 * CR-190 (ADR-029 draft): «Перенести заезд» on a published ride's overview.
 * A form (new date and time in the ride's own zone, a required reason, what
 * changes and who is told), then a `ConfirmDialog` with the same summary —
 * never `window.confirm`. Only offered before the start; the server enforces
 * every rule again (owner, status, a future and different start).
 */
export function RescheduleRideCard({
  ride,
  registrationsCount,
  waitlistCount,
  lastReschedule,
  onRescheduled,
  now = () => new Date(),
}: RescheduleRideCardProps) {
  const formId = useId();
  const headingId = useId();
  const openButtonId = `${formId}-open`;
  const formHeadingRef = useRef<HTMLHeadingElement>(null);
  // Where focus goes on the next open/close: the form's heading when it
  // opens, back to «Перенести заезд» when it closes (WCAG 2.4.3).
  const focusTarget = useRef<'form' | 'opener' | null>(null);
  const timeZone = ride.startTimezone;

  const [isOpen, setIsOpen] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (focusTarget.current === 'form') formHeadingRef.current?.focus();
    if (focusTarget.current === 'opener') {
      document.getElementById(openButtonId)?.focus();
    }
    focusTarget.current = null;
  }, [isOpen, openButtonId]);

  if (!isReschedulable(ride.status)) return null;

  const currentStart = new Date(ride.startsAt);
  const currentLine = formatRideStartLine(currentStart, { timeZone });
  const today = utcIsoToZonedLocalInput(now().toISOString(), timeZone).slice(
    0,
    10,
  );
  const zoneHint = formatTimeZoneHint(currentStart, timeZone);
  const toCandidate = (d: string, t: string) =>
    d && t ? zonedTimeToUtcIso(`${d}T${t}`, timeZone) : null;
  const candidate = toCandidate(date, time);
  const candidateLine = candidate
    ? formatRideStartLine(new Date(candidate), { timeZone })
    : null;

  function openForm() {
    // Prefill with the current start: moving it by an hour is one change.
    const local = utcIsoToZonedLocalInput(ride.startsAt, timeZone);
    setDate(local.slice(0, 10));
    setTime(local.slice(11, 16));
    setReason('');
    setErrors({});
    setFormError(null);
    setSuccess(null);
    focusTarget.current = 'form';
    setIsOpen(true);
  }

  function closeForm() {
    focusTarget.current = 'opener';
    setIsOpen(false);
    setErrors({});
    setFormError(null);
  }

  function clearError(field: keyof FieldErrors) {
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  /** The time errors that depend on the date+time pair, not on time alone. */
  function pairError(start: string | null): string | undefined {
    if (!start) return undefined;
    const instant = new Date(start).getTime();
    if (instant <= now().getTime()) return T.inPast;
    if (instant === currentStart.getTime()) return T.unchanged;
    return undefined;
  }

  // QA `fe0b4c2` (CR-198): «Это текущее время старта…» (or «…уже прошло»)
  // sits under the time but is about the pair — a new date with the same
  // time must re-judge it at once, not on the next «Продолжить». An error
  // about the time field alone («Укажите новое время…») stays.
  function changeDate(value: string) {
    setDate(value);
    setErrors((current) => {
      const next = { ...current };
      delete next.date;
      if (next.time === T.inPast || next.time === T.unchanged) {
        const recomputed = pairError(toCandidate(value, time));
        if (recomputed) next.time = recomputed;
        else delete next.time;
      }
      return next;
    });
  }

  function validate(): Pending | null {
    const next: FieldErrors = {};
    if (!date) next.date = T.dateRequired;
    if (!time) next.time = T.timeRequired;
    const trimmed = reason.trim();
    if (!trimmed) next.reason = T.reasonRequired;
    else if (trimmed.length > REASON_MAX_LENGTH) next.reason = T.reasonTooLong;
    if (!next.date && !next.time) {
      const pair = pairError(candidate);
      if (pair) next.time = pair;
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || !candidate) return null;
    const parsed = rescheduleRideRequestSchema.safeParse({
      startsAt: candidate,
      reason: trimmed,
    });
    return parsed.success ? parsed.data : null;
  }

  function handleContinue(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    setFormError(null);
    const valid = validate();
    if (valid) setPending(valid);
  }

  async function handleConfirm() {
    // Duplicate-submit protection: a second click or Enter while in flight.
    if (!pending || isSubmitting) return;
    setIsSubmitting(true);
    setFormError(null);
    let moved: Ride;
    try {
      const response = await rescheduleRide(ride.id, pending);
      moved = response.ride;
    } catch (error) {
      setPending(null);
      const code = error instanceof ApiError ? error.problem.code : null;
      if (code === 'reschedule_start_in_past') {
        setErrors({ time: T.inPast });
      } else if (code === 'reschedule_start_unchanged') {
        setErrors({ time: T.unchanged });
      } else if (
        code === 'ride_not_reschedulable' ||
        code === 'ride_is_draft'
      ) {
        setFormError(T.notReschedulable);
      } else {
        setFormError(T.error);
      }
      setIsSubmitting(false);
      return;
    }
    // The move has committed: a failed re-read afterwards is the workspace's
    // own error state, never «Не удалось перенести».
    setPending(null);
    focusTarget.current = 'opener';
    setIsOpen(false);
    setIsSubmitting(false);
    setSuccess(
      T.success(formatRideStartLine(new Date(moved.startsAt), { timeZone })),
    );
    await onRescheduled(moved);
  }

  const summary = (newLine: string | null) => (
    <dl
      className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 text-body-sm"
      data-testid="reschedule-summary"
    >
      <dt className="text-text-secondary">{T.summaryWas}</dt>
      <dd className="font-mono text-text-secondary tabular-nums line-through decoration-1">
        {currentLine}
      </dd>
      <dt className="flex items-center gap-1 text-text-secondary">
        <ArrowRight className="size-3.5" aria-hidden="true" />
        {T.summaryWillBe}
      </dt>
      <dd className="font-mono font-semibold text-text tabular-nums">
        {newLine ?? T.summaryPending}
      </dd>
    </dl>
  );

  return (
    <Card
      className="flex flex-col gap-4"
      data-testid="reschedule-card"
      aria-labelledby={headingId}
    >
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-h3 text-text">
          {T.cardTitle}
        </h2>
        <p className="max-w-2xl text-body-sm text-text-secondary">
          {T.cardDescription}
        </p>
      </div>

      <dl className="flex flex-col divide-y divide-border text-body-sm">
        <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-2.5 first:pt-0">
          <dt className="text-text-secondary">{T.currentLabel}</dt>
          <dd className="font-mono text-text tabular-nums">{currentLine}</dd>
        </div>
        {lastReschedule && (
          <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-2.5">
            <dt className="text-text-secondary">{T.previousLabel}</dt>
            <dd className="flex flex-col gap-0.5">
              <span className="font-mono text-text-secondary tabular-nums">
                {formatRideStartLine(
                  new Date(lastReschedule.previousStartsAt),
                  {
                    timeZone,
                  },
                )}
              </span>
              <span className="text-text-secondary wrap-anywhere">
                {T.reasonLine(lastReschedule.reason)}
              </span>
            </dd>
          </div>
        )}
      </dl>

      {success && (
        <p role="status" className="text-body-sm text-success">
          {success}
        </p>
      )}

      {!isOpen ? (
        <Button
          id={openButtonId}
          type="button"
          variant="secondary"
          className="self-start"
          onClick={openForm}
        >
          {T.open}
        </Button>
      ) : (
        <form
          id={formId}
          noValidate
          onSubmit={handleContinue}
          aria-label={T.formTitle}
          className="flex flex-col gap-5 border-t border-border pt-5"
        >
          <h3
            ref={formHeadingRef}
            tabIndex={-1}
            className="text-body font-semibold text-text focus:outline-none"
          >
            {T.formTitle}
          </h3>
          <div className="grid gap-5 md:grid-cols-2">
            <FormField
              id={`${formId}-date`}
              label={T.newDateLabel}
              error={errors.date}
            >
              <DatePicker
                value={date}
                onChange={changeDate}
                min={today}
                today={today}
                disabled={isSubmitting}
              />
            </FormField>
            <FormField
              id={`${formId}-time`}
              label={T.newTimeLabel}
              hint={T.timeZoneNote(zoneHint)}
              error={errors.time}
            >
              <Input
                type="time"
                value={time}
                onChange={(event) => {
                  setTime(event.target.value);
                  clearError('time');
                }}
                disabled={isSubmitting}
                className={CONTROL_CLASS}
              />
            </FormField>
          </div>

          <FormField
            id={`${formId}-reason`}
            label={T.reasonLabel}
            hint={T.reasonHint}
            error={errors.reason}
          >
            <Textarea
              value={reason}
              rows={3}
              placeholder={T.reasonPlaceholder}
              onChange={(event) => {
                setReason(event.target.value);
                clearError('reason');
              }}
              disabled={isSubmitting}
            />
          </FormField>

          <section
            aria-label={T.summaryTitle}
            className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
          >
            <div>
              <p className="text-body-sm font-semibold text-text">
                {T.summaryTitle}
              </p>
              {summary(candidateLine)}
            </div>
            <div className="flex flex-col gap-1 border-t border-border pt-3">
              <p className="text-body-sm font-semibold text-text">
                {T.recipientsTitle}
              </p>
              <p
                className="text-body-sm text-text tabular-nums"
                data-testid="reschedule-recipients"
              >
                {T.recipients(registrationsCount, waitlistCount)}
              </p>
              <p className="text-body-sm text-text-secondary">
                {T.keepsRegistrations}
              </p>
            </div>
          </section>

          {formError && (
            <p role="alert" className="text-body-sm text-danger">
              {formError}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {T.continue}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isSubmitting}
              onClick={closeForm}
            >
              {T.close}
            </Button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={pending !== null}
        onClose={() => {
          if (!isSubmitting) setPending(null);
        }}
        onConfirm={() => void handleConfirm()}
        title={T.confirmTitle}
        description={T.confirmDescription}
        confirmLabel={T.confirmAction}
        cancelLabel={T.confirmBack}
        isConfirming={isSubmitting}
        confirmVariant="primary"
      >
        {summary(
          pending
            ? formatRideStartLine(new Date(pending.startsAt), { timeZone })
            : null,
        )}
        <p className="mt-3 text-body-sm text-text-secondary">
          {T.recipients(registrationsCount, waitlistCount)}
        </p>
      </ConfirmDialog>
    </Card>
  );
}

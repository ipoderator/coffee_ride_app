'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import type { Ride } from 'types';
import {
  BICYCLE_TYPE_TERMS,
  Button,
  Card,
  FormField,
  Input,
  MetricRow,
  MetricTile,
  RIDE_CREATE_TERMS,
  RIDE_STATUS_TERMS,
  RUSSIAN_TIMEZONE_OPTIONS,
  StatusBadge,
  formatDate,
  formatTime,
} from 'ui';
import type { BicycleType } from 'types';
import { zonedTimeToUtcIso } from '@/lib/datetime/zoned-time';
import { ApiError, createRide, createRideRequestSchema } from '../api';

const BICYCLE_TYPE_OPTIONS: readonly BicycleType[] = [
  'road',
  'gravel',
  'mtb',
  'any',
];

const DEFAULT_TIMEZONE = 'Europe/Moscow';

interface FieldErrors {
  title?: string;
  bicycleType?: string;
  startsAt?: string;
  startTimezone?: string;
}

function selectClassName(hasError: boolean): string {
  return [
    'min-h-11 w-full rounded-lg border bg-bg-raised px-3 text-base text-text',
    hasError ? 'border-danger' : 'border-border-input',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    'disabled:cursor-not-allowed disabled:opacity-60',
  ].join(' ');
}

/**
 * `/organizer/rides/new` (`docs/design.md` §8, CR-017). Only the fields a valid draft
 * needs at creation — see `.claude/context/current-task.md`. Self-contained success
 * view (no link to an edit/detail screen — neither exists yet, CR-018/CR-023) rather
 * than the create-or-edit-in-one-screen pattern `OrganizerProfileForm` uses, since a
 * ride draft has nothing to load back (this screen only ever creates).
 */
export function CreateRideForm() {
  const [title, setTitle] = useState('');
  const [bicycleType, setBicycleType] = useState<BicycleType>('gravel');
  const [localStartsAt, setLocalStartsAt] = useState('');
  const [startTimezone, setStartTimezone] = useState(DEFAULT_TIMEZONE);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [organizerProfileRequired, setOrganizerProfileRequired] =
    useState(false);
  const [isPending, setIsPending] = useState(false);
  const [createdRide, setCreatedRide] = useState<Ride | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Duplicate-submit protection (`.claude/rules/frontend.md`): a disabled button
    // doesn't stop an Enter-key resubmit before React re-renders.
    if (isPending) return;

    if (!localStartsAt) {
      setFieldErrors({ startsAt: RIDE_CREATE_TERMS.startsAtRequired });
      return;
    }

    const payload = {
      title: title.trim(),
      bicycleType,
      startsAt: zonedTimeToUtcIso(localStartsAt, startTimezone),
      startTimezone,
    };

    const parsed = createRideRequestSchema.safeParse(payload);
    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (
          field === 'title' ||
          field === 'bicycleType' ||
          field === 'startsAt' ||
          field === 'startTimezone'
        ) {
          nextErrors[field] ??= issue.message;
        }
      }
      setFieldErrors(nextErrors);
      setFormError(null);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setOrganizerProfileRequired(false);
    setIsPending(true);

    try {
      const response = await createRide(parsed.data);
      setCreatedRide(response.ride);
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.problem.code === 'organizer_profile_required'
      ) {
        setOrganizerProfileRequired(true);
      } else if (
        error instanceof ApiError &&
        error.problem.code === 'validation_error' &&
        error.problem.errors
      ) {
        const nextErrors: FieldErrors = {};
        for (const issue of error.problem.errors) {
          if (
            issue.path === 'title' ||
            issue.path === 'bicycleType' ||
            issue.path === 'startsAt' ||
            issue.path === 'startTimezone'
          ) {
            nextErrors[issue.path] ??= issue.message;
          }
        }
        setFieldErrors(nextErrors);
      } else {
        setFormError(RIDE_CREATE_TERMS.loadError);
      }
    } finally {
      setIsPending(false);
    }
  }

  if (createdRide) {
    const statusTerm = RIDE_STATUS_TERMS[createdRide.status];
    const startDate = new Date(createdRide.startsAt);
    return (
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium text-text">
            {RIDE_CREATE_TERMS.successTitle}
          </h2>
          <StatusBadge label={statusTerm.label} tone={statusTerm.tone} />
        </div>
        <p className="text-sm font-medium text-text">{createdRide.title}</p>
        <MetricRow>
          <MetricTile
            label={RIDE_CREATE_TERMS.summaryBicycleTypeLabel}
            value={BICYCLE_TYPE_TERMS[createdRide.bicycleType]}
          />
          <MetricTile
            label={RIDE_CREATE_TERMS.summaryStartLabel}
            value={formatDate(startDate, {
              timeZone: createdRide.startTimezone,
            })}
            unit={formatTime(startDate, {
              timeZone: createdRide.startTimezone,
            })}
          />
        </MetricRow>
        <Link
          href="/organizer"
          className="self-start text-sm font-medium text-primary hover:underline"
        >
          {RIDE_CREATE_TERMS.backToDashboard}
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <FormField
          id="ride-title"
          label={RIDE_CREATE_TERMS.titleLabel}
          hint={RIDE_CREATE_TERMS.titleHint}
          error={fieldErrors.title}
        >
          <Input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={isPending}
          />
        </FormField>

        <FormField
          id="ride-bicycle-type"
          label={RIDE_CREATE_TERMS.bicycleTypeLabel}
          error={fieldErrors.bicycleType}
        >
          <select
            value={bicycleType}
            onChange={(event) =>
              setBicycleType(event.target.value as BicycleType)
            }
            disabled={isPending}
            className={selectClassName(Boolean(fieldErrors.bicycleType))}
          >
            {BICYCLE_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {BICYCLE_TYPE_TERMS[type]}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          id="ride-starts-at"
          label={RIDE_CREATE_TERMS.startsAtLabel}
          error={fieldErrors.startsAt}
        >
          <Input
            type="datetime-local"
            value={localStartsAt}
            onChange={(event) => setLocalStartsAt(event.target.value)}
            disabled={isPending}
          />
        </FormField>

        <FormField
          id="ride-start-timezone"
          label={RIDE_CREATE_TERMS.startTimezoneLabel}
          error={fieldErrors.startTimezone}
        >
          <select
            value={startTimezone}
            onChange={(event) => setStartTimezone(event.target.value)}
            disabled={isPending}
            className={selectClassName(Boolean(fieldErrors.startTimezone))}
          >
            {RUSSIAN_TIMEZONE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FormField>

        {organizerProfileRequired && (
          <p role="alert" className="text-sm text-danger">
            {RIDE_CREATE_TERMS.organizerProfileRequired}{' '}
            <Link href="/organizer/profile" className="underline">
              {RIDE_CREATE_TERMS.createOrganizerProfileLink}
            </Link>
          </p>
        )}

        {formError && !organizerProfileRequired && (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        )}

        <Button type="submit" isLoading={isPending} className="self-start">
          {isPending
            ? RIDE_CREATE_TERMS.submitPending
            : RIDE_CREATE_TERMS.submit}
        </Button>
      </form>
    </Card>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { BICYCLE_TYPES, DIFFICULTY_LEVELS, type Ride } from 'types';
import type { BicycleType, DifficultyLevel } from 'types';
import {
  BICYCLE_TYPE_TERMS,
  Button,
  Card,
  DIFFICULTY_LEVEL_TERMS,
  ErrorState,
  FormField,
  Input,
  RIDE_EDIT_TERMS,
  RUSSIAN_TIMEZONE_OPTIONS,
  Skeleton,
  StatusBadge,
  Textarea,
  RIDE_STATUS_TERMS,
} from 'ui';
import {
  utcIsoToZonedLocalInput,
  zonedTimeToUtcIso,
} from '@/lib/datetime/zoned-time';
import { ApiError, getRide, updateRide, updateRideRequestSchema } from '../api';

type LoadStatus = 'loading' | 'ready' | 'not-found' | 'error';

interface FormState {
  title: string;
  description: string;
  bicycleType: BicycleType;
  localStartsAt: string;
  startTimezone: string;
  participantLimit: string;
  priceRub: string;
  distanceKm: string;
  elevationGainMeters: string;
  paceKmh: string;
  durationMinutes: string;
  difficulty: '' | DifficultyLevel;
}

function toFormState(ride: Ride): FormState {
  return {
    title: ride.title,
    description: ride.description ?? '',
    bicycleType: ride.bicycleType,
    localStartsAt: utcIsoToZonedLocalInput(ride.startsAt, ride.startTimezone),
    startTimezone: ride.startTimezone,
    participantLimit: ride.participantLimit?.toString() ?? '',
    priceRub: ride.priceRub?.toString() ?? '',
    distanceKm: ride.distanceKm?.toString() ?? '',
    elevationGainMeters: ride.elevationGainMeters?.toString() ?? '',
    paceKmh: ride.paceKmh?.toString() ?? '',
    durationMinutes: ride.durationMinutes?.toString() ?? '',
    difficulty: ride.difficulty ?? '',
  };
}

/** Empty text field -> `null` (clear); non-empty -> the number. Not `undefined` in
 * either case — this form always submits its full current state, same convention as
 * `OrganizerProfileForm`, not a sparse diff. */
function toNullableNumber(raw: string): number | null {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? Number(trimmed) : null;
}

function selectClassName(hasError: boolean): string {
  return [
    'min-h-11 w-full rounded-lg border bg-bg-raised px-3 text-base text-text',
    hasError ? 'border-danger' : 'border-border-input',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    'disabled:cursor-not-allowed disabled:opacity-60',
  ].join(' ');
}

interface FieldErrors {
  [key: string]: string | undefined;
}

/**
 * `/organizer/rides/[id]/edit` (`docs/design.md` §8 "Edit draft", CR-018). Fills in
 * every field CR-017 deliberately left `null` at creation. Draft-only — a non-draft
 * ride renders read-only with {@link RIDE_EDIT_TERMS.notEditable} instead of a form
 * the server would reject anyway (`ride_not_editable`, CR-016's ownership check
 * resolves before this ever renders: a 404 here means "not found or not yours",
 * never revealed which).
 */
export function EditRideForm({ rideId }: { rideId: string }) {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [ride, setRide] = useState<Ride | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getRide(rideId)
      .then((response) => {
        if (cancelled) return;
        setRide(response.ride);
        setForm(toFormState(response.ride));
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (
          error instanceof ApiError &&
          error.problem.code === 'ride_not_found'
        ) {
          setStatus('not-found');
          return;
        }
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [rideId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending || !form) return;

    if (!form.localStartsAt) {
      setFieldErrors({ startsAt: RIDE_EDIT_TERMS.startsAtRequired });
      return;
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() ? form.description.trim() : null,
      bicycleType: form.bicycleType,
      startsAt: zonedTimeToUtcIso(form.localStartsAt, form.startTimezone),
      startTimezone: form.startTimezone,
      participantLimit: toNullableNumber(form.participantLimit),
      priceRub: toNullableNumber(form.priceRub),
      distanceKm: toNullableNumber(form.distanceKm),
      elevationGainMeters: toNullableNumber(form.elevationGainMeters),
      paceKmh: toNullableNumber(form.paceKmh),
      durationMinutes: toNullableNumber(form.durationMinutes),
      difficulty: form.difficulty === '' ? null : form.difficulty,
    };

    const parsed = updateRideRequestSchema.safeParse(payload);
    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string') nextErrors[field] ??= issue.message;
      }
      setFieldErrors(nextErrors);
      setFormError(null);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setSuccessMessage(null);
    setIsPending(true);

    try {
      const response = await updateRide(rideId, parsed.data);
      setRide(response.ride);
      setForm(toFormState(response.ride));
      setSuccessMessage(RIDE_EDIT_TERMS.saveSuccess);
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.problem.code === 'validation_error' &&
        error.problem.errors
      ) {
        const nextErrors: FieldErrors = {};
        for (const issue of error.problem.errors) {
          nextErrors[issue.path] ??= issue.message;
        }
        setFieldErrors(nextErrors);
      } else {
        setFormError(RIDE_EDIT_TERMS.loadError);
      }
    } finally {
      setIsPending(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (status === 'not-found') {
    return (
      <Card className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm font-medium text-text">
          {RIDE_EDIT_TERMS.notFoundTitle}
        </p>
        <p className="max-w-sm text-sm text-text-secondary">
          {RIDE_EDIT_TERMS.notFoundDescription}
        </p>
        <Link
          href="/organizer/rides"
          className="text-sm font-medium text-primary hover:underline"
        >
          {RIDE_EDIT_TERMS.backToList}
        </Link>
      </Card>
    );
  }

  if (status === 'error' || !ride || !form) {
    return <ErrorState message={RIDE_EDIT_TERMS.loadError} />;
  }

  const isDraft = ride.status === 'draft';
  const statusTerm = RIDE_STATUS_TERMS[ride.status];

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <StatusBadge label={statusTerm.label} tone={statusTerm.tone} />
        </div>

        {!isDraft && (
          <p role="status" className="text-sm text-warning">
            {RIDE_EDIT_TERMS.notEditable}
          </p>
        )}

        <FormField
          id="ride-title"
          label={RIDE_EDIT_TERMS.titleLabel}
          error={fieldErrors.title}
        >
          <Input
            type="text"
            value={form.title}
            onChange={(event) =>
              setForm({ ...form, title: event.target.value })
            }
            disabled={isPending || !isDraft}
          />
        </FormField>

        <FormField
          id="ride-description"
          label={RIDE_EDIT_TERMS.descriptionLabel}
          hint={RIDE_EDIT_TERMS.descriptionHint}
          error={fieldErrors.description}
        >
          <Textarea
            value={form.description}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
            disabled={isPending || !isDraft}
          />
        </FormField>

        <FormField
          id="ride-bicycle-type"
          label={RIDE_EDIT_TERMS.bicycleTypeLabel}
          error={fieldErrors.bicycleType}
        >
          <select
            value={form.bicycleType}
            onChange={(event) =>
              setForm({
                ...form,
                bicycleType: event.target.value as BicycleType,
              })
            }
            disabled={isPending || !isDraft}
            className={selectClassName(Boolean(fieldErrors.bicycleType))}
          >
            {BICYCLE_TYPES.map((type) => (
              <option key={type} value={type}>
                {BICYCLE_TYPE_TERMS[type]}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          id="ride-starts-at"
          label={RIDE_EDIT_TERMS.startsAtLabel}
          error={fieldErrors.startsAt ?? fieldErrors.startTimezone}
        >
          <Input
            type="datetime-local"
            value={form.localStartsAt}
            onChange={(event) =>
              setForm({ ...form, localStartsAt: event.target.value })
            }
            disabled={isPending || !isDraft}
          />
        </FormField>

        <FormField
          id="ride-start-timezone"
          label={RIDE_EDIT_TERMS.startTimezoneLabel}
        >
          <select
            value={form.startTimezone}
            onChange={(event) =>
              setForm({ ...form, startTimezone: event.target.value })
            }
            disabled={isPending || !isDraft}
            className={selectClassName(false)}
          >
            {RUSSIAN_TIMEZONE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          id="ride-participant-limit"
          label={RIDE_EDIT_TERMS.participantLimitLabel}
          error={fieldErrors.participantLimit}
        >
          <Input
            type="number"
            min={1}
            value={form.participantLimit}
            onChange={(event) =>
              setForm({ ...form, participantLimit: event.target.value })
            }
            disabled={isPending || !isDraft}
          />
        </FormField>

        <FormField
          id="ride-price-rub"
          label={RIDE_EDIT_TERMS.priceRubLabel}
          error={fieldErrors.priceRub}
        >
          <Input
            type="number"
            min={0}
            value={form.priceRub}
            onChange={(event) =>
              setForm({ ...form, priceRub: event.target.value })
            }
            disabled={isPending || !isDraft}
          />
        </FormField>

        <FormField
          id="ride-distance-km"
          label={RIDE_EDIT_TERMS.distanceKmLabel}
          error={fieldErrors.distanceKm}
        >
          <Input
            type="number"
            min={0}
            step={0.1}
            value={form.distanceKm}
            onChange={(event) =>
              setForm({ ...form, distanceKm: event.target.value })
            }
            disabled={isPending || !isDraft}
          />
        </FormField>

        <FormField
          id="ride-elevation-gain"
          label={RIDE_EDIT_TERMS.elevationGainMetersLabel}
          error={fieldErrors.elevationGainMeters}
        >
          <Input
            type="number"
            min={0}
            value={form.elevationGainMeters}
            onChange={(event) =>
              setForm({ ...form, elevationGainMeters: event.target.value })
            }
            disabled={isPending || !isDraft}
          />
        </FormField>

        <FormField
          id="ride-pace-kmh"
          label={RIDE_EDIT_TERMS.paceKmhLabel}
          error={fieldErrors.paceKmh}
        >
          <Input
            type="number"
            min={0}
            step={0.1}
            value={form.paceKmh}
            onChange={(event) =>
              setForm({ ...form, paceKmh: event.target.value })
            }
            disabled={isPending || !isDraft}
          />
        </FormField>

        <FormField
          id="ride-duration-minutes"
          label={RIDE_EDIT_TERMS.durationMinutesLabel}
          error={fieldErrors.durationMinutes}
        >
          <Input
            type="number"
            min={0}
            value={form.durationMinutes}
            onChange={(event) =>
              setForm({ ...form, durationMinutes: event.target.value })
            }
            disabled={isPending || !isDraft}
          />
        </FormField>

        <FormField
          id="ride-difficulty"
          label={RIDE_EDIT_TERMS.difficultyLabel}
          error={fieldErrors.difficulty}
        >
          <select
            value={form.difficulty}
            onChange={(event) =>
              setForm({
                ...form,
                difficulty:
                  event.target.value === ''
                    ? ''
                    : (Number(event.target.value) as DifficultyLevel),
              })
            }
            disabled={isPending || !isDraft}
            className={selectClassName(Boolean(fieldErrors.difficulty))}
          >
            <option value="">{RIDE_EDIT_TERMS.difficultyNotSet}</option>
            {DIFFICULTY_LEVELS.map((level) => (
              <option key={level} value={level}>
                {DIFFICULTY_LEVEL_TERMS[level]}
              </option>
            ))}
          </select>
        </FormField>

        {formError && (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        )}

        {successMessage && !formError && (
          <p role="status" className="text-sm text-success">
            {successMessage}
          </p>
        )}

        {isDraft && (
          <Button type="submit" isLoading={isPending} className="self-start">
            {isPending ? RIDE_EDIT_TERMS.savePending : RIDE_EDIT_TERMS.save}
          </Button>
        )}
      </form>
    </Card>
  );
}

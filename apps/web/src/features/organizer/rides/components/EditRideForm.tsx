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
import {
  ApiError,
  cancelRide,
  closeRegistration,
  finishRide,
  getRide,
  openRegistration,
  publishRide,
  startRide,
  updateRide,
  updateRideRequestSchema,
} from '../api';

const CANCELLABLE_STATUSES: ReadonlyArray<Ride['status']> = [
  'published',
  'registration_open',
  'registration_closed',
];

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
  startLat: string;
  startLng: string;
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
    startLat: ride.startLat?.toString() ?? '',
    startLng: ride.startLng?.toString() ?? '',
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
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishVerificationRequired, setPublishVerificationRequired] =
    useState(false);
  const [isOpeningRegistration, setIsOpeningRegistration] = useState(false);
  const [isClosingRegistration, setIsClosingRegistration] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

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
      startLat: toNullableNumber(form.startLat),
      startLng: toNullableNumber(form.startLng),
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

  async function handlePublish() {
    if (isPublishing) return;

    setFormError(null);
    setSuccessMessage(null);
    setPublishVerificationRequired(false);
    setIsPublishing(true);

    try {
      const response = await publishRide(rideId);
      setRide(response.ride);
      setForm(toFormState(response.ride));
      setSuccessMessage(RIDE_EDIT_TERMS.publishSuccess);
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.problem.code === 'email_verification_required'
      ) {
        setPublishVerificationRequired(true);
      } else {
        setFormError(RIDE_EDIT_TERMS.loadError);
      }
    } finally {
      setIsPublishing(false);
    }
  }

  /** CR-089 ("Open registration"): `published -> registration_open`. No dedicated
   * error banner like `handlePublish`'s email-verification case — the one possible
   * failure beyond the network (`ride_registration_not_openable`) can't actually
   * happen from this button, since it only renders while `ride.status ===
   * 'published'`. */
  async function handleOpenRegistration() {
    if (isOpeningRegistration) return;

    setFormError(null);
    setSuccessMessage(null);
    setIsOpeningRegistration(true);

    try {
      const response = await openRegistration(rideId);
      setRide(response.ride);
      setForm(toFormState(response.ride));
      setSuccessMessage(RIDE_EDIT_TERMS.openRegistrationSuccess);
    } catch {
      setFormError(RIDE_EDIT_TERMS.loadError);
    } finally {
      setIsOpeningRegistration(false);
    }
  }

  /** CR-020 ("Close registration"): `registration_open -> registration_closed`. */
  async function handleCloseRegistration() {
    if (isClosingRegistration) return;

    setFormError(null);
    setSuccessMessage(null);
    setIsClosingRegistration(true);

    try {
      const response = await closeRegistration(rideId);
      setRide(response.ride);
      setForm(toFormState(response.ride));
      setSuccessMessage(RIDE_EDIT_TERMS.closeRegistrationSuccess);
    } catch {
      setFormError(RIDE_EDIT_TERMS.loadError);
    } finally {
      setIsClosingRegistration(false);
    }
  }

  /**
   * CR-021 ("Cancel ride"): the only lifecycle action with no forward continuation
   * (`docs/product.md`'s Lifecycle has nothing after `cancelled`) and, per
   * `docs/design.md`, the one status the calm palette deliberately breaks its own
   * rule for — a native `confirm()` guard is a minimal, proportionate safeguard
   * against a one-click irreversible action, not a new Dialog component
   * (`.claude/context/current-task.md`).
   */
  async function handleCancel() {
    if (isCancelling) return;
    if (!window.confirm(RIDE_EDIT_TERMS.cancelConfirm)) return;

    setFormError(null);
    setSuccessMessage(null);
    setIsCancelling(true);

    try {
      const response = await cancelRide(rideId);
      setRide(response.ride);
      setForm(toFormState(response.ride));
      setSuccessMessage(RIDE_EDIT_TERMS.cancelSuccess);
    } catch {
      setFormError(RIDE_EDIT_TERMS.loadError);
    } finally {
      setIsCancelling(false);
    }
  }

  /** CR-090 ("Start ride"): `registration_closed -> started`. No confirmation guard,
   * unlike `handleCancel` — this is a forward-only step with a further continuation
   * (leads to `finish`), not the one dead-end action `docs/design.md` singles out. */
  async function handleStart() {
    if (isStarting) return;

    setFormError(null);
    setSuccessMessage(null);
    setIsStarting(true);

    try {
      const response = await startRide(rideId);
      setRide(response.ride);
      setForm(toFormState(response.ride));
      setSuccessMessage(RIDE_EDIT_TERMS.startSuccess);
    } catch {
      setFormError(RIDE_EDIT_TERMS.loadError);
    } finally {
      setIsStarting(false);
    }
  }

  /** CR-022 ("Finish ride"): `started -> finished`, the last lifecycle transition. */
  async function handleFinish() {
    if (isFinishing) return;

    setFormError(null);
    setSuccessMessage(null);
    setIsFinishing(true);

    try {
      const response = await finishRide(rideId);
      setRide(response.ride);
      setForm(toFormState(response.ride));
      setSuccessMessage(RIDE_EDIT_TERMS.finishSuccess);
    } catch {
      setFormError(RIDE_EDIT_TERMS.loadError);
    } finally {
      setIsFinishing(false);
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
          <Link
            href={`/organizer/rides/${rideId}/route`}
            className="text-sm font-medium text-primary hover:underline"
          >
            {RIDE_EDIT_TERMS.routeLink}
          </Link>
          <Link
            href={`/organizer/rides/${rideId}/participants`}
            className="text-sm font-medium text-primary hover:underline"
          >
            {RIDE_EDIT_TERMS.participantsLink}
          </Link>
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
          id="ride-start-lat"
          label={RIDE_EDIT_TERMS.startLatLabel}
          error={fieldErrors.startLat}
        >
          <Input
            type="number"
            min={-90}
            max={90}
            step="any"
            value={form.startLat}
            onChange={(event) =>
              setForm({ ...form, startLat: event.target.value })
            }
            disabled={isPending || !isDraft}
          />
        </FormField>

        <FormField
          id="ride-start-lng"
          label={RIDE_EDIT_TERMS.startLngLabel}
          error={fieldErrors.startLng}
        >
          <Input
            type="number"
            min={-180}
            max={180}
            step="any"
            value={form.startLng}
            onChange={(event) =>
              setForm({ ...form, startLng: event.target.value })
            }
            disabled={isPending || !isDraft}
          />
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

        {publishVerificationRequired && (
          <p role="alert" className="text-sm text-danger">
            {RIDE_EDIT_TERMS.publishEmailVerificationRequired}
          </p>
        )}

        {formError && !publishVerificationRequired && (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        )}

        {successMessage && !formError && !publishVerificationRequired && (
          <p role="status" className="text-sm text-success">
            {successMessage}
          </p>
        )}

        {isDraft && (
          <div className="flex flex-wrap gap-3">
            <Button type="submit" isLoading={isPending} className="self-start">
              {isPending ? RIDE_EDIT_TERMS.savePending : RIDE_EDIT_TERMS.save}
            </Button>
            <Button
              type="button"
              variant="secondary"
              isLoading={isPublishing}
              onClick={handlePublish}
              className="self-start"
            >
              {isPublishing
                ? RIDE_EDIT_TERMS.publishPending
                : RIDE_EDIT_TERMS.publish}
            </Button>
          </div>
        )}

        {ride.status === 'published' && (
          <Button
            type="button"
            variant="secondary"
            isLoading={isOpeningRegistration}
            onClick={handleOpenRegistration}
            className="self-start"
          >
            {isOpeningRegistration
              ? RIDE_EDIT_TERMS.openRegistrationPending
              : RIDE_EDIT_TERMS.openRegistration}
          </Button>
        )}

        {ride.status === 'registration_open' && (
          <Button
            type="button"
            variant="secondary"
            isLoading={isClosingRegistration}
            onClick={handleCloseRegistration}
            className="self-start"
          >
            {isClosingRegistration
              ? RIDE_EDIT_TERMS.closeRegistrationPending
              : RIDE_EDIT_TERMS.closeRegistration}
          </Button>
        )}

        {CANCELLABLE_STATUSES.includes(ride.status) && (
          <Button
            type="button"
            variant="danger"
            isLoading={isCancelling}
            onClick={handleCancel}
            className="self-start"
          >
            {isCancelling
              ? RIDE_EDIT_TERMS.cancelPending
              : RIDE_EDIT_TERMS.cancel}
          </Button>
        )}

        {ride.status === 'registration_closed' && (
          <Button
            type="button"
            variant="secondary"
            isLoading={isStarting}
            onClick={handleStart}
            className="self-start"
          >
            {isStarting ? RIDE_EDIT_TERMS.startPending : RIDE_EDIT_TERMS.start}
          </Button>
        )}

        {ride.status === 'started' && (
          <Button
            type="button"
            variant="secondary"
            isLoading={isFinishing}
            onClick={handleFinish}
            className="self-start"
          >
            {isFinishing
              ? RIDE_EDIT_TERMS.finishPending
              : RIDE_EDIT_TERMS.finish}
          </Button>
        )}
      </form>
    </Card>
  );
}

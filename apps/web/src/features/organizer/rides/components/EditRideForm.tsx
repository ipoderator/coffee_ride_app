'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useState, type FormEvent } from 'react';
import {
  RideContactFields,
  rideContactFromResponse,
  rideContactToRequest,
  type RideContactDraft,
} from './RideContactFields';
import { BICYCLE_TYPES, DIFFICULTY_LEVELS, type Ride } from 'types';
import type { BicycleType, DifficultyLevel } from 'types';
import {
  BICYCLE_TYPE_TERMS,
  Button,
  Card,
  DatePicker,
  DIFFICULTY_LEVEL_TERMS,
  FormField,
  Input,
  RIDE_CREATE_TERMS,
  RIDE_EDIT_TERMS,
  RIDE_WORKSPACE_TERMS,
  RUSSIAN_TIMEZONE_OPTIONS,
  Textarea,
  TimeInput,
  useToast,
} from 'ui';
import {
  useRideWorkspace,
  type RideWorkspaceContextValue,
} from '@/lib/cabinet/ride-workspace';
import { ResendVerificationButton } from '@/lib/auth/ResendVerificationButton';
import {
  fieldErrorMessage,
  serverFieldErrorMessage,
} from '@/lib/forms/field-errors';
import {
  todayLocalYmd,
  utcIsoToZonedLocalInput,
  zonedTimeToUtcIso,
} from '@/lib/datetime/zoned-time';
import {
  ApiError,
  publishRide,
  updateRide,
  updateRideRequestSchema,
} from '../api';
import { rideFieldShapeError } from '../field-errors';
import { wizardStepHref } from '../wizard-steps';
import { PublishWithoutRouteDialog } from './PublishWithoutRouteDialog';
import { RideOverview } from './RideOverview';
import { RideReadinessList } from './RideReadinessList';

interface FormState {
  title: string;
  description: string;
  bicycleType: BicycleType;
  // CR-195: date and time apart, the same controls as the wizard's step 1
  // (`CreateRideForm`) — one way to enter a start in the whole wizard.
  startDate: string;
  startTime: string;
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
  participantsVisible: boolean;
}

function toFormState(ride: Ride): FormState {
  const local = utcIsoToZonedLocalInput(ride.startsAt, ride.startTimezone);
  return {
    title: ride.title,
    description: ride.description ?? '',
    bicycleType: ride.bicycleType,
    startDate: local.slice(0, 10),
    startTime: local.slice(11, 16),
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
    participantsVisible: ride.participantsVisible,
  };
}

/** CR-155: the requirements textarea holds one `RideRequirement` per line. */
function toRequirementLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
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
    'min-h-11 w-full rounded-lg border bg-bg-raised px-3 text-body text-text',
    hasError ? 'border-danger' : 'border-border-input',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    'disabled:cursor-not-allowed disabled:opacity-60',
  ].join(' ');
}

interface FieldErrors {
  [key: string]: string | undefined;
}

/**
 * `/organizer/rides/[id]/edit` — the ride workspace's «Обзор» tab (CR-187).
 * Renders inside `RideWorkspace`, which owns the ride read, the title and the
 * lifecycle steps. A draft (CR-018) is the full form under a «Перед
 * публикацией» checklist; a published ride or later is `RideOverview` — never
 * a locked copy of the form (CR-184). CR-016's ownership check resolves in the
 * workspace before this renders.
 *
 * `wizard` (CR-192): opened as the new-ride wizard's last step, so publishing
 * leaves the wizard for the ordinary workspace.
 */
export function EditRideForm({ wizard = false }: { wizard?: boolean }) {
  const workspace = useRideWorkspace();
  if (!workspace) return null;
  return workspace.data.ride.status === 'draft' ? (
    <DraftRideForm workspace={workspace} wizard={wizard} />
  ) : (
    <RideOverview workspace={workspace} />
  );
}

function DraftRideForm({
  workspace,
  wizard,
}: {
  workspace: RideWorkspaceContextValue;
  wizard: boolean;
}) {
  const { data, sections, applyRide } = workspace;
  const rideId = data.ride.id;
  const router = useRouter();
  const { showToast } = useToast();
  const headingId = useId();
  const [form, setForm] = useState<FormState>(() => toFormState(data.ride));
  const startTimeRef = useRef<HTMLInputElement>(null);
  const [requirementsText, setRequirementsText] = useState(() =>
    data.requirements.join('\n'),
  );
  // CR-165: the contact is private and not part of `Ride`, so it is kept
  // apart from `form`.
  const [contact, setContact] = useState<RideContactDraft>(() =>
    rideContactFromResponse(data.contact),
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishVerificationRequired, setPublishVerificationRequired] =
    useState(false);
  const [publishWithoutRouteOpen, setPublishWithoutRouteOpen] = useState(false);
  // CR-157 (same as step 1): no picking a start day that has already passed.
  const [todayLocal] = useState(todayLocalYmd);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    // What the field shows, not what React last heard (`TimeInput`).
    const startTime = startTimeRef.current?.value ?? form.startTime;
    setForm((current) => ({ ...current, startTime }));

    if (!form.startDate || !startTime) {
      setFieldErrors({
        startDate: form.startDate
          ? undefined
          : RIDE_CREATE_TERMS.startDateRequired,
        startTime: startTime ? undefined : RIDE_CREATE_TERMS.startTimeRequired,
      });
      return;
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() ? form.description.trim() : null,
      bicycleType: form.bicycleType,
      startsAt: zonedTimeToUtcIso(
        `${form.startDate}T${startTime}`,
        form.startTimezone,
      ),
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
      participantsVisible: form.participantsVisible,
      contact: rideContactToRequest(contact),
      requirements: toRequirementLines(requirementsText),
    };

    const parsed = updateRideRequestSchema.safeParse(payload);
    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string') {
          nextErrors[field] ??= fieldErrorMessage(
            issue,
            rideFieldShapeError(field, contact.type),
          );
        }
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
      // The workspace head shows the (possibly renamed) title.
      applyRide(response.ride);
      setForm(toFormState(response.ride));
      setRequirementsText(response.requirements.join('\n'));
      setSuccessMessage(RIDE_EDIT_TERMS.saveSuccess);
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.problem.code === 'validation_error' &&
        error.problem.errors
      ) {
        const nextErrors: FieldErrors = {};
        for (const issue of error.problem.errors) {
          // `requirements.3` → the one requirements field.
          const field = issue.path.split('.')[0]!;
          nextErrors[field] ??= serverFieldErrorMessage(
            rideFieldShapeError(field, contact.type),
          );
        }
        setFieldErrors(nextErrors);
      } else {
        setFormError(RIDE_EDIT_TERMS.loadError);
      }
    } finally {
      setIsPending(false);
    }
  }

  /** CR-192: a ride without a route is allowed, but the route can never be
   * added after publishing — ask first. With a route: straight through. */
  function requestPublish() {
    if (isPublishing) return;
    if (data.route === null) {
      setPublishWithoutRouteOpen(true);
      return;
    }
    void handlePublish();
  }

  /** CR-019: publishes what is saved. On success the workspace shows the
   * result line and remounts this tab as the published overview. CR-192: from
   * the wizard it leaves for the ordinary workspace instead — the creation
   * steps are done — with a toast, which survives the navigation. */
  async function handlePublish() {
    if (isPublishing) return;

    setFormError(null);
    setSuccessMessage(null);
    setPublishVerificationRequired(false);
    setIsPublishing(true);

    try {
      const response = await publishRide(rideId);
      if (wizard) {
        showToast(RIDE_EDIT_TERMS.publishSuccess);
        // `isPublishing` stays on: the form shows «Публикация…» until the new
        // page replaces it, so no second publish can start.
        router.replace(`/organizer/rides/${encodeURIComponent(rideId)}/edit`);
        return;
      }
      setPublishWithoutRouteOpen(false);
      applyRide(response.ride, RIDE_EDIT_TERMS.publishSuccess);
    } catch (error) {
      setPublishWithoutRouteOpen(false);
      if (
        error instanceof ApiError &&
        error.problem.code === 'email_verification_required'
      ) {
        setPublishVerificationRequired(true);
      } else {
        setFormError(RIDE_EDIT_TERMS.loadError);
      }
      setIsPublishing(false);
    }
  }

  return (
    <>
      <section aria-labelledby={headingId} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="text-h2 text-text">
            {RIDE_WORKSPACE_TERMS.overviewTitle.draft}
          </h2>
          <p className="max-w-2xl text-body-sm text-text-secondary">
            {RIDE_WORKSPACE_TERMS.overviewDescription.draft}
          </p>
        </div>
        <RideReadinessList
          rideId={rideId}
          sections={sections}
          data={data}
          labelledBy={headingId}
        />
      </section>

      <Card>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <h2 className="text-h3 text-text">{RIDE_EDIT_TERMS.pageTitle}</h2>

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
              disabled={isPending}
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
              disabled={isPending}
            />
          </FormField>

          <FormField
            id="ride-requirements"
            label={RIDE_EDIT_TERMS.requirementsLabel}
            hint={RIDE_EDIT_TERMS.requirementsHint}
            error={fieldErrors.requirements}
          >
            <Textarea
              value={requirementsText}
              onChange={(event) => setRequirementsText(event.target.value)}
              disabled={isPending}
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
              disabled={isPending}
              className={selectClassName(Boolean(fieldErrors.bicycleType))}
            >
              {BICYCLE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {BICYCLE_TYPE_TERMS[type]}
                </option>
              ))}
            </select>
          </FormField>

          <div className="grid gap-6 md:grid-cols-2">
            <FormField
              id="ride-start-date"
              label={RIDE_CREATE_TERMS.startDateLabel}
              // A schema/server `startsAt` issue is about the start as a
              // whole; it shows under the date, its first half.
              error={fieldErrors.startDate ?? fieldErrors.startsAt}
            >
              <DatePicker
                value={form.startDate}
                onChange={(startDate) => setForm({ ...form, startDate })}
                min={todayLocal}
                disabled={isPending}
              />
            </FormField>

            <FormField
              id="ride-start-time"
              label={RIDE_CREATE_TERMS.startTimeLabel}
              error={fieldErrors.startTime}
            >
              <TimeInput
                ref={startTimeRef}
                value={form.startTime}
                onValueChange={(startTime) => setForm({ ...form, startTime })}
                disabled={isPending}
              />
            </FormField>
          </div>

          <FormField
            id="ride-start-timezone"
            label={RIDE_EDIT_TERMS.startTimezoneLabel}
            error={fieldErrors.startTimezone}
          >
            <select
              value={form.startTimezone}
              onChange={(event) =>
                setForm({ ...form, startTimezone: event.target.value })
              }
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
              disabled={isPending}
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
              disabled={isPending}
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
              disabled={isPending}
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
              disabled={isPending}
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
              disabled={isPending}
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
              disabled={isPending}
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
              disabled={isPending}
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
              disabled={isPending}
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
              disabled={isPending}
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

          <FormField
            id="ride-participants-visible"
            label={RIDE_EDIT_TERMS.participantsVisibleLabel}
            hint={RIDE_EDIT_TERMS.participantsVisibleHint}
          >
            <input
              type="checkbox"
              checked={form.participantsVisible}
              onChange={(event) =>
                setForm({ ...form, participantsVisible: event.target.checked })
              }
              disabled={isPending}
              className="size-5 rounded border-[1.5px] border-frame accent-primary disabled:cursor-not-allowed disabled:opacity-60"
            />
          </FormField>

          <fieldset className="flex flex-col gap-4 border-0 p-0">
            <legend className="text-body-sm font-semibold text-text">
              {RIDE_EDIT_TERMS.contactLabel}
            </legend>
            {/* A draft saves its contact with the whole form (`PATCH`);
                once published, `RideOverview` has its own save (KI-081). */}
            <RideContactFields
              idPrefix="ride-edit"
              value={contact}
              onChange={setContact}
              disabled={isPending}
              error={fieldErrors.contact}
              hint={RIDE_EDIT_TERMS.contactHint}
            />
          </fieldset>

          {/* CR-168 (KI-026): publish is blocked until the email is
              verified, and this is the only place the organizer can act on
              that. */}
          {publishVerificationRequired && (
            <div className="flex flex-col gap-3">
              <p role="alert" className="text-body-sm text-danger">
                {RIDE_EDIT_TERMS.publishEmailVerificationRequired}
              </p>
              <ResendVerificationButton className="self-start" />
            </div>
          )}

          {formError && !publishVerificationRequired && (
            <p role="alert" className="text-body-sm text-danger">
              {formError}
            </p>
          )}

          {successMessage && !formError && !publishVerificationRequired && (
            <p role="status" className="text-body-sm text-success">
              {successMessage}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" isLoading={isPending} className="self-start">
              {isPending ? RIDE_EDIT_TERMS.savePending : RIDE_EDIT_TERMS.save}
            </Button>
            <Button
              type="button"
              variant="secondary"
              isLoading={isPublishing}
              onClick={requestPublish}
              className="self-start"
            >
              {isPublishing
                ? RIDE_EDIT_TERMS.publishPending
                : RIDE_EDIT_TERMS.publish}
            </Button>
          </div>
        </form>
      </Card>

      <PublishWithoutRouteDialog
        open={publishWithoutRouteOpen}
        onClose={() => {
          if (!isPublishing) setPublishWithoutRouteOpen(false);
        }}
        onConfirm={() => void handlePublish()}
        isConfirming={isPublishing}
        routeHref={
          wizard
            ? wizardStepHref('route', rideId)
            : `/organizer/rides/${encodeURIComponent(rideId)}/route`
        }
      />
    </>
  );
}

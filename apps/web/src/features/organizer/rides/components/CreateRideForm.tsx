'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EMPTY_RIDE_CONTACT,
  RideContactFields,
  rideContactFromResponse,
  rideContactToRequest,
  type RideContactDraft,
} from './RideContactFields';
import { ArrowRight } from 'lucide-react';
import type { BicycleType, DifficultyLevel } from 'types';
import { BICYCLE_TYPES, DIFFICULTY_LEVELS } from 'types';
import {
  BICYCLE_TYPE_TERMS,
  Button,
  Card,
  DatePicker,
  DIFFICULTY_LEVEL_TERMS,
  ErrorState,
  FormField,
  Input,
  RIDE_CREATE_TERMS,
  RIDE_ROUTE_TERMS,
  RUSSIAN_TIMEZONE_OPTIONS,
  Skeleton,
  Textarea,
  cn,
  formatTime,
} from 'ui';
import {
  todayLocalYmd,
  utcIsoToZonedLocalInput,
  zonedTimeToUtcIso,
} from '@/lib/datetime/zoned-time';
import {
  fieldErrorMessage,
  serverFieldErrorMessage,
} from '@/lib/forms/field-errors';
import {
  ApiError,
  createRide,
  createRideRequestSchema,
  getRide,
  updateRide,
  updateRideRequestSchema,
  uploadRideGpx,
} from '../api';
import { rideFieldShapeError } from '../field-errors';
import { RIDE_WIZARD_STEPS, wizardStepHref } from '../wizard-steps';
import { GpxDropzone } from './GpxDropzone';

const DEFAULT_TIMEZONE = 'Europe/Moscow';
// Mirrors apps/api's `GPX_MAX_UPLOAD_BYTES` (ADR-015) — a friendlier early
// check; the server's own limit stays authoritative.
const GPX_MAX_BYTES = 10 * 1024 * 1024;

type Intent = 'draft' | 'next';

interface FieldErrors {
  title?: string;
  bicycleType?: string;
  startDate?: string;
  startTime?: string;
  startTimezone?: string;
  difficulty?: string;
  description?: string;
  contact?: string;
}

/** Server/Zod issue path → the field that shows it. `startsAt` is built from
 * the date + time inputs, so its errors land under the date. */
function fieldForPath(path: unknown): keyof FieldErrors | null {
  switch (path) {
    case 'title':
    case 'bicycleType':
    case 'startTimezone':
    case 'difficulty':
    case 'description':
    // CR-165: `rideContactSchema`'s per-type messages come back under
    // `['contact', 'value']`; `issue.path[0]` is what this receives.
    case 'contact':
      return path;
    case 'startsAt':
      return 'startDate';
    default:
      return null;
  }
}

const CONTROL_CLASS = 'min-h-12 rounded-xl bg-bg';

function selectClassName(hasError: boolean): string {
  return cn(
    'min-h-12 w-full rounded-xl border bg-bg px-3 text-body text-text',
    hasError ? 'border-danger' : 'border-border-input',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    'disabled:cursor-not-allowed disabled:opacity-60',
  );
}

function gpxErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.problem.code) {
      case 'gpx_invalid':
        return RIDE_ROUTE_TERMS.gpxInvalid;
      case 'gpx_file_too_large':
        return RIDE_ROUTE_TERMS.gpxFileTooLarge;
      case 'route_storage_unavailable':
        return RIDE_ROUTE_TERMS.storageUnavailable;
    }
  }
  return RIDE_ROUTE_TERMS.loadError;
}

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

interface CreateRideFormProps {
  /** CR-156: an existing draft to keep editing (`/organizer/rides/new?ride=`),
   * e.g. after «Назад» from step 2. Absent → the first save creates it. */
  rideId?: string | null;
}

/**
 * Step 1 of the new-ride wizard, «Основное о заезде» (CR-156, the owner's
 * «Ночной старт» mockup; originally CR-017's create form). The first save
 * creates the draft in one `POST` (title, type, start, difficulty,
 * description) and moves the URL to `?ride=<id>` so a reload or a second save
 * updates it instead of creating another. A chosen GPX file is uploaded right
 * after — the draft stays saved if that upload fails.
 */
export function CreateRideForm({
  rideId: initialRideId = null,
}: CreateRideFormProps) {
  const router = useRouter();
  const [rideId, setRideId] = useState<string | null>(initialRideId);
  // The id this form itself just created — its URL change must not reload it.
  const createdIdRef = useRef<string | null>(null);
  const [loadState, setLoadState] = useState<'ready' | 'loading' | 'error'>(
    initialRideId ? 'loading' : 'ready',
  );

  const [title, setTitle] = useState('');
  const [bicycleType, setBicycleType] = useState<BicycleType>('gravel');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [startTimezone, setStartTimezone] = useState(DEFAULT_TIMEZONE);
  const [difficulty, setDifficulty] = useState('');
  const [description, setDescription] = useState('');
  // CR-165: optional «Способ связи» — «Не указывать» by default.
  const [contact, setContact] = useState<RideContactDraft>(EMPTY_RIDE_CONTACT);
  const [gpxFile, setGpxFile] = useState<File | null>(null);
  const [gpxError, setGpxError] = useState<string | undefined>(undefined);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [organizerProfileRequired, setOrganizerProfileRequired] =
    useState(false);
  const [pendingIntent, setPendingIntent] = useState<Intent | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const isPending = pendingIntent !== null;
  // CR-157: no picking a start day that has already passed (browser-local).
  const [todayLocal] = useState(todayLocalYmd);

  const loadDraft = useCallback(async (id: string) => {
    setLoadState('loading');
    try {
      const { ride, isOwner, contact: loadedContact } = await getRide(id);
      if (!isOwner) {
        setLoadState('error');
        return;
      }
      const local = utcIsoToZonedLocalInput(ride.startsAt, ride.startTimezone);
      setTitle(ride.title);
      setBicycleType(ride.bicycleType);
      setStartDate(local.slice(0, 10));
      setStartTime(local.slice(11, 16));
      setStartTimezone(ride.startTimezone);
      setDifficulty(ride.difficulty === null ? '' : String(ride.difficulty));
      setDescription(ride.description ?? '');
      setContact(rideContactFromResponse(loadedContact));
      setRideId(ride.id);
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    if (!initialRideId || initialRideId === createdIdRef.current) return;
    void loadDraft(initialRideId);
  }, [initialRideId, loadDraft]);

  function handleGpxChange(file: File | null) {
    setGpxError(undefined);
    if (file && !file.name.toLowerCase().endsWith('.gpx')) {
      setGpxFile(null);
      setGpxError(RIDE_CREATE_TERMS.gpxWrongType);
      return;
    }
    if (file && file.size > GPX_MAX_BYTES) {
      setGpxFile(null);
      setGpxError(RIDE_CREATE_TERMS.gpxTooLarge);
      return;
    }
    setGpxFile(file);
  }

  async function save(intent: Intent) {
    // Duplicate-submit protection (`.claude/rules/frontend.md`): a disabled
    // button doesn't stop an Enter-key resubmit before React re-renders.
    if (isPending) return;

    const clientErrors: FieldErrors = {};
    if (!startDate)
      clientErrors.startDate = RIDE_CREATE_TERMS.startDateRequired;
    if (!startTime)
      clientErrors.startTime = RIDE_CREATE_TERMS.startTimeRequired;
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      setFormError(null);
      return;
    }

    const contactPayload = rideContactToRequest(contact);
    const payload = {
      title: title.trim(),
      bicycleType,
      startsAt: zonedTimeToUtcIso(`${startDate}T${startTime}`, startTimezone),
      startTimezone,
      description: description.trim() || null,
      difficulty: difficulty ? (Number(difficulty) as DifficultyLevel) : null,
      // CR-165: only sent when the organizer actually picked something. On a
      // create there is nothing to clear, and on the wizard's PATCH an omitted
      // key leaves the stored contact alone — `null` would wipe it, which is
      // not what "I didn't touch this field" should mean.
      ...(contactPayload ? { contact: contactPayload } : {}),
    };

    const parsed = rideId
      ? updateRideRequestSchema.safeParse(payload)
      : createRideRequestSchema.safeParse(payload);
    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = fieldForPath(issue.path[0]);
        if (field) {
          nextErrors[field] ??= fieldErrorMessage(
            issue,
            rideFieldShapeError(issue.path[0], contact.type),
          );
        }
      }
      setFieldErrors(nextErrors);
      setFormError(null);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setOrganizerProfileRequired(false);
    setPendingIntent(intent);

    let savedId: string;
    try {
      if (rideId) {
        await updateRide(rideId, payload);
        savedId = rideId;
      } else {
        const response = await createRide(payload);
        savedId = response.ride.id;
        createdIdRef.current = savedId;
        setRideId(savedId);
        // Keeps a reload/«Назад» on this draft instead of a blank form that
        // would create a second one. Native `replaceState` (synced by the
        // App Router) — no server round trip for the page.
        window.history.replaceState(
          null,
          '',
          RIDE_WIZARD_STEPS[0]!.href(savedId),
        );
      }
    } catch (error) {
      handleSaveError(error);
      setPendingIntent(null);
      return;
    }

    setSavedAt(formatTime(new Date(), { timeZone: browserTimeZone() }));

    if (gpxFile) {
      try {
        await uploadRideGpx(savedId, gpxFile);
        setGpxFile(null);
      } catch (error) {
        setGpxError(RIDE_CREATE_TERMS.gpxUploadFailed(gpxErrorMessage(error)));
        setPendingIntent(null);
        return;
      }
    }

    if (intent === 'next') {
      router.push(wizardStepHref('route', savedId));
      return;
    }
    setPendingIntent(null);
  }

  function handleSaveError(error: unknown) {
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
        // `contact.value` → `contact`, the one visible contact input.
        const path = issue.path.split('.')[0];
        const field = fieldForPath(path);
        if (field) {
          nextErrors[field] ??= serverFieldErrorMessage(
            rideFieldShapeError(path, contact.type),
          );
        }
      }
      setFieldErrors(nextErrors);
    } else {
      setFormError(RIDE_CREATE_TERMS.loadError);
    }
  }

  if (loadState === 'loading') {
    return (
      <Card className="flex flex-col gap-6 rounded-3xl p-5 md:p-10">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full" />
      </Card>
    );
  }

  if (loadState === 'error') {
    return (
      <ErrorState
        message={RIDE_CREATE_TERMS.draftLoadError}
        onRetry={
          initialRideId ? () => void loadDraft(initialRideId) : undefined
        }
      />
    );
  }

  return (
    <Card className="rounded-3xl p-5 md:p-10">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save('next');
        }}
        noValidate
        className="flex flex-col gap-6"
      >
        <header className="flex flex-col gap-2">
          <h1 className="text-h1 text-text">{RIDE_CREATE_TERMS.stepTitle}</h1>
          <p className="max-w-2xl text-body text-text-secondary">
            {RIDE_CREATE_TERMS.stepLead}
          </p>
        </header>

        <FormField
          id="ride-title"
          label={RIDE_CREATE_TERMS.titleLabel}
          hint={RIDE_CREATE_TERMS.titleHint}
          error={fieldErrors.title}
        >
          <Input
            type="text"
            value={title}
            maxLength={140}
            onChange={(event) => setTitle(event.target.value)}
            disabled={isPending}
            className={CONTROL_CLASS}
          />
        </FormField>

        <div className="grid gap-6 md:grid-cols-2">
          <FormField
            id="ride-start-date"
            label={RIDE_CREATE_TERMS.startDateLabel}
            error={fieldErrors.startDate}
          >
            <DatePicker
              value={startDate}
              onChange={setStartDate}
              min={todayLocal}
              disabled={isPending}
            />
          </FormField>

          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-x-1.5">
              <label
                htmlFor="ride-start-time"
                className="text-body-sm font-medium text-text"
              >
                {RIDE_CREATE_TERMS.startTimeLabel}
              </label>
              <span aria-hidden="true" className="text-text-muted">
                ·
              </span>
              {/* The zone the time is entered in (ADR-012) — beside the
                  label as in the mockup («Время старта · МСК»); negative
                  margin keeps the 44px target without pushing the row. */}
              <select
                aria-label={RIDE_CREATE_TERMS.startTimezoneLabel}
                value={startTimezone}
                onChange={(event) => setStartTimezone(event.target.value)}
                disabled={isPending}
                className="-my-3 min-h-11 max-w-full cursor-pointer [field-sizing:content] rounded-lg bg-transparent text-body-sm text-text-muted hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {RUSSIAN_TIMEZONE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <Input
              id="ride-start-time"
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.startTime)}
              aria-describedby={
                fieldErrors.startTime ? 'ride-start-time-error' : undefined
              }
              className={CONTROL_CLASS}
            />
            {(fieldErrors.startTime ?? fieldErrors.startTimezone) && (
              <p
                id="ride-start-time-error"
                role="alert"
                className="text-body-sm text-danger"
              >
                {fieldErrors.startTime ?? fieldErrors.startTimezone}
              </p>
            )}
          </div>

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
              {BICYCLE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {BICYCLE_TYPE_TERMS[type]}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            id="ride-difficulty"
            label={RIDE_CREATE_TERMS.difficultyLabel}
            error={fieldErrors.difficulty}
          >
            <select
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value)}
              disabled={isPending}
              className={selectClassName(Boolean(fieldErrors.difficulty))}
            >
              <option value="">{RIDE_CREATE_TERMS.difficultyUnset}</option>
              {DIFFICULTY_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {DIFFICULTY_LEVEL_TERMS[level]}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <FormField
          id="ride-description"
          label={RIDE_CREATE_TERMS.descriptionLabel}
          hint={RIDE_CREATE_TERMS.descriptionHint}
          error={fieldErrors.description}
        >
          <Textarea
            value={description}
            rows={4}
            maxLength={2000}
            onChange={(event) => setDescription(event.target.value)}
            disabled={isPending}
            className="rounded-xl bg-bg py-3"
          />
        </FormField>

        {/* CR-165: optional — «Не указывать» is the default, so a ride with no
            contact stays the zero-effort path. */}
        <RideContactFields
          idPrefix="ride-create"
          value={contact}
          onChange={setContact}
          disabled={isPending}
          error={fieldErrors.contact}
        />

        <GpxDropzone
          id="ride-gpx"
          file={gpxFile}
          onFileChange={handleGpxChange}
          error={gpxError}
          disabled={isPending}
        />

        {organizerProfileRequired && (
          <p role="alert" className="text-body-sm text-danger">
            {RIDE_CREATE_TERMS.organizerProfileRequired}{' '}
            <Link href="/organizer/profile" className="underline">
              {RIDE_CREATE_TERMS.createOrganizerProfileLink}
            </Link>
          </p>
        )}

        {formError && !organizerProfileRequired && (
          <p role="alert" className="text-body-sm text-danger">
            {formError}
          </p>
        )}

        <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Button
              type="button"
              variant="secondary"
              isLoading={pendingIntent === 'draft'}
              disabled={isPending}
              onClick={() => void save('draft')}
            >
              {pendingIntent === 'draft'
                ? RIDE_CREATE_TERMS.saveDraftPending
                : RIDE_CREATE_TERMS.saveDraft}
            </Button>
            <p role="status" className="text-body-sm text-text-muted">
              {savedAt ? RIDE_CREATE_TERMS.draftSavedAt(savedAt) : ''}
            </p>
          </div>
          <Button
            type="submit"
            isLoading={pendingIntent === 'next'}
            disabled={isPending}
          >
            {pendingIntent === 'next'
              ? RIDE_CREATE_TERMS.nextPending
              : RIDE_CREATE_TERMS.next}
            {pendingIntent !== 'next' && (
              <ArrowRight aria-hidden="true" className="size-4" />
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}

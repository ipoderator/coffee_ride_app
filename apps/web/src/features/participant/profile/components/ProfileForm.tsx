'use client';

import { useState, type FormEvent } from 'react';
import { PROFILE_VISIBILITIES, type ProfileVisibility, type User } from 'types';
import {
  Button,
  Card,
  FormField,
  Input,
  PROFILE_TERMS,
  AUTH_TERMS,
  Textarea,
} from 'ui';
import { ApiError, updateProfile, updateProfileRequestSchema } from '../api';

interface FieldErrors {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  bio?: string;
  profileVisibility?: string;
  distanceWeekKm?: string;
  distanceMonthKm?: string;
  distanceYearKm?: string;
}

const PROFILE_VISIBILITY_LABELS: Record<ProfileVisibility, string> = {
  closed: PROFILE_TERMS.profileVisibilityClosed,
  co_participants: PROFILE_TERMS.profileVisibilityCoParticipants,
  open: PROFILE_TERMS.profileVisibilityOpen,
};

function selectClassName(hasError: boolean): string {
  return [
    'min-h-11 w-full rounded-lg border bg-bg-raised px-3 text-base text-text',
    hasError ? 'border-danger' : 'border-border-input',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    'disabled:cursor-not-allowed disabled:opacity-60',
  ].join(' ');
}

// Empty ⇒ explicit `null` (clears it), matching `distanceWeekKm`/etc.'s PATCH
// semantics — same convention as `toPatchValue` below, for a number field.
function toPatchNumber(raw: string): number | null {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? Number(trimmed) : null;
}

function numberToInputValue(value: number | null): string {
  return value === null ? '' : String(value);
}

// An empty field means "clear it" (`null`), matching `PATCH /v1/users/me`'s
// semantics for an explicit clear — the form always submits its full current
// state, not a sparse diff (`.claude/rules/frontend.md` Forms section: this
// keeps the mental model simple — "edit the form, save the form" — while
// still exercising the API's real partial-update contract underneath).
function toPatchValue(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * `/me/profile` (`docs/design.md` §8). `.claude/rules/frontend.md` Forms
 * section: runtime validation (the same Zod schema the server validates
 * with), a pending state, server-error handling, duplicate-submit
 * protection, and a real success state — same pattern as `RegisterForm`
 * (CR-011).
 */
export function ProfileForm({ initialUser }: { initialUser: User }) {
  const [firstName, setFirstName] = useState(initialUser.firstName ?? '');
  const [lastName, setLastName] = useState(initialUser.lastName ?? '');
  const [displayName, setDisplayName] = useState(initialUser.displayName ?? '');
  const [phone, setPhone] = useState(initialUser.phone ?? '');
  const [bio, setBio] = useState(initialUser.bio ?? '');
  const [profileVisibility, setProfileVisibility] = useState<ProfileVisibility>(
    initialUser.profileVisibility,
  );
  const [distanceWeekKm, setDistanceWeekKm] = useState(
    numberToInputValue(initialUser.distanceWeekKm),
  );
  const [distanceMonthKm, setDistanceMonthKm] = useState(
    numberToInputValue(initialUser.distanceMonthKm),
  );
  const [distanceYearKm, setDistanceYearKm] = useState(
    numberToInputValue(initialUser.distanceYearKm),
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Duplicate-submit protection (same reasoning as `RegisterForm`): a
    // disabled button doesn't stop an Enter-key resubmit before React
    // re-renders — this guard is the real guarantee.
    if (isPending) return;

    const payload = {
      firstName: toPatchValue(firstName),
      lastName: toPatchValue(lastName),
      displayName: toPatchValue(displayName),
      phone: toPatchValue(phone),
      bio: toPatchValue(bio),
      profileVisibility,
      distanceWeekKm: toPatchNumber(distanceWeekKm),
      distanceMonthKm: toPatchNumber(distanceMonthKm),
      distanceYearKm: toPatchNumber(distanceYearKm),
    };

    const parsed = updateProfileRequestSchema.safeParse(payload);
    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (
          field === 'firstName' ||
          field === 'lastName' ||
          field === 'displayName' ||
          field === 'phone' ||
          field === 'bio' ||
          field === 'profileVisibility' ||
          field === 'distanceWeekKm' ||
          field === 'distanceMonthKm' ||
          field === 'distanceYearKm'
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
    setSavedAt(null);
    setIsPending(true);

    try {
      const response = await updateProfile(parsed.data);
      setFirstName(response.user.firstName ?? '');
      setLastName(response.user.lastName ?? '');
      setDisplayName(response.user.displayName ?? '');
      setPhone(response.user.phone ?? '');
      setBio(response.user.bio ?? '');
      setProfileVisibility(response.user.profileVisibility);
      setDistanceWeekKm(numberToInputValue(response.user.distanceWeekKm));
      setDistanceMonthKm(numberToInputValue(response.user.distanceMonthKm));
      setDistanceYearKm(numberToInputValue(response.user.distanceYearKm));
      setSavedAt(Date.now());
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.problem.code === 'validation_error' &&
        error.problem.errors
      ) {
        const nextErrors: FieldErrors = {};
        for (const issue of error.problem.errors) {
          if (
            issue.path === 'firstName' ||
            issue.path === 'lastName' ||
            issue.path === 'displayName' ||
            issue.path === 'phone' ||
            issue.path === 'bio' ||
            issue.path === 'profileVisibility' ||
            issue.path === 'distanceWeekKm' ||
            issue.path === 'distanceMonthKm' ||
            issue.path === 'distanceYearKm'
          ) {
            nextErrors[issue.path] ??= issue.message;
          }
        }
        setFieldErrors(nextErrors);
      } else {
        setFormError(AUTH_TERMS.genericError);
      }
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <FormField
          id="profile-first-name"
          label={PROFILE_TERMS.firstNameLabel}
          error={fieldErrors.firstName}
        >
          <Input
            type="text"
            autoComplete="given-name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            disabled={isPending}
          />
        </FormField>

        <FormField
          id="profile-last-name"
          label={PROFILE_TERMS.lastNameLabel}
          hint={PROFILE_TERMS.nameHint}
          error={fieldErrors.lastName}
        >
          <Input
            type="text"
            autoComplete="family-name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            disabled={isPending}
          />
        </FormField>

        <FormField
          id="profile-display-name"
          label={PROFILE_TERMS.displayNameLabel}
          hint={PROFILE_TERMS.displayNameHint}
          error={fieldErrors.displayName}
        >
          <Input
            type="text"
            autoComplete="nickname"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            disabled={isPending}
          />
        </FormField>

        <FormField
          id="profile-phone"
          label={PROFILE_TERMS.phoneLabel}
          hint={PROFILE_TERMS.phoneHint}
          error={fieldErrors.phone}
        >
          <Input
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            disabled={isPending}
          />
        </FormField>

        <FormField
          id="profile-bio"
          label={PROFILE_TERMS.bioLabel}
          hint={PROFILE_TERMS.bioHint}
          error={fieldErrors.bio}
        >
          <Textarea
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            disabled={isPending}
          />
        </FormField>

        <FormField
          id="profile-visibility"
          label={PROFILE_TERMS.profileVisibilityLabel}
          error={fieldErrors.profileVisibility}
        >
          <select
            value={profileVisibility}
            onChange={(event) =>
              setProfileVisibility(event.target.value as ProfileVisibility)
            }
            disabled={isPending}
            className={selectClassName(Boolean(fieldErrors.profileVisibility))}
          >
            {PROFILE_VISIBILITIES.map((visibility) => (
              <option key={visibility} value={visibility}>
                {PROFILE_VISIBILITY_LABELS[visibility]}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          id="profile-distance-week"
          label={PROFILE_TERMS.distanceWeekKmLabel}
          hint={PROFILE_TERMS.distanceStatsHint}
          error={fieldErrors.distanceWeekKm}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={3000}
            value={distanceWeekKm}
            onChange={(event) => setDistanceWeekKm(event.target.value)}
            disabled={isPending}
          />
        </FormField>

        <FormField
          id="profile-distance-month"
          label={PROFILE_TERMS.distanceMonthKmLabel}
          hint={PROFILE_TERMS.distanceStatsHint}
          error={fieldErrors.distanceMonthKm}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={10000}
            value={distanceMonthKm}
            onChange={(event) => setDistanceMonthKm(event.target.value)}
            disabled={isPending}
          />
        </FormField>

        <FormField
          id="profile-distance-year"
          label={PROFILE_TERMS.distanceYearKmLabel}
          hint={PROFILE_TERMS.distanceStatsHint}
          error={fieldErrors.distanceYearKm}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={100000}
            value={distanceYearKm}
            onChange={(event) => setDistanceYearKm(event.target.value)}
            disabled={isPending}
          />
        </FormField>

        {formError && (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        )}

        {savedAt && !formError && (
          <p role="status" className="text-sm text-success">
            {PROFILE_TERMS.saveSuccess}
          </p>
        )}

        <Button type="submit" isLoading={isPending} className="self-start">
          {isPending
            ? PROFILE_TERMS.saveSubmitPending
            : PROFILE_TERMS.saveSubmit}
        </Button>
      </form>
    </Card>
  );
}

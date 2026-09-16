'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { OrganizerProfile } from 'types';
import {
  AUTH_TERMS,
  Button,
  Card,
  ErrorState,
  FormField,
  Input,
  ORGANIZER_TERMS,
  Skeleton,
  Textarea,
  formatRating,
} from 'ui';
import {
  ApiError,
  createOrganizerProfile,
  createOrganizerProfileRequestSchema,
  getOrganizerProfile,
  updateOrganizerProfile,
  updateOrganizerProfileRequestSchema,
} from '../api';

type LoadStatus = 'loading' | 'ready' | 'error';

interface FieldErrors {
  name?: string;
  description?: string;
}

// An empty description means "clear it" (`null`) on update, same convention as
// `ProfileForm`'s `toPatchValue` (CR-013) — the form always submits its full current
// state, not a sparse diff.
function toDescriptionValue(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * `/organizer/profile` (`docs/design.md` §8, CR-014). One component covers both
 * states this screen can be in: no `OrganizerProfile` yet (create) and an existing one
 * (edit) — `docs/database.md`/ADR-006: at most one per `User`. Same forms discipline as
 * `ProfileForm` (`.claude/rules/frontend.md`): runtime validation via the same Zod
 * schema the server validates with, a pending state, server-error handling,
 * duplicate-submit protection, and a real success state.
 */
export function OrganizerProfileForm() {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [profile, setProfile] = useState<OrganizerProfile | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [isPending, setIsPending] = useState(false);
  // Set explicitly at the moment a request succeeds, from *which request ran*
  // (create vs. update) — not derived from `profile` at render time, since
  // `setProfile` below already flips it to non-null on a successful create,
  // which would make a `profile`-derived message pick the wrong text.
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getOrganizerProfile()
      .then((response) => {
        if (cancelled) return;
        setProfile(response.organizerProfile);
        setRating(response.rating);
        setReviewCount(response.reviewCount);
        setName(response.organizerProfile.name);
        setDescription(response.organizerProfile.description ?? '');
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // No profile yet is an expected state for this screen, not a load
        // failure — falls through to the create form below.
        if (
          error instanceof ApiError &&
          error.problem.code === 'organizer_profile_not_found'
        ) {
          setProfile(null);
          setStatus('ready');
          return;
        }
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Duplicate-submit protection (same reasoning as `ProfileForm`): a disabled
    // button doesn't stop an Enter-key resubmit before React re-renders.
    if (isPending) return;

    const payload = {
      name: name.trim(),
      description: toDescriptionValue(description),
    };

    const schema = profile
      ? updateOrganizerProfileRequestSchema
      : createOrganizerProfileRequestSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'name' || field === 'description') {
          nextErrors[field] ??= issue.message;
        }
      }
      setFieldErrors(nextErrors);
      setFormError(null);
      return;
    }

    const wasCreate = profile === null;

    setFieldErrors({});
    setFormError(null);
    setVerificationRequired(false);
    setSuccessMessage(null);
    setIsPending(true);

    try {
      const response = wasCreate
        ? await createOrganizerProfile(
            parsed.data as { name: string; description?: string | null },
          )
        : await updateOrganizerProfile(parsed.data);
      setProfile(response.organizerProfile);
      setRating(response.rating);
      setReviewCount(response.reviewCount);
      setName(response.organizerProfile.name);
      setDescription(response.organizerProfile.description ?? '');
      setSuccessMessage(
        wasCreate ? ORGANIZER_TERMS.createSuccess : ORGANIZER_TERMS.saveSuccess,
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.problem.code === 'email_verification_required'
      ) {
        setVerificationRequired(true);
      } else if (
        error instanceof ApiError &&
        error.problem.code === 'validation_error' &&
        error.problem.errors
      ) {
        const nextErrors: FieldErrors = {};
        for (const issue of error.problem.errors) {
          if (issue.path === 'name' || issue.path === 'description') {
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

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (status === 'error') {
    return <ErrorState message={ORGANIZER_TERMS.loadError} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {profile && (
        <Card className="flex flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-[0.04em] text-text-secondary">
            {ORGANIZER_TERMS.ratingLabel}
          </p>
          {reviewCount > 0 ? (
            <p className="text-lg font-semibold text-text">
              {formatRating(rating, reviewCount)}{' '}
              <span className="text-sm font-normal text-text-secondary">
                {ORGANIZER_TERMS.ratingReviewsCount(reviewCount)}
              </span>
            </p>
          ) : (
            <p className="text-sm text-text-secondary">
              {ORGANIZER_TERMS.ratingNoReviews}
            </p>
          )}
        </Card>
      )}

      <Card>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <FormField
            id="organizer-name"
            label={ORGANIZER_TERMS.nameLabel}
            hint={ORGANIZER_TERMS.nameHint}
            error={fieldErrors.name}
          >
            <Input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={isPending}
            />
          </FormField>

          <FormField
            id="organizer-description"
            label={ORGANIZER_TERMS.descriptionLabel}
            hint={ORGANIZER_TERMS.descriptionHint}
            error={fieldErrors.description}
          >
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={isPending}
            />
          </FormField>

          {verificationRequired && (
            <p role="alert" className="text-sm text-danger">
              {ORGANIZER_TERMS.emailVerificationRequired}
            </p>
          )}

          {formError && !verificationRequired && (
            <p role="alert" className="text-sm text-danger">
              {formError}
            </p>
          )}

          {successMessage && !formError && !verificationRequired && (
            <p role="status" className="text-sm text-success">
              {successMessage}
            </p>
          )}

          <Button type="submit" isLoading={isPending} className="self-start">
            {isPending
              ? profile
                ? ORGANIZER_TERMS.saveSubmitPending
                : ORGANIZER_TERMS.createSubmitPending
              : profile
                ? ORGANIZER_TERMS.saveSubmit
                : ORGANIZER_TERMS.createSubmit}
          </Button>
        </form>
      </Card>
    </div>
  );
}

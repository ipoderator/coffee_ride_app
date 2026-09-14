'use client';

import { useState, type FormEvent } from 'react';
import type { User } from 'types';
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
  phone?: string;
  bio?: string;
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
  const [displayName, setDisplayName] = useState(initialUser.displayName ?? '');
  const [phone, setPhone] = useState(initialUser.phone ?? '');
  const [bio, setBio] = useState(initialUser.bio ?? '');
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
      displayName: toPatchValue(displayName),
      phone: toPatchValue(phone),
      bio: toPatchValue(bio),
    };

    const parsed = updateProfileRequestSchema.safeParse(payload);
    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'displayName' || field === 'phone' || field === 'bio') {
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
      setDisplayName(response.user.displayName ?? '');
      setPhone(response.user.phone ?? '');
      setBio(response.user.bio ?? '');
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
            issue.path === 'displayName' ||
            issue.path === 'phone' ||
            issue.path === 'bio'
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
          id="profile-display-name"
          label={PROFILE_TERMS.displayNameLabel}
          hint={PROFILE_TERMS.displayNameHint}
          error={fieldErrors.displayName}
        >
          <Input
            type="text"
            autoComplete="name"
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

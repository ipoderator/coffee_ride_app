'use client';

import { useState, type FormEvent } from 'react';
import { Button, Card, FORGOT_PASSWORD_TERMS, FormField, Input } from 'ui';
import {
  ApiError,
  forgotPasswordRequestSchema,
  requestPasswordReset,
} from '../api';

interface FieldErrors {
  email?: string;
}

/**
 * `/forgot-password` (CR-099, closes KI-042's screen gap). Same forms
 * discipline as `RegisterForm`/`LoginForm` (`.claude/rules/frontend.md`):
 * runtime validation, pending state, duplicate-submit protection. The
 * success state is identical regardless of whether the email exists
 * (`.claude/rules/security.md` — no account enumeration), so there is no
 * "email not found" branch to handle here, only network/validation
 * failures.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  if (succeeded) {
    return (
      <Card role="status" aria-live="polite">
        <h2 className="text-xl font-semibold text-text">
          {FORGOT_PASSWORD_TERMS.successTitle}
        </h2>
        <p className="mt-2 text-text-secondary">
          {FORGOT_PASSWORD_TERMS.successBody}
        </p>
      </Card>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    const parsed = forgotPasswordRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldErrors({ email: parsed.error.issues[0]?.message });
      setFormError(null);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setIsPending(true);

    try {
      await requestPasswordReset(parsed.data);
      setSucceeded(true);
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.problem.code === 'validation_error' &&
        error.problem.errors
      ) {
        const nextErrors: FieldErrors = {};
        for (const issue of error.problem.errors) {
          if (issue.path === 'email') nextErrors.email ??= issue.message;
        }
        setFieldErrors(nextErrors);
      } else {
        setFormError(FORGOT_PASSWORD_TERMS.genericError);
      }
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <FormField
          id="forgot-password-email"
          label={FORGOT_PASSWORD_TERMS.emailLabel}
          error={fieldErrors.email}
        >
          <Input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isPending}
          />
        </FormField>

        {formError && (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        )}

        <Button type="submit" isLoading={isPending}>
          {isPending
            ? FORGOT_PASSWORD_TERMS.submitPending
            : FORGOT_PASSWORD_TERMS.submit}
        </Button>
      </form>
    </Card>
  );
}

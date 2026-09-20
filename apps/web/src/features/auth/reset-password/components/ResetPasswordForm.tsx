'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import {
  Button,
  Card,
  ErrorState,
  FormField,
  Input,
  RESET_PASSWORD_TERMS,
} from 'ui';
import { ApiError, resetPassword, resetPasswordRequestSchema } from '../api';

interface FieldErrors {
  password?: string;
}

const TOKEN_ERROR_CODES = new Set([
  'invalid_reset_token',
  'reset_token_already_used',
  'reset_token_expired',
]);

/**
 * `/reset-password` (CR-099, closes KI-042's screen gap). Same forms
 * discipline as `RegisterForm` (`.claude/rules/frontend.md`): runtime
 * validation via the same Zod schema the server validates with, pending
 * state, duplicate-submit protection, real success state. Unlike
 * `/forgot-password`, a bad/expired token is a real, user-facing failure
 * mode here (the token is single-use and time-limited server-side) — see
 * `TOKEN_ERROR_CODES`.
 */
export function ResetPasswordForm({ token }: { token: string | null }) {
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  if (!token) {
    return <ErrorState message={RESET_PASSWORD_TERMS.missingToken} />;
  }

  if (succeeded) {
    return (
      <Card role="status" aria-live="polite">
        <h2 className="text-xl font-semibold text-text">
          {RESET_PASSWORD_TERMS.successTitle}
        </h2>
        <p className="mt-2 text-text-secondary">
          {RESET_PASSWORD_TERMS.successBody}
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
        >
          {RESET_PASSWORD_TERMS.loginLink}
        </Link>
      </Card>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    const parsed = resetPasswordRequestSchema.safeParse({
      token,
      password,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues.find(
        (candidate) => candidate.path[0] === 'password',
      );
      setFieldErrors({ password: issue?.message });
      setFormError(null);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setIsPending(true);

    try {
      await resetPassword(parsed.data);
      setSucceeded(true);
    } catch (error) {
      if (
        error instanceof ApiError &&
        TOKEN_ERROR_CODES.has(error.problem.code ?? '')
      ) {
        setFormError(RESET_PASSWORD_TERMS.invalidOrExpired);
      } else if (
        error instanceof ApiError &&
        error.problem.code === 'validation_error' &&
        error.problem.errors
      ) {
        const nextErrors: FieldErrors = {};
        for (const issue of error.problem.errors) {
          if (issue.path === 'password') nextErrors.password ??= issue.message;
        }
        setFieldErrors(nextErrors);
      } else {
        setFormError(RESET_PASSWORD_TERMS.genericError);
      }
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <FormField
          id="reset-password-password"
          label={RESET_PASSWORD_TERMS.passwordLabel}
          hint={RESET_PASSWORD_TERMS.passwordHint}
          error={fieldErrors.password}
        >
          <Input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
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
            ? RESET_PASSWORD_TERMS.submitPending
            : RESET_PASSWORD_TERMS.submit}
        </Button>
      </form>
    </Card>
  );
}

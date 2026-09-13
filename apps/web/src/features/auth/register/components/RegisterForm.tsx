'use client';

import { useState, type FormEvent } from 'react';
import { AUTH_TERMS, Button, Card, FormField, Input } from 'ui';
import { ApiError, registerAccount, registerRequestSchema } from '../api';

interface FieldErrors {
  email?: string;
  password?: string;
}

/**
 * `.claude/rules/frontend.md` Forms section: runtime validation (client, via
 * the same Zod schema the server validates with — `packages/types`), a
 * pending state, server-error handling, duplicate-submit protection, and a
 * real success state. `docs/design.md` §10: this is the form's loading/error/
 * success set — there is no "empty"/"degraded" state for a create-account form.
 */
export function RegisterForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [verificationUrl, setVerificationUrl] = useState<string | undefined>();
  const [succeeded, setSucceeded] = useState(false);

  if (succeeded) {
    return (
      <Card role="status" aria-live="polite">
        <h2 className="text-xl font-semibold text-text">
          {AUTH_TERMS.registerSuccessTitle}
        </h2>
        <p className="mt-2 text-text-secondary">
          {AUTH_TERMS.registerSuccessBody}
        </p>
        {verificationUrl && (
          <p className="mt-4 rounded-lg border border-border bg-bg p-3 font-mono text-sm break-all text-text-secondary">
            {AUTH_TERMS.registerSuccessDevNote} {verificationUrl}
          </p>
        )}
      </Card>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Duplicate-submit protection: the button is also disabled while pending,
    // but a form can still receive a second submit (e.g. Enter key) before
    // React re-renders — this guard is the actual guarantee.
    if (isPending) return;

    const parsed = registerRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'email' || field === 'password') {
          nextErrors[field] ??= issue.message;
        }
      }
      setFieldErrors(nextErrors);
      setFormError(null);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setIsPending(true);

    try {
      const response = await registerAccount(parsed.data);
      setVerificationUrl(response.verificationUrl);
      setSucceeded(true);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.problem.code === 'email_already_registered') {
          setFieldErrors({ email: AUTH_TERMS.emailAlreadyRegistered });
        } else if (
          error.problem.code === 'validation_error' &&
          error.problem.errors
        ) {
          const nextErrors: FieldErrors = {};
          for (const issue of error.problem.errors) {
            if (issue.path === 'email' || issue.path === 'password') {
              nextErrors[issue.path] ??= issue.message;
            }
          }
          setFieldErrors(nextErrors);
        } else {
          setFormError(AUTH_TERMS.genericError);
        }
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
          id="register-email"
          label={AUTH_TERMS.emailLabel}
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

        <FormField
          id="register-password"
          label={AUTH_TERMS.passwordLabel}
          hint={AUTH_TERMS.passwordHint}
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
            ? AUTH_TERMS.registerSubmitPending
            : AUTH_TERMS.registerSubmit}
        </Button>
      </form>
    </Card>
  );
}

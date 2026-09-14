'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AUTH_TERMS, Button, Card, FormField, Input } from 'ui';
import { ApiError, login, loginRequestSchema } from '../api';

interface FieldErrors {
  email?: string;
  password?: string;
}

/**
 * `.claude/rules/frontend.md` Forms section, same shape as `RegisterForm`
 * (CR-011): runtime validation, pending state, server-error handling,
 * duplicate-submit protection. `.claude/rules/security.md`: a wrong
 * password and an unknown email both render the exact same generic message
 * — this form never learns (or shows) which case it was, only the API does
 * that server-side (`invalid_credentials`, identical body either way).
 */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isPending) return;

    const parsed = loginRequestSchema.safeParse({ email, password });
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
      await login(parsed.data);
      router.replace('/me');
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.problem.code === 'invalid_credentials') {
          // Deliberately a form-level error, not attached to either field —
          // pointing at "email" or "password" specifically would itself leak
          // which one was wrong (`.claude/rules/security.md`).
          setFormError(AUTH_TERMS.invalidCredentials);
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
      // Only reached on failure — a successful submit navigates away instead.
      setIsPending(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <FormField
          id="login-email"
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
          id="login-password"
          label={AUTH_TERMS.passwordLabel}
          error={fieldErrors.password}
        >
          <Input
            type="password"
            autoComplete="current-password"
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
          {isPending ? AUTH_TERMS.loginSubmitPending : AUTH_TERMS.loginSubmit}
        </Button>
      </form>
    </Card>
  );
}

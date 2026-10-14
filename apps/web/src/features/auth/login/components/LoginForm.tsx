'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AUTH_TERMS, Button, Card, FormField, Input } from 'ui';
import {
  DEFAULT_AFTER_LOGIN,
  registerHref,
  safeNextPath,
} from '@/lib/auth/next-path';
import { useSession } from '@/lib/auth/session-context';
import { ApiError, login, loginRequestSchema } from '../api';
import {
  fieldErrorMessage,
  serverFieldErrorMessage,
} from '@/lib/forms/field-errors';
import { RecaptchaField } from '../../captcha/components/RecaptchaField';
import { RECAPTCHA_SITE_KEY, useCaptcha } from '../../captcha/use-captcha';

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
 *
 * CR-141: `next` (the page already validated it; re-checked right before
 * navigating) is where a successful sign-in returns to, `/me` otherwise.
 *
 * CR-261 (ADR-038): the reCAPTCHA tick when a site key is configured. A CAPTCHA
 * refusal is checked before the credentials, so it reads the same for any account.
 */
export function LoginForm({
  next = null,
  captchaSiteKey = RECAPTCHA_SITE_KEY,
}: { next?: string | null; captchaSiteKey?: string | null } = {}) {
  const router = useRouter();
  const { refresh } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const captcha = useCaptcha(captchaSiteKey);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isPending) return;

    const parsed = loginRequestSchema.safeParse({ email, password });
    const captchaPassed = captcha.check();
    if (!parsed.success || !captchaPassed) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error?.issues ?? []) {
        const field = issue.path[0];
        if (field === 'email' || field === 'password') {
          nextErrors[field] ??= fieldErrorMessage(issue);
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
      await login({ ...parsed.data, ...captcha.payload() });
      refresh();
      router.replace(safeNextPath(next) ?? DEFAULT_AFTER_LOGIN);
    } catch (error) {
      const code = error instanceof ApiError ? error.problem.code : undefined;
      if (captcha.afterFailure(code)) {
        // The CAPTCHA field shows the API's refusal.
      } else if (error instanceof ApiError) {
        if (error.problem.code === 'invalid_credentials') {
          // Deliberately a form-level error, not attached to either field —
          // pointing at "email" or "password" specifically would itself leak
          // which one was wrong (`.claude/rules/security.md`).
          setFormError(AUTH_TERMS.invalidCredentials);
        } else if (error.problem.code === 'account_blocked') {
          // CR-231 (ADR-032): the API says so only after the password
          // verified, so naming the block leaks nothing to a stranger.
          setFormError(AUTH_TERMS.accountBlocked);
        } else if (
          error.problem.code === 'validation_error' &&
          error.problem.errors
        ) {
          const nextErrors: FieldErrors = {};
          for (const issue of error.problem.errors) {
            if (issue.path === 'email' || issue.path === 'password') {
              nextErrors[issue.path] ??= serverFieldErrorMessage();
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

        {captcha.siteKey && (
          <RecaptchaField
            id="login-captcha"
            siteKey={captcha.siteKey}
            {...captcha.fieldProps}
          />
        )}

        {formError && (
          <p role="alert" className="text-body-sm text-danger">
            {formError}
          </p>
        )}

        <Button type="submit" isLoading={isPending}>
          {isPending ? AUTH_TERMS.loginSubmitPending : AUTH_TERMS.loginSubmit}
        </Button>

        <div className="flex flex-col items-start text-body-sm">
          <Link
            href="/forgot-password"
            className="inline-flex min-h-11 items-center text-primary hover:underline"
          >
            {AUTH_TERMS.forgotPasswordLink}
          </Link>
          <Link
            href={registerHref(next)}
            className="inline-flex min-h-11 items-center text-primary hover:underline"
          >
            {AUTH_TERMS.registerLink}
          </Link>
        </div>
      </form>
    </Card>
  );
}

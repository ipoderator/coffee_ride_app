'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import {
  AUTH_TERMS,
  Button,
  Card,
  FormField,
  Input,
  VALIDATION_TERMS,
} from 'ui';
import { loginHref, safeNextPath, verifyEmailHref } from '@/lib/auth/next-path';
import { ApiError, registerAccount, registerRequestSchema } from '../api';
import {
  fieldErrorMessage,
  serverFieldErrorMessage,
} from '@/lib/forms/field-errors';
import { RecaptchaField } from '../../captcha/components/RecaptchaField';
import { RECAPTCHA_SITE_KEY, useCaptcha } from '../../captcha/use-captcha';

interface FieldErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
}

/**
 * The API's dev-only `verificationUrl` is the raw endpoint path
 * (`/v1/auth/verify-email?token=...`, a POST-only route — see
 * `auth.routes.ts`), not something a browser can navigate to. Extracts just
 * the token and points at the real `/verify-email` web page (CR-099) instead
 * of rendering the API path as if it were a clickable link. CR-197: `next`
 * goes along, so the verified page's «Перейти ко входу» still returns there.
 */
function toVerifyEmailWebPath(
  verificationUrl: string,
  next: string | null,
): string | null {
  const token = new URL(verificationUrl, 'http://localhost').searchParams.get(
    'token',
  );
  return token ? verifyEmailHref(token, next) : null;
}

/**
 * `.claude/rules/frontend.md` Forms section: runtime validation (client, via
 * the same Zod schema the server validates with — `packages/types`), a
 * pending state, server-error handling, duplicate-submit protection, and a
 * real success state. `docs/design.md` §10: this is the form's loading/error/
 * success set — there is no "empty"/"degraded" state for a create-account form.
 *
 * CR-141: registering doesn't sign in, so `next` (a return target, e.g. the
 * ride that sent the visitor here) is only handed on to `/login` — directly,
 * and through `/verify-email` (CR-197).
 *
 * CR-261: «Повторите пароль» is checked here, before sending, and never leaves the
 * browser — the API gets `password` only. The reCAPTCHA tick (ADR-038) is asked for
 * when a site key is configured; `captchaSiteKey` exists for stories and tests.
 */
export function RegisterForm({
  next = null,
  captchaSiteKey = RECAPTCHA_SITE_KEY,
}: { next?: string | null; captchaSiteKey?: string | null } = {}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const captcha = useCaptcha(captchaSiteKey);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [verificationUrl, setVerificationUrl] = useState<string | undefined>();
  const [emailVerified, setEmailVerified] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  if (succeeded) {
    const verifyEmailPath = verificationUrl
      ? toVerifyEmailWebPath(verificationUrl, next)
      : null;

    return (
      <Card role="status" aria-live="polite">
        <h2 className="text-h2 text-text">{AUTH_TERMS.registerSuccessTitle}</h2>
        <p className="mt-2 text-text-secondary">
          {emailVerified
            ? AUTH_TERMS.registerSuccessBodyVerified
            : AUTH_TERMS.registerSuccessBody}
        </p>
        {verifyEmailPath && (
          <p className="mt-4 rounded-lg border border-border bg-surface p-3 text-body-sm text-text-secondary">
            {AUTH_TERMS.registerSuccessDevNote}{' '}
            <Link
              href={verifyEmailPath}
              className="font-mono break-all text-primary hover:underline"
            >
              {verifyEmailPath}
            </Link>
          </p>
        )}
        <Link
          href={loginHref(next)}
          className="mt-4 inline-flex min-h-11 items-center text-body-sm font-medium text-primary hover:underline"
        >
          {AUTH_TERMS.registerSuccessLoginLink}
        </Link>
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
    const nextErrors: FieldErrors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'email' || field === 'password') {
          nextErrors[field] ??= fieldErrorMessage(issue);
        }
      }
    }
    if (confirmPassword === '') {
      nextErrors.confirmPassword = VALIDATION_TERMS.required;
    } else if (confirmPassword !== password) {
      nextErrors.confirmPassword = AUTH_TERMS.passwordsMismatch;
    }
    const captchaPassed = captcha.check();
    if (
      !parsed.success ||
      Object.keys(nextErrors).length > 0 ||
      !captchaPassed
    ) {
      setFieldErrors(nextErrors);
      setFormError(null);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setIsPending(true);

    try {
      // CR-244 (KI-089): the API appends `next` to the emailed link too.
      const safeNext = safeNextPath(next);
      // Only the schema's fields — never `confirmPassword`.
      const response = await registerAccount({
        ...parsed.data,
        ...(safeNext ? { next: safeNext } : {}),
        ...captcha.payload(),
      });
      setVerificationUrl(response.verificationUrl);
      setEmailVerified(response.user.emailVerified);
      setSucceeded(true);
    } catch (error) {
      const code = error instanceof ApiError ? error.problem.code : undefined;
      if (captcha.afterFailure(code)) {
        // The CAPTCHA field shows the API's refusal.
      } else if (error instanceof ApiError) {
        if (error.problem.code === 'email_already_registered') {
          setFieldErrors({ email: AUTH_TERMS.emailAlreadyRegistered });
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

        <FormField
          id="register-confirm-password"
          label={AUTH_TERMS.confirmPasswordLabel}
          error={fieldErrors.confirmPassword}
        >
          <Input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            disabled={isPending}
          />
        </FormField>

        {captcha.siteKey && (
          <RecaptchaField
            id="register-captcha"
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
          {isPending
            ? AUTH_TERMS.registerSubmitPending
            : AUTH_TERMS.registerSubmit}
        </Button>

        <Link
          href={loginHref(next)}
          className="inline-flex min-h-11 items-center text-body-sm text-primary hover:underline"
        >
          {AUTH_TERMS.loginLink}
        </Link>
      </form>
    </Card>
  );
}

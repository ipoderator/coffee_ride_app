'use client';

import { useState, type FormEvent } from 'react';
import { Button, Card, FORGOT_PASSWORD_TERMS, FormField, Input } from 'ui';
import {
  ApiError,
  forgotPasswordRequestSchema,
  requestPasswordReset,
} from '../api';
import {
  fieldErrorMessage,
  serverFieldErrorMessage,
} from '@/lib/forms/field-errors';
import { RecaptchaField } from '../../captcha/components/RecaptchaField';
import { RECAPTCHA_SITE_KEY, useCaptcha } from '../../captcha/use-captcha';

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
 * failures. CR-261 (ADR-038): plus the reCAPTCHA tick when a site key is
 * configured — every request here can send an email.
 */
export function ForgotPasswordForm({
  captchaSiteKey = RECAPTCHA_SITE_KEY,
}: { captchaSiteKey?: string | null } = {}) {
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const captcha = useCaptcha(captchaSiteKey);

  if (succeeded) {
    return (
      <Card role="status" aria-live="polite">
        <h2 className="text-h2 text-text">
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
    const captchaPassed = captcha.check();
    if (!parsed.success || !captchaPassed) {
      const issue = parsed.error?.issues[0];
      setFieldErrors({ email: issue && fieldErrorMessage(issue) });
      setFormError(null);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setIsPending(true);

    try {
      await requestPasswordReset({ ...parsed.data, ...captcha.payload() });
      setSucceeded(true);
    } catch (error) {
      const code = error instanceof ApiError ? error.problem.code : undefined;
      if (captcha.afterFailure(code)) {
        // The CAPTCHA field shows the API's refusal.
      } else if (
        error instanceof ApiError &&
        error.problem.code === 'validation_error' &&
        error.problem.errors
      ) {
        const nextErrors: FieldErrors = {};
        for (const issue of error.problem.errors) {
          if (issue.path === 'email') {
            nextErrors.email ??= serverFieldErrorMessage();
          }
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

        {captcha.siteKey && (
          <RecaptchaField
            id="forgot-password-captcha"
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
            ? FORGOT_PASSWORD_TERMS.submitPending
            : FORGOT_PASSWORD_TERMS.submit}
        </Button>
      </form>
    </Card>
  );
}

'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { CONSENT_DOCUMENT_TYPES, type LegalConsents } from 'types';
import {
  AUTH_TERMS,
  Button,
  Card,
  FormField,
  Input,
  PasswordInput,
  VALIDATION_TERMS,
} from 'ui';
import {
  allConsentsGiven,
  consentErrorMessage,
  consentPayload,
  LegalConsentFields,
  type ConsentState,
} from '@/components/legal/LegalConsentFields';
import { loginHref, safeNextPath, verifyEmailHref } from '@/lib/auth/next-path';
import { ApiError, registerAccount, registerRequestSchema } from '../api';
import {
  fieldErrorMessage,
  serverFieldErrorMessage,
} from '@/lib/forms/field-errors';
import { RecaptchaField } from '../../captcha/components/RecaptchaField';
import { RECAPTCHA_SITE_KEY, useCaptcha } from '../../captcha/use-captcha';
import { PasswordMatch } from '../../password/components/PasswordMatch';
import { PasswordStrengthMeter } from '../../password/components/PasswordStrengthMeter';

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
 * CR-261: «Повторите пароль» is checked here before sending. CR-262 (ADR-039): it is
 * sent as `confirmPassword` too, and the API refuses a mismatch with the same rule.
 * The reCAPTCHA tick (ADR-038) is asked for when a site key is configured;
 * `captchaSiteKey` exists for stories and tests.
 *
 * CR-262: the success card is the same whether the email was new or already had
 * an account — the API no longer says which (ADR-039), and neither does this.
 * Laid out for the auth mockup: no card around the form, a strength meter under
 * «Пароль» and a live match line under «Повторите пароль»; the page renders the
 * «Уже есть аккаунт?» line.
 *
 * CR-269 (ADR-041): two separate, unticked consents — the terms and the processing
 * of personal data — above the reCAPTCHA check; «Создать аккаунт» stays disabled
 * until both are ticked, and the API refuses a request without them anyway.
 */
export function RegisterForm({
  next = null,
  captchaSiteKey = RECAPTCHA_SITE_KEY,
}: { next?: string | null; captchaSiteKey?: string | null } = {}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [consents, setConsents] = useState<ConsentState>({});
  const [consentError, setConsentError] = useState<string | null>(null);
  const consentsGiven = allConsentsGiven(CONSENT_DOCUMENT_TYPES, consents);
  const captcha = useCaptcha(captchaSiteKey);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [verificationUrl, setVerificationUrl] = useState<string | undefined>();
  const [verificationRequired, setVerificationRequired] = useState(true);
  // The address the success card names — the one actually sent.
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  if (submittedEmail !== null) {
    const verifyEmailPath = verificationUrl
      ? toVerifyEmailWebPath(verificationUrl, next)
      : null;

    return (
      <Card role="status" aria-live="polite">
        <h2 className="text-h2 text-text">
          {verificationRequired
            ? AUTH_TERMS.registerSuccessTitle
            : AUTH_TERMS.registerSuccessTitleVerified}
        </h2>
        <p className="mt-2 text-text-secondary">
          {verificationRequired
            ? AUTH_TERMS.registerSuccessBody(submittedEmail)
            : AUTH_TERMS.registerSuccessBodyVerified}
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

  // The submit-time «Пароли не совпадают.» describes the values at that submit;
  // once either field changes it is stale, and the live match line takes over.
  function clearConfirmError() {
    setFieldErrors((current) =>
      current.confirmPassword
        ? { ...current, confirmPassword: undefined }
        : current,
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Duplicate-submit protection: the button is also disabled while pending,
    // but a form can still receive a second submit (e.g. Enter key) before
    // React re-renders — this guard is the actual guarantee.
    if (isPending || !consentsGiven) return;

    const parsed = registerRequestSchema.safeParse({
      email,
      password,
      consents: consentPayload(CONSENT_DOCUMENT_TYPES) as LegalConsents,
    });
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
    setConsentError(null);
    setIsPending(true);

    try {
      // CR-244 (KI-089): the API appends `next` to the emailed link too.
      const safeNext = safeNextPath(next);
      // CR-262 (ADR-039): `confirmPassword` goes too — the API checks it again.
      const response = await registerAccount({
        ...parsed.data,
        confirmPassword,
        ...(safeNext ? { next: safeNext } : {}),
        ...captcha.payload(),
      });
      setVerificationUrl(response.verificationUrl);
      setVerificationRequired(response.emailVerificationRequired);
      setSubmittedEmail(parsed.data.email);
    } catch (error) {
      const code = error instanceof ApiError ? error.problem.code : undefined;
      const consentMessage =
        error instanceof ApiError ? consentErrorMessage(error.problem) : null;
      if (captcha.afterFailure(code)) {
        // The CAPTCHA field shows the API's refusal.
      } else if (consentMessage) {
        setConsentError(consentMessage);
      } else if (error instanceof ApiError) {
        if (error.problem.code === 'validation_error' && error.problem.errors) {
          const nextErrors: FieldErrors = {};
          for (const issue of error.problem.errors) {
            if (issue.path === 'email' || issue.path === 'password') {
              nextErrors[issue.path] ??= serverFieldErrorMessage();
            } else if (issue.path === 'confirmPassword') {
              nextErrors.confirmPassword ??= AUTH_TERMS.passwordsMismatch;
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
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <FormField
        id="register-email"
        label={AUTH_TERMS.emailLabel}
        error={fieldErrors.email}
      >
        <Input
          type="email"
          autoComplete="email"
          placeholder={AUTH_TERMS.emailPlaceholder}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={isPending}
        />
      </FormField>

      <div className="flex flex-col gap-2">
        <FormField
          id="register-password"
          label={AUTH_TERMS.passwordLabel}
          hint={AUTH_TERMS.passwordHint}
          error={fieldErrors.password}
        >
          <PasswordInput
            autoComplete="new-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              clearConfirmError();
            }}
            disabled={isPending}
          />
        </FormField>
        <PasswordStrengthMeter password={password} />
      </div>

      <div className="flex flex-col gap-2">
        <FormField
          id="register-confirm-password"
          label={AUTH_TERMS.confirmPasswordLabel}
          error={fieldErrors.confirmPassword}
        >
          <PasswordInput
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              clearConfirmError();
            }}
            disabled={isPending}
          />
        </FormField>
        {!fieldErrors.confirmPassword && (
          <PasswordMatch
            password={password}
            confirmPassword={confirmPassword}
          />
        )}
      </div>

      <LegalConsentFields
        idPrefix="register"
        documents={CONSENT_DOCUMENT_TYPES}
        value={consents}
        onChange={(document, checked) => {
          setConsents((current) => ({ ...current, [document]: checked }));
          setConsentError(null);
        }}
        disabled={isPending}
        error={consentError}
      />

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

      <Button
        type="submit"
        isLoading={isPending}
        disabled={!consentsGiven}
        className="w-full"
      >
        {isPending
          ? AUTH_TERMS.registerSubmitPending
          : AUTH_TERMS.registerSubmit}
      </Button>
    </form>
  );
}

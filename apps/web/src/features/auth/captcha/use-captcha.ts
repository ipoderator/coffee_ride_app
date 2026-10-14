'use client';

import { useCallback, useRef, useState } from 'react';
import { isCaptchaErrorCode } from 'types';
import { CAPTCHA_TERMS } from 'ui';
import type { RecaptchaHandle } from './components/RecaptchaField';

// Baked into the browser bundle at build time (`apps/web/Dockerfile`); a public
// key by design. Unset → no widget and no token: the API then has to run without
// `RECAPTCHA_SECRET_KEY` too (local dev, tests) — the two are set together.
// A literal `process.env.NEXT_PUBLIC_…` member, the only form Next inlines.
export const RECAPTCHA_SITE_KEY =
  process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || null;

/**
 * CR-261 (ADR-038): the reCAPTCHA state one auth form keeps — the token, the
 * field's message and the widget handle — plus the three moments a form touches
 * it: before sending (`check`), the body (`payload`), and after a failed answer
 * (`afterFailure`: the token is spent either way, so the tick is always reset).
 */
export function useCaptcha(siteKey: string | null) {
  const ref = useRef<RecaptchaHandle>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();

  const onTokenChange = useCallback((next: string | null) => {
    setToken(next);
    if (next) setError(undefined);
  }, []);

  return {
    siteKey,
    fieldProps: { ref, error, onTokenChange },
    /** `false`, with the field's message set, when the tick is still missing. */
    check(): boolean {
      if (siteKey && !token) {
        setError(CAPTCHA_TERMS.required);
        return false;
      }
      return true;
    },
    payload(): { captchaToken?: string } {
      return siteKey && token ? { captchaToken: token } : {};
    },
    /** `true` when the API refused the CAPTCHA itself (the field shows why). */
    afterFailure(code: string | undefined): boolean {
      if (siteKey) ref.current?.reset();
      if (isCaptchaErrorCode(code)) {
        setError(CAPTCHA_TERMS.apiError[code]);
        return true;
      }
      return false;
    },
  };
}

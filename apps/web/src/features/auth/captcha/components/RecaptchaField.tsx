'use client';

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from 'react';
import { CAPTCHA_TERMS } from 'ui';
import { loadRecaptcha } from '../load-recaptcha';

export interface RecaptchaHandle {
  /** Clears the tick and the token — a token is good for one server check. */
  reset(): void;
}

// The widget is 304 px wide; narrower than that (a 320 px phone inside a card)
// it gets Google's compact layout instead of overflowing.
const NORMAL_WIDGET_WIDTH = 304;

/**
 * CR-261 (ADR-038): Google's reCAPTCHA v2 «Я не робот» checkbox as a form field.
 * Reports the token through `onTokenChange` (`null` once it expires or is reset);
 * the form sends it, the API checks it with Google. `error` is the form's message
 * (missing tick, an API refusal); without one, the field shows its own when the
 * tick expires or the script can't load. Rendered into a fresh child element per
 * effect run, so a remount (Strict Mode, a re-shown form) never renders twice into
 * one element, which Google refuses.
 */
export function RecaptchaField({
  id,
  siteKey,
  error,
  onTokenChange,
  ref,
}: {
  id: string;
  siteKey: string;
  error?: string;
  onTokenChange: (token: string | null) => void;
  ref?: Ref<RecaptchaHandle>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<number | null>(null);
  const onTokenChangeRef = useRef(onTokenChange);
  const [status, setStatus] = useState<'expired' | 'load-failed' | null>(null);

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
  }, [onTokenChange]);

  useImperativeHandle(ref, () => ({
    reset() {
      if (widgetIdRef.current !== null) {
        window.grecaptcha?.reset(widgetIdRef.current);
      }
      onTokenChangeRef.current(null);
      setStatus(null);
    },
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    const host = document.createElement('div');
    container.appendChild(host);

    loadRecaptcha()
      .then((grecaptcha) => {
        if (cancelled) return;
        widgetIdRef.current = grecaptcha.render(host, {
          sitekey: siteKey,
          theme: document.documentElement.classList.contains('dark')
            ? 'dark'
            : 'light',
          size:
            container.clientWidth > 0 &&
            container.clientWidth < NORMAL_WIDGET_WIDTH
              ? 'compact'
              : 'normal',
          callback: (token) => {
            setStatus(null);
            onTokenChangeRef.current(token);
          },
          'expired-callback': () => {
            setStatus('expired');
            onTokenChangeRef.current(null);
          },
          'error-callback': () => {
            setStatus('load-failed');
            onTokenChangeRef.current(null);
          },
        });
      })
      .catch(() => {
        if (!cancelled) setStatus('load-failed');
      });

    return () => {
      cancelled = true;
      widgetIdRef.current = null;
      host.remove();
    };
  }, [siteKey]);

  const message =
    error ??
    (status === 'expired'
      ? CAPTCHA_TERMS.expired
      : status === 'load-failed'
        ? CAPTCHA_TERMS.loadFailed
        : undefined);
  const labelId = `${id}-label`;
  const errorId = `${id}-error`;

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={message ? errorId : undefined}
      className="flex flex-col gap-1.5"
    >
      <span id={labelId} className="sr-only">
        {CAPTCHA_TERMS.label}
      </span>
      <div ref={containerRef} data-testid={`${id}-widget`} />
      {message && (
        <p id={errorId} role="alert" className="text-body-sm text-danger">
          {message}
        </p>
      )}
    </div>
  );
}

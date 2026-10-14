// CR-261 (ADR-038): loads Google's reCAPTCHA v2 script once per page, in explicit
// render mode with Russian labels. Appended with `createElement` by our own
// (nonce-trusted) code, so the page CSP's `'strict-dynamic'` lets it and the
// scripts it pulls from gstatic run (ADR-036); `lib/security/headers.ts` lists
// Google's reCAPTCHA hosts for the fallback and its frames.

export const RECAPTCHA_SCRIPT_URL = 'https://www.google.com/recaptcha/api.js';
const ONLOAD_CALLBACK = '__coffeeRideRecaptchaOnload';

export interface RecaptchaRenderOptions {
  sitekey: string;
  theme: 'light' | 'dark';
  size: 'normal' | 'compact';
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
}

/** The part of Google's `grecaptcha` global this app uses. */
export interface Grecaptcha {
  render(container: HTMLElement, options: RecaptchaRenderOptions): number;
  reset(widgetId?: number): void;
}

declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
    [ONLOAD_CALLBACK]?: () => void;
  }
}

let loading: Promise<Grecaptcha> | null = null;

export function loadRecaptcha(): Promise<Grecaptcha> {
  if (loading) return loading;
  // Already on the page (a test or story stub, or a script loaded elsewhere).
  if (typeof window.grecaptcha?.render === 'function') {
    return Promise.resolve(window.grecaptcha);
  }

  loading = new Promise<Grecaptcha>((resolve, reject) => {
    window[ONLOAD_CALLBACK] = () => {
      if (window.grecaptcha) resolve(window.grecaptcha);
      else reject(new Error('reCAPTCHA loaded without grecaptcha'));
    };
    const script = document.createElement('script');
    script.src = `${RECAPTCHA_SCRIPT_URL}?onload=${ONLOAD_CALLBACK}&render=explicit&hl=ru`;
    script.async = true;
    script.onerror = () => {
      // A later mount (or a page reload) may try again.
      loading = null;
      script.remove();
      reject(new Error('reCAPTCHA script failed to load'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** Test-only: forget a previous load. */
export function resetRecaptchaLoaderForTests() {
  loading = null;
}

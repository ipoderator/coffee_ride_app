import { act } from '@testing-library/react';
import { vi } from 'vitest';
import {
  resetRecaptchaLoaderForTests,
  type Grecaptcha,
  type RecaptchaRenderOptions,
} from './load-recaptcha';

/**
 * Test-only stand-in for Google's `grecaptcha` (CR-261): `RecaptchaField` finds it
 * on `window` and never loads the real script. `solve`/`expire`/`fail` play the
 * widget's callbacks on the most recently rendered widget.
 */
export function installFakeGrecaptcha() {
  const widgets: RecaptchaRenderOptions[] = [];
  const grecaptcha = {
    render: vi.fn<Grecaptcha['render']>((_container, options) => {
      widgets.push(options);
      return widgets.length - 1;
    }),
    reset: vi.fn<Grecaptcha['reset']>(),
  };
  resetRecaptchaLoaderForTests();
  window.grecaptcha = grecaptcha;

  const latest = () => {
    const widget = widgets.at(-1);
    if (!widget) throw new Error('No reCAPTCHA widget rendered yet');
    return widget;
  };

  return {
    grecaptcha,
    widgets,
    solve(token = 'solved-token') {
      act(() => latest().callback(token));
    },
    expire() {
      act(() => latest()['expired-callback']());
    },
    fail() {
      act(() => latest()['error-callback']());
    },
    uninstall() {
      delete window.grecaptcha;
      resetRecaptchaLoaderForTests();
    },
  };
}

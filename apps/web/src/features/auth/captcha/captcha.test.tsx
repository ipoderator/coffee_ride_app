import { createRef, StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAPTCHA_TERMS } from 'ui';
import {
  RecaptchaField,
  type RecaptchaHandle,
} from './components/RecaptchaField';
import { installFakeGrecaptcha } from './fake-grecaptcha';
import {
  loadRecaptcha,
  RECAPTCHA_SCRIPT_URL,
  resetRecaptchaLoaderForTests,
} from './load-recaptcha';

// CR-261 (ADR-038): the widget wrapper and the script loader on their own.

afterEach(() => {
  delete window.grecaptcha;
  resetRecaptchaLoaderForTests();
  document.head
    .querySelectorAll(`script[src^="${RECAPTCHA_SCRIPT_URL}"]`)
    .forEach((script) => script.remove());
  document.documentElement.classList.remove('dark');
});

function googleScripts() {
  return document.head.querySelectorAll<HTMLScriptElement>(
    `script[src^="${RECAPTCHA_SCRIPT_URL}"]`,
  );
}

describe('loadRecaptcha', () => {
  it('adds Google’s script once, explicit render and Russian, and resolves on its onload', async () => {
    const first = loadRecaptcha();
    const second = loadRecaptcha();
    expect(second).toBe(first);
    expect(googleScripts()).toHaveLength(1);
    const src = new URL(googleScripts()[0]!.src);
    expect(src.searchParams.get('render')).toBe('explicit');
    expect(src.searchParams.get('hl')).toBe('ru');
    const onload = src.searchParams.get('onload')!;

    const grecaptcha = { render: vi.fn(), reset: vi.fn() };
    window.grecaptcha = grecaptcha;
    (window as unknown as Record<string, () => void>)[onload]!();
    await expect(first).resolves.toBe(grecaptcha);
  });

  it('rejects when the script cannot load, and tries again next time', async () => {
    const first = loadRecaptcha();
    googleScripts()[0]!.dispatchEvent(new Event('error'));
    await expect(first).rejects.toThrow(/failed to load/);
    expect(googleScripts()).toHaveLength(0);

    void loadRecaptcha().catch(() => {});
    expect(googleScripts()).toHaveLength(1);
  });
});

describe('RecaptchaField', () => {
  it('shows the load failure when Google’s script is unreachable', async () => {
    render(<RecaptchaField id="c" siteKey="k" onTokenChange={() => {}} />);
    act(() => {
      googleScripts()[0]!.dispatchEvent(new Event('error'));
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      CAPTCHA_TERMS.loadFailed,
    );
    expect(screen.getByRole('group')).toHaveAttribute(
      'aria-describedby',
      'c-error',
    );
  });

  it('renders once under Strict Mode’s double mount, in the page’s dark theme', async () => {
    document.documentElement.classList.add('dark');
    const fake = installFakeGrecaptcha();
    render(
      <StrictMode>
        <RecaptchaField id="c" siteKey="k" onTokenChange={() => {}} />
      </StrictMode>,
    );
    await waitFor(() => expect(fake.grecaptcha.render).toHaveBeenCalled());
    // Each mount renders into its own host; the first one's is removed.
    const widget = screen.getByTestId('c-widget');
    await waitFor(() => expect(widget.children).toHaveLength(1));
    expect(fake.widgets.at(-1)).toMatchObject({ theme: 'dark' });
  });

  it('switches to the compact widget when its box is narrower than 304 px', async () => {
    const fake = installFakeGrecaptcha();
    const width = vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockReturnValue(240);
    try {
      render(<RecaptchaField id="c" siteKey="k" onTokenChange={() => {}} />);
      await waitFor(() => expect(fake.grecaptcha.render).toHaveBeenCalled());
      expect(fake.widgets[0]).toMatchObject({ size: 'compact' });
    } finally {
      width.mockRestore();
    }
  });

  it('reports the token, its expiry and an error to the form', async () => {
    const fake = installFakeGrecaptcha();
    const onTokenChange = vi.fn();
    render(<RecaptchaField id="c" siteKey="k" onTokenChange={onTokenChange} />);
    await waitFor(() => expect(fake.grecaptcha.render).toHaveBeenCalled());

    fake.solve('t-1');
    expect(onTokenChange).toHaveBeenLastCalledWith('t-1');
    fake.expire();
    expect(onTokenChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('alert')).toHaveTextContent(CAPTCHA_TERMS.expired);
    fake.fail();
    expect(screen.getByRole('alert')).toHaveTextContent(
      CAPTCHA_TERMS.loadFailed,
    );
  });

  it('prefers the form’s message and resets through its handle', async () => {
    const fake = installFakeGrecaptcha();
    const ref = createRef<RecaptchaHandle>();
    const onTokenChange = vi.fn();
    render(
      <RecaptchaField
        id="c"
        siteKey="k"
        ref={ref}
        error="Отметьте «Я не робот»."
        onTokenChange={onTokenChange}
      />,
    );
    await waitFor(() => expect(fake.grecaptcha.render).toHaveBeenCalled());
    fake.expire();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Отметьте «Я не робот».',
    );

    act(() => ref.current!.reset());
    expect(fake.grecaptcha.reset).toHaveBeenCalledWith(0);
    expect(onTokenChange).toHaveBeenLastCalledWith(null);
  });
});

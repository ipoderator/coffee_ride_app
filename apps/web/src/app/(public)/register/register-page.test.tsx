import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SignInProvider } from '@/features/auth/oauth/api';

const providers = vi.hoisted(() => ({
  value: { google: true, yandex: true } as Record<SignInProvider, boolean>,
}));
vi.mock('@/features/auth/oauth/server-status', () => ({
  signInProviders: async () => providers.value,
}));

const { default: RegisterPage } = await import('./page');

async function renderPage(next?: string) {
  render(
    await RegisterPage({
      searchParams: Promise.resolve(next === undefined ? {} : { next }),
    }),
  );
}

// CR-262: `/register` laid out like the auth mockup's «Регистрация» tab.
describe('/register page', () => {
  beforeEach(() => {
    providers.value = { google: true, yandex: true };
  });

  it('puts Google and Yandex ID first, as equal «Продолжить с …» buttons keeping `next`', async () => {
    await renderPage('/rides/ride-1');

    const buttons = within(screen.getByTestId('oauth-sign-in')).getAllByRole(
      'link',
    );
    expect(buttons.map((link) => link.textContent)).toEqual([
      'Продолжить с Google',
      'Продолжить с Яндекс ID',
    ]);
    expect(buttons[0]).toHaveAttribute(
      'href',
      '/api/v1/auth/google?next=%2Frides%2Fride-1',
    );
    expect(buttons[1]).toHaveAttribute(
      'href',
      '/api/v1/auth/yandex?next=%2Frides%2Fride-1',
    );
    expect(screen.getByText('или создайте пароль')).toBeInTheDocument();
    expect(
      screen.getByText('Быстрее всего — через знакомый аккаунт.'),
    ).toBeInTheDocument();
  });

  it('keeps a safe `next` on «Войти» and drops an unsafe one', async () => {
    await renderPage('/rides/ride-1');
    expect(screen.getByRole('link', { name: 'Войти' })).toHaveAttribute(
      'href',
      '/login?next=%2Frides%2Fride-1',
    );
  });

  it.each(['https://evil.example/', '//evil.example', '/login'])(
    'drops the unsafe `next` %s everywhere',
    async (next) => {
      await renderPage(next);
      expect(screen.getByRole('link', { name: 'Войти' })).toHaveAttribute(
        'href',
        '/login',
      );
      for (const link of within(
        screen.getByTestId('oauth-sign-in'),
      ).getAllByRole('link')) {
        expect(link.getAttribute('href')).not.toContain('next=');
      }
    },
  );

  it('shows only the email form, with its own lead, when no provider is configured', async () => {
    providers.value = { google: false, yandex: false };
    await renderPage();
    expect(screen.queryByTestId('oauth-sign-in')).not.toBeInTheDocument();
    expect(screen.queryByText('или создайте пароль')).not.toBeInTheDocument();
    expect(
      screen.getByText('Создайте аккаунт по email и паролю.'),
    ).toBeInTheDocument();
  });

  // CR-269 (ADR-041): no «Создавая аккаунт, вы принимаете…» line — two separate,
  // unticked consents, each linking its own document, and the button waits.
  it('has one h1, the story as h2, and two separate unticked consents', async () => {
    await renderPage();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'От первого клика — до общего старта.',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/вы принимаете/)).not.toBeInTheDocument();
    const terms = screen.getByLabelText(/Я принимаю условия использования/);
    const data = screen.getByLabelText(
      /Я даю согласие на обработку персональных данных/,
    );
    expect(terms).not.toBeChecked();
    expect(data).not.toBeChecked();
    expect(
      screen.getByRole('link', { name: /^условия использования/ }),
    ).toHaveAttribute('href', '/terms');
    expect(
      screen.getByRole('link', {
        name: /^согласие на обработку персональных данных/,
      }),
    ).toHaveAttribute('href', '/personal-data-consent');
    expect(
      screen.getByRole('link', { name: /^политике конфиденциальности/ }),
    ).toHaveAttribute('href', '/privacy');
    expect(
      screen.getByRole('button', { name: 'Зарегистрироваться' }),
    ).toBeDisabled();
  });
});

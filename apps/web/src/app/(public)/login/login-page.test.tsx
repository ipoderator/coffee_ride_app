import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SignInProvider } from '@/features/auth/oauth/api';
import { SessionProvider } from '@/lib/auth/session-context';

const providers = vi.hoisted(() => ({
  value: { google: true, yandex: true } as Record<SignInProvider, boolean>,
}));
vi.mock('@/features/auth/oauth/server-status', () => ({
  signInProviders: async () => providers.value,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/lib/api/current-user', () => ({
  getCurrentUser: vi.fn(() => new Promise(() => {})),
  logout: vi.fn(),
}));

const { default: LoginPage } = await import('./page');

async function renderPage(params: Record<string, string> = {}) {
  render(
    <SessionProvider>
      {await LoginPage({ searchParams: Promise.resolve(params) })}
    </SessionProvider>,
  );
}

// CR-264: `/login` laid out like the auth mockup's «Вход» tab.
describe('/login page', () => {
  beforeEach(() => {
    providers.value = { google: true, yandex: true };
  });

  it('puts Google and Yandex ID first, as equal «Войти …» buttons keeping `next`', async () => {
    await renderPage({ next: '/rides/ride-1' });

    const buttons = within(screen.getByTestId('oauth-sign-in')).getAllByRole(
      'link',
    );
    expect(buttons.map((link) => link.textContent)).toEqual([
      'Войти через Google',
      'Войти с Яндекс ID',
    ]);
    expect(buttons[0]).toHaveAttribute(
      'href',
      '/api/v1/auth/google?next=%2Frides%2Fride-1',
    );
    expect(buttons[1]).toHaveAttribute(
      'href',
      '/api/v1/auth/yandex?next=%2Frides%2Fride-1',
    );
    expect(screen.getByText('или через email')).toBeInTheDocument();
    expect(
      screen.getByText('Выберите быстрый вход или используйте email.'),
    ).toBeInTheDocument();
    // The buttons come before the email form, as in the mockup.
    expect(
      buttons[1]!.compareDocumentPosition(screen.getByLabelText('Email')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('keeps a safe `next` on «Зарегистрироваться»', async () => {
    await renderPage({ next: '/rides/ride-1' });
    expect(
      screen.getByRole('link', { name: 'Зарегистрироваться' }),
    ).toHaveAttribute('href', '/register?next=%2Frides%2Fride-1');
  });

  it.each(['https://evil.example/', '//evil.example', '/login', '/\\evil'])(
    'drops the unsafe `next` %s everywhere',
    async (next) => {
      await renderPage({ next });
      expect(
        screen.getByRole('link', { name: 'Зарегистрироваться' }),
      ).toHaveAttribute('href', '/register');
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
    expect(screen.queryByText('или через email')).not.toBeInTheDocument();
    expect(screen.getByText('Войдите по email и паролю.')).toBeInTheDocument();
  });

  it('says why a provider sign-in came back without a session', async () => {
    await renderPage({ oauth: 'state', provider: 'yandex' });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Не удалось подтвердить вход через Яндекс. Нажмите «Войти с Яндекс ID» ещё раз.',
    );
  });

  it('ignores an unknown outcome', async () => {
    await renderPage({ oauth: '<script>', provider: 'yandex' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('has one h1, the story as h2, and the consent line with both legal links', async () => {
    await renderPage();
    expect(
      screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent),
    ).toEqual(['Вход']);
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Найдите свой следующий заезд.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'условия использования' }),
    ).toHaveAttribute('href', '/terms');
    expect(
      screen.getByRole('link', { name: 'политику конфиденциальности' }),
    ).toHaveAttribute('href', '/privacy');
  });
});

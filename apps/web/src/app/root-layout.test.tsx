import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/font/local', () => ({
  default: () => ({ variable: 'font' }),
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-nonce': 'n' }),
}));
vi.mock('next/script', () => ({ default: () => null }));
vi.mock('@/components/site/AppHeader', () => ({
  AppHeader: () => <header>site-header</header>,
}));
vi.mock('@/components/site/BottomTabBar', () => ({
  BottomTabBar: () => <nav>tab-bar</nav>,
}));
vi.mock('@/components/site/SiteChrome', () => ({
  SiteChrome: ({
    header,
    children,
  }: {
    header: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <>
      {header}
      {children}
    </>
  ),
}));
vi.mock('@/lib/auth/LegalAcceptanceGate', () => ({
  LegalAcceptanceGate: () => null,
}));
vi.mock('@/lib/auth/session-context', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-session="">{children}</div>
  ),
}));

const { default: RootLayout } = await import('./layout');

async function renderLayout() {
  return renderToStaticMarkup(await RootLayout({ children: <p>page</p> }));
}

// CR-265: during maintenance the screen stands alone — no header, no session
// lookup (it would call the API, which answers 503 too).
describe('root layout', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('wraps pages in the site frame normally', async () => {
    const html = await renderLayout();
    expect(html).toContain('site-header');
    expect(html).toContain('tab-bar');
    expect(html).toContain('data-session');
    expect(html).toContain('<p>page</p>');
  });

  it('renders the page alone while maintenance is on', async () => {
    vi.stubEnv('MAINTENANCE_MODE', 'true');
    const html = await renderLayout();
    expect(html).not.toContain('site-header');
    expect(html).not.toContain('tab-bar');
    expect(html).not.toContain('data-session');
    expect(html).toContain('<body><p>page</p></body>');
    expect(html).toContain('<html lang="ru"');
  });
});
